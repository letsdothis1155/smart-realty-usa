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
        minBaths: req.query.minBaths,
        minPrice: req.query.minPrice,
        maxPrice: req.query.maxPrice,
        propertyType: req.query.propertyType,
        minSqft: req.query.minSqft,
        maxSqft: req.query.maxSqft,
        city: req.query.city,
        exactCity: req.query.exactCity,
        q: req.query.q,
        sort: req.query.sort,
        limit: req.query.limit,
        offset: req.query.offset,
        lat: req.query.lat,
        lng: req.query.lng,
        userLat: req.query.userLat,
        userLng: req.query.userLng,
        deal: req.query.deal,
        neighborhood: req.query.neighborhood,
        radiusMiles: req.query.radius || req.query.radiusMiles,
        listedWithinDays: req.query.listedWithin || req.query.listedWithinDays,
        west: req.query.west,
        south: req.query.south,
        east: req.query.east,
        north: req.query.north,
        listingKind: req.query.listingKind,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/deals", rate("deals", 60, 60 * 1000), async (req, res) => {
    try {
      if (!service.deals) return res.json({ ok: true, listings: [], groups: [] });
      const data = await service.deals({
        q: req.query.q,
        deal: req.query.deal,
        limit: req.query.limit,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/coverage", rate("coverage", 60, 60 * 1000), async (_req, res) => {
    try {
      if (!service.coverage) return res.json({ ok: true, total: 0, cities: [] });
      return res.json({ ok: true, ...(await service.coverage()) });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/locations", rate("locations", 60, 60 * 1000), async (req, res) => {
    try {
      const catalog = service.locations;
      const q = String(req.query.q || "").trim();
      if (q && catalog) {
        const hit = catalog.resolve(q);
        return res.json({ ok: true, match: hit, places: hit ? [hit] : [] });
      }
      const places = catalog ? catalog.allPlaces() : [];
      return res.json({ ok: true, count: places.length, places });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/locations/:slug", rate("locations-slug", 60, 60 * 1000), async (req, res) => {
    try {
      if (!service.cityPage) return res.status(404).json({ ok: false, error: "Not found" });
      return res.json({ ok: true, ...(await service.cityPage(req.params.slug)) });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/admin/coverage", adminMiddleware, async (_req, res) => {
    try {
      const data = service.coverage ? await service.coverage() : {};
      const sync = service.syncStatus ? service.syncStatus() : {};
      return res.json({ ok: true, ...data, sync });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get("/api/listings/:id/street-view", rate("listings-sv", 60, 60 * 1000), async (req, res) => {
    try {
      if (!service.streetViewImage) {
        return res.status(404).json({ ok: false, error: "Street View is not available." });
      }
      const img = await service.streetViewImage(req.params.id);
      res.setHeader("Content-Type", img.contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("X-Street-View-Attribution", img.attribution || "© Google");
      if (img.heading != null) res.setHeader("X-Street-View-Heading", String(img.heading));
      return res.end(img.bytes);
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

  router.get("/api/admin/listings/sync", adminMiddleware, async (_req, res) => {
    try {
      return res.json({ ok: true, ...(service.syncStatus ? service.syncStatus() : {}) });
    } catch (err) {
      return sendError(res, err);
    }
  });

  let syncInFlight = false;
  router.post("/api/admin/listings/sync", adminMiddleware, async (_req, res) => {
    if (syncInFlight) {
      return res.status(409).json({ ok: false, error: "A property sync is already running.", code: "SYNC_LOCKED" });
    }
    syncInFlight = true;
    try {
      const data = await service.sync({ trigger: "manual" });
      if (data.skipped) {
        return res.status(409).json({ ok: false, error: "A property sync is already running.", code: "SYNC_LOCKED" });
      }
      return res.json({ ok: true, ...data });
    } catch (err) {
      return sendError(res, err);
    } finally {
      syncInFlight = false;
    }
  });

  return router;
}

module.exports = { createListingsRouter };
