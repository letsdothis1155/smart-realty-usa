/**
 * Smart Realty USA — Auth + Listings API
 *
 * Listings use labeled sample data by default. Live MLS data remains disabled
 * until Smart Realty has a signed IDX/MLS data-license agreement.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { readConfig, assertRequiredConfig } = require("./config");
const { createStore: createListingsStore } = require("./listings/store");
const { createListingsProvider } = require("./listings/providers");
const { createListingsService } = require("./listings/service");
const { createListingsRouter } = require("./listings/routes");
const { startPropertySyncScheduler } = require("./listings/scheduler");

const BCRYPT_ROUNDS = 12;

function createApp(options = {}) {
  const runtimeConfig = options.config || readConfig();
  const jwtSecret = runtimeConfig.jwtSecret;
  const jwtDays = runtimeConfig.jwtDays;
  const demoPassword = runtimeConfig.demoPassword;
  const users = options.users || db;

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "32kb" }));
  app.use(
    cors({
      origin: runtimeConfig.corsOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Password"],
    }),
  );

  function signToken(payload) {
    return jwt.sign(payload, jwtSecret, { expiresIn: `${jwtDays}d` });
  }

  function authMiddleware(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ ok: false, error: "Not signed in" });
    try {
      req.auth = jwt.verify(token, jwtSecret);
      next();
    } catch {
      return res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
    }
  }

  function validatePassword(password) {
    if (typeof password !== "string" || password.length < 8) {
      return "Password must be at least 8 characters.";
    }
    if (password.length > 128) return "Password is too long.";
    return null;
  }

  function validateEmail(email) {
    const value = String(email || "").trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
  }

  const hits = new Map();
  function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const row = hits.get(key) || { n: 0, reset: now + windowMs };
    if (now > row.reset) {
      row.n = 0;
      row.reset = now + windowMs;
    }
    row.n += 1;
    hits.set(key, row);
    return row.n <= max;
  }

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "smart-realty-auth-listings",
      time: new Date().toISOString(),
      listings: { mode: runtimeConfig.listings?.mode || "mock", liveMlsData: false },
    });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const ip = req.ip || "unknown";
      if (!rateLimit(`reg:${ip}`, 10, 15 * 60 * 1000)) {
        return res.status(429).json({ ok: false, error: "Too many sign-ups. Try again later." });
      }
      const name = String(req.body?.name || "").trim();
      const email = validateEmail(req.body?.email);
      const password = req.body?.password;
      if (!name || name.length < 2) {
        return res.status(400).json({ ok: false, error: "Please enter your name." });
      }
      if (!email) {
        return res.status(400).json({ ok: false, error: "Please enter a valid email." });
      }
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ ok: false, error: passwordError });

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = users.createUser({ name, email, passwordHash });
      const token = signToken({ sub: user.id, email: user.email, role: user.role, kind: "user" });
      return res.status(201).json({
        ok: true,
        token,
        user,
        message: "Account created. Welcome to Smart Realty USA.",
      });
    } catch (error) {
      if (error.code === "EMAIL_TAKEN") {
        return res.status(409).json({ ok: false, error: "That email is already registered. Sign in instead." });
      }
      console.error("register error", error);
      return res.status(500).json({ ok: false, error: "Could not create account." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const ip = req.ip || "unknown";
      if (!rateLimit(`login:${ip}`, 30, 15 * 60 * 1000)) {
        return res.status(429).json({ ok: false, error: "Too many attempts. Try again later." });
      }
      const email = validateEmail(req.body?.email);
      const password = req.body?.password;
      if (!email || typeof password !== "string") {
        return res.status(400).json({ ok: false, error: "Email and password required." });
      }
      const row = users.findByEmail(email);
      if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }
      const user = users.publicUser(row);
      const token = signToken({ sub: user.id, email: user.email, role: user.role, kind: "user" });
      return res.json({ ok: true, token, user, message: `Welcome back, ${user.name.split(" ")[0]}.` });
    } catch (error) {
      console.error("login error", error);
      return res.status(500).json({ ok: false, error: "Sign-in failed." });
    }
  });

  app.post("/api/auth/demo", async (req, res) => {
    try {
      if (!demoPassword || runtimeConfig.issues.includes("demo_password_weak")) {
        return res.status(503).json({ ok: false, error: "Demo access is not configured." });
      }
      const ip = req.ip || "unknown";
      if (!rateLimit(`demo:${ip}`, 40, 15 * 60 * 1000)) {
        return res.status(429).json({ ok: false, error: "Too many attempts." });
      }
      if (req.body?.password !== demoPassword) {
        return res.status(401).json({ ok: false, error: "Incorrect demo password." });
      }
      const user = {
        id: "demo",
        name: "Demo Guest",
        email: "demo@smartrealty.us",
        role: "demo",
        createdAt: new Date().toISOString(),
      };
      const token = signToken({ sub: user.id, email: user.email, role: "demo", kind: "demo" });
      return res.json({ ok: true, token, user, message: "Demo unlocked." });
    } catch (error) {
      console.error("demo error", error);
      return res.status(500).json({ ok: false, error: "Demo unlock failed." });
    }
  });

  app.get("/api/auth/me", authMiddleware, (req, res) => {
    if (req.auth.kind === "demo" || req.auth.sub === "demo") {
      return res.json({
        ok: true,
        user: { id: "demo", name: "Demo Guest", email: "demo@smartrealty.us", role: "demo" },
      });
    }
    const row = users.findById(req.auth.sub);
    if (!row) return res.status(401).json({ ok: false, error: "Account not found." });
    return res.json({ ok: true, user: users.publicUser(row) });
  });

  const listingsConfig = runtimeConfig.listings || { mode: "mock" };
  const listingsStore =
    options.listingsStore ||
    createListingsStore({
      memory: Boolean(options.listingsMemory || (!options.listingsDataDir && options.memory)),
      dataDir: options.listingsDataDir || path.join(__dirname, "data"),
    });
  const listingsProvider = options.listingsProvider || createListingsProvider(listingsConfig);
  const listingsService =
    options.listingsService ||
    createListingsService({
      store: listingsStore,
      provider: listingsProvider,
      syncOptions: {
        streetViewKey: listingsConfig.streetViewKey || "",
        streetViewMetadataBudget: listingsConfig.streetViewMetadataBudget,
        streetViewStaticBudget: listingsConfig.streetViewStaticBudget,
        absentStreakLimit: listingsConfig.absentStreakLimit,
        intervalMs: listingsConfig.syncIntervalMs,
      },
    });

  app.use(
    createListingsRouter({
      service: listingsService,
      adminPassword: options.adminPassword || runtimeConfig.adminPassword || "",
    }),
  );
  app.locals.listingsService = listingsService;

  if (runtimeConfig.serveStatic || options.serveStatic) {
    app.use(express.static(path.join(__dirname, "..")));
  }
  app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));
  return app;
}

function start(options = {}) {
  const runtimeConfig = options.config || readConfig();
  assertRequiredConfig(runtimeConfig);
  const app = createApp({ ...options, config: runtimeConfig });
  const listingsConfig = runtimeConfig.listings || {};
  const server = app.listen(runtimeConfig.port, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : runtimeConfig.port;
    console.log(`Smart Realty API → http://127.0.0.1:${port}`);
    console.log(`  GET  /api/listings  (mode=${listingsConfig.mode || "mock"}, live MLS data=DISABLED)`);
  });

  let scheduler = null;
  if (!listingsConfig.disableHourlySync && !options.disableHourlySync && app.locals.listingsService?.job) {
    scheduler = startPropertySyncScheduler(
      { run: (syncOptions) => app.locals.listingsService.sync(syncOptions) },
      { intervalMs: listingsConfig.syncIntervalMs, runOnStart: options.syncOnStart !== false },
    );
  }
  server.propertySyncScheduler = scheduler;
  return server;
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  let source;
  try {
    source = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(equals + 1).trim();
  }
}

if (require.main === module) {
  loadDotEnv();
  start();
}

module.exports = { createApp, start };
