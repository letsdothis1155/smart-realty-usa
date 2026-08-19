"use strict";

const express = require("express");
const { createRateLimiter } = require("../lib/rate-limit");
const { createDirectDepositService } = require("./service");
const { createWebhookHandler } = require("./webhooks");
const { userError } = require("./constants");

function sendError(res, err) {
  const status = err.status || 500;
  const message = err.expose ? err.message : "Something went wrong. No funds were moved.";
  return res.status(status).json({
    ok: false,
    error: message,
    code: err.expose ? err.code : "INTERNAL",
    sandbox: true,
    fundsMoved: false,
  });
}

function createDirectDepositRouter(deps) {
  const router = express.Router();
  const limiter = deps.limiter || createRateLimiter();
  const service = createDirectDepositService(deps);
  const webhooks = createWebhookHandler({
    store: deps.store,
    audit: deps.audit,
    webhookSecret: deps.webhookSecret,
  });
  const auth = deps.authMiddleware;

  function rate(key, max, windowMs) {
    return (req, res, next) => {
      const ip = req.ip || "unknown";
      if (!limiter.allow(`${key}:${ip}`, max, windowMs)) {
        return res.status(429).json({ ok: false, error: "Too many attempts. Try again later." });
      }
      next();
    };
  }

  router.get("/api/direct-deposit", auth, async (req, res) => {
    try {
      const data = await service.getDashboard(req.auth.sub, {
        name: req.auth.name,
        role: req.auth.role,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/direct-deposit/session", auth, rate("dd-sess", 20, 15 * 60 * 1000), async (req, res) => {
    try {
      const data = await service.createSession(req.auth.sub);
      return res.status(201).json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/direct-deposit/payers", auth, rate("dd-payers", 60, 60 * 1000), async (req, res) => {
    try {
      const payers = await service.searchPayers(req.query.q, req.query.type);
      return res.json({ ok: true, sandbox: true, payers });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/direct-deposit/session/:id/connect", auth, rate("dd-conn", 20, 15 * 60 * 1000), async (req, res) => {
    try {
      const payerId = String(req.body?.payerId || "");
      if (!payerId) throw userError("EMPLOYER_NOT_FOUND");
      const data = await service.connectSession(req.auth.sub, req.params.id, payerId);
      return res.json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/direct-deposit/switch", auth, rate("dd-sw", 15, 15 * 60 * 1000), async (req, res) => {
    try {
      const data = await service.createSwitch(req.auth.sub, { name: req.auth.name, role: req.auth.role }, {
        connectionId: req.body?.connectionId,
        allocationType: req.body?.allocationType,
        allocationValue: req.body?.allocationValue,
        destinationAccountId: req.body?.destinationAccountId,
        smartSplit: req.body?.smartSplit,
        buckets: req.body?.buckets,
        autoInvest: req.body?.autoInvest,
        idempotencyKey: req.get("idempotency-key"),
      });
      return res.status(201).json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/direct-deposit/switch/:id", auth, (req, res) => {
    try {
      const data = service.getSwitch(req.auth.sub, req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: "Direct Deposit setup not found." });
      return res.json({ ok: true, switch: data, sandbox: true, fundsMoved: false });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/direct-deposit/switch/:id/cancel", auth, rate("dd-cancel", 10, 15 * 60 * 1000), async (req, res) => {
    try {
      const data = await service.cancelSwitch(req.auth.sub, req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: "Direct Deposit setup not found." });
      return res.json({ ok: true, switch: data, sandbox: true });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/direct-deposit/account", auth, async (req, res) => {
    try {
      const account = await service.getAccount(req.auth.sub, { name: req.auth.name });
      return res.json({ ok: true, account, sandbox: true });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/direct-deposit/account/reveal", auth, rate("dd-reveal", 8, 15 * 60 * 1000), async (req, res) => {
    try {
      const account = await service.revealAccount(req.auth.sub, { name: req.auth.name, role: req.auth.role }, req.body?.password);
      return res.json({ ok: true, account, sandbox: true });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/webhooks/direct-deposit", rate("dd-hook", 120, 60 * 1000), (req, res) => {
    const verified = webhooks.verify(req);
    if (!verified.ok) {
      deps.audit.log("dd.webhook.rejected", { code: verified.error, sandbox: true });
      return res.status(401).json({ ok: false, error: "Invalid webhook signature." });
    }
    const result = webhooks.apply(req.body || {});
    return res.status(result.status).json({
      ok: result.ok,
      duplicate: !!result.duplicate,
      error: result.error,
    });
  });

  return router;
}

module.exports = { createDirectDepositRouter };
