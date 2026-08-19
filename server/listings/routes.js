"use strict";

const express = require("express");
const { createRateLimiter } = require("../lib/rate-limit");
const { createListingsService } = require("./service");
const { userError } = require("./constants");

function sendError(res, err) {
  const status = err.status || 500;
  const message = err.expose ? err.message : "Something went wrong.";
  return res.status(status).json({ ok: false, error: message, code: err.expose ? err.code : "INTERNAL" });
}

function createListingsRouter(deps) {
  const router = express.Router();
  const limiter = deps.limiter || createRateLimiter();
  const service = deps.service || createListingsService(deps);
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
    const pass = Array.isArray(header) ? header[0] : header;
    if (!adminPassword || adminPassword.length < 8) {
      return sendError(res, userError("FORBIDDEN"));
    }
    if (pass !== adminPassword) {
      return sendError(res, userError("FORBIDDEN"));
    }
    next();
  }

  router.get("/api/listings", rate("listings", 120, 60 * 1000), async (req, res) => {
    try {
      const data = await service.list({
        status: req.query.status,
        minBeds: req.query.minBeds,
        maxPrice: req.query.maxPrice,
        q: req.query.q,
        sort: req.query.sort,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/listings/:id", rate("listings-get", 120, 60 * 1000), async (req, res) => {
    try {
      const listing = await service.get(req.params.id);
      return res.json({ ok: true, listing });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post("/api/admin/listings/sync", adminMiddleware, async (_req, res) => {
    try {
      const data = await service.sync();
      return res.json({ ok: true, count: data.listings.length, syncedAt: data.syncedAt });
    } catch (err) {
      return sendError(res, err);
    }
  });

  return router;
}

module.exports = { createListingsRouter };
