"use strict";

const express = require("express");
const { createRateLimiter } = require("../lib/rate-limit");
const { createProfitService } = require("./service");
const { CHURN_REASONS } = require("./constants");

function sendError(res, err) {
  const status = err.status || 500;
  const message = err.expose ? err.message : "Something went wrong.";
  return res.status(status).json({
    ok: false,
    error: message,
    code: err.expose ? err.code : "INTERNAL",
    liveCharging: false,
  });
}

function createProfitRouter(deps) {
  const router = express.Router();
  const limiter = deps.limiter || createRateLimiter();
  const service = deps.service || createProfitService(deps);
  const auth = deps.authMiddleware;
  const adminPassword = String(deps.adminPassword || "");

  function rate(key, max, windowMs) {
    return (req, res, next) => {
      const ip = req.ip || "unknown";
      if (!limiter.allow(`${key}:${ip}`, max, windowMs)) {
        return res.status(429).json({ ok: false, error: "Too many attempts. Try again later." });
      }
      next();
    };
  }

  function adminMiddleware(req, res, next) {
    const header = req.headers["x-admin-password"] || "";
    const bodyPass = req.body?.password || "";
    const pass = header || bodyPass;
    const jwtAdmin = req.auth?.role === "admin";
    if (jwtAdmin) return next();
    if (!adminPassword || adminPassword.length < 8) {
      return res.status(503).json({ ok: false, error: "Admin profit API is not configured." });
    }
    if (pass !== adminPassword) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    next();
  }

  router.get("/api/billing/catalog", (_req, res) => {
    return res.json({
      ok: true,
      liveCharging: false,
      ethics: service.publicEthics(),
      catalog: service.publicPlans(),
    });
  });

  router.get("/api/billing/ethics", (_req, res) => {
    return res.json({ ok: true, ethics: service.publicEthics() });
  });

  router.get("/api/professionals", (req, res) => {
    const category = req.query.category ? String(req.query.category) : undefined;
    return res.json({
      ok: true,
      marketplace: service.marketplaceStatus(),
      professionals: service.listProfessionals({ category }),
    });
  });

  router.get("/api/billing/me", auth, async (req, res) => {
    try {
      const data = await service.currentSubscription(req.auth.sub);
      return res.json({ ok: true, liveCharging: false, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/billing/can-use/:feature", auth, (req, res) => {
    const result = service.canUseFeature({ id: req.auth.sub }, req.params.feature);
    return res.json({ ok: true, ...result });
  });

  router.post("/api/billing/checkout", auth, rate("bill-co", 10, 15 * 60 * 1000), async (req, res) => {
    try {
      const data = await service.checkout(req.auth.sub, {
        planId: String(req.body?.planId || ""),
        billingPeriod: req.body?.billingPeriod === "annual" ? "annual" : "monthly",
        successUrl: req.body?.successUrl,
        cancelUrl: req.body?.cancelUrl,
        autoEnroll: req.body?.autoEnroll,
        hidePrice: req.body?.hidePrice,
        deceptiveTrial: req.body?.deceptiveTrial,
      });
      return res.status(201).json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/billing/sandbox/confirm", auth, rate("bill-cf", 10, 15 * 60 * 1000), async (req, res) => {
    try {
      const sessionId = String(req.body?.sessionId || req.query.session || "");
      const data = await service.confirmSandboxCheckout(sessionId, req.auth.sub);
      return res.json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/billing/cancel", auth, rate("bill-x", 10, 15 * 60 * 1000), async (req, res) => {
    try {
      const data = await service.cancel(req.auth.sub, {
        subscriptionId: req.body?.subscriptionId,
        reason: req.body?.reason,
        details: req.body?.details,
      });
      return res.json({ ok: true, churnReasons: CHURN_REASONS, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/billing/portal", auth, async (req, res) => {
    try {
      const data = await service.portal(req.auth.sub);
      return res.json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/leads/request-agent", auth, rate("lead", 10, 15 * 60 * 1000), (req, res) => {
    try {
      const data = service.requestAgentLead({
        userId: req.auth.sub,
        consent: !!req.body?.consent,
        message: req.body?.message,
        city: req.body?.city,
      });
      return res.status(201).json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/partners/click", auth, rate("pclick", 30, 60 * 1000), (req, res) => {
    try {
      const data = service.recordPartnerEvent({
        userId: req.auth.sub,
        partner_id: req.body?.partner_id,
        campaign_id: req.body?.campaign_id,
        category: req.body?.category,
        status: "clicked",
        disclosed: req.body?.disclosed !== false,
        selectedBecauseItPaysMore: req.body?.selectedBecauseItPaysMore,
      });
      return res.status(201).json({ ok: true, sandbox: true, event: data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/admin/profit", adminMiddleware, (req, res) => {
    try {
      const includeSandbox = req.body?.includeSandbox === true;
      return res.json({
        ok: true,
        liveCharging: false,
        founder: service.founderSnapshot(req.body?.founder || {}),
        economics: service.adminEconomics({ includeSandbox, signups: req.body?.signups, activeUsers: req.body?.activeUsers }),
        profitability: service.profitability(),
      });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/admin/profit/config", adminMiddleware, (req, res) => {
    try {
      const catalog = service.updateCatalog(req.body?.catalog || req.body || {});
      return res.json({ ok: true, liveCharging: false, catalog });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/admin/profit/revenue", adminMiddleware, (req, res) => {
    try {
      const row = service.recordRevenue({
        ...req.body,
        sandbox: req.body?.sandbox !== false,
      });
      return res.status(201).json({ ok: true, event: row });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/admin/profit/costs", adminMiddleware, (req, res) => {
    try {
      const row = service.recordCost({
        ...req.body,
        sandbox: req.body?.sandbox !== false,
      });
      return res.status(201).json({ ok: true, event: row });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/admin/economics/breakeven", adminMiddleware, (req, res) => {
    return res.json(service.breakEven(req.body || {}));
  });

  router.post("/api/admin/forecast", adminMiddleware, (req, res) => {
    return res.json(service.forecast(req.body || {}));
  });

  router.post("/api/admin/professionals", adminMiddleware, (req, res) => {
    try {
      const row = service.upsertProfessional(req.body || {});
      return res.json({ ok: true, professional: row });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/health/profit", (_req, res) => {
    return res.json({
      ok: true,
      service: "smart-realty-profit",
      liveCharging: false,
      liveMoneyMovement: "disabled",
      provider: service.provider.name,
      productionComplianceReview: "required",
    });
  });

  return router;
}

module.exports = { createProfitRouter };
