/**
 * Smart Realty USA — Auth + Direct Deposit API
 *
 * Auth:
 *   GET  /health
 *   POST /api/auth/register  { name, email, password }
 *   POST /api/auth/login     { email, password }
 *   POST /api/auth/demo      { password }
 *   GET  /api/auth/me        Authorization: Bearer <token>
 *
 * Direct Deposit (sandbox/mock by default; production money movement DISABLED):
 *   GET  /api/direct-deposit
 *   POST /api/direct-deposit/session
 *   GET  /api/direct-deposit/payers
 *   POST /api/direct-deposit/session/:id/connect
 *   POST /api/direct-deposit/switch
 *   GET  /api/direct-deposit/switch/:id
 *   POST /api/direct-deposit/switch/:id/cancel
 *   GET  /api/direct-deposit/account
 *   POST /api/direct-deposit/account/reveal
 *   POST /api/webhooks/direct-deposit
 *
 * Billing / profit (live charging DISABLED):
 *   GET  /api/billing/catalog
 *   GET  /api/billing/me
 *   POST /api/billing/checkout
 *   POST /api/billing/cancel
 *   POST /api/admin/profit
 *
 * Run:  cd server && npm install && npm start
 * Port: AUTH_PORT or 8787
 */
const path = require("node:path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { readConfig, assertRequiredConfig } = require("./config");
const { createAuditLogger } = require("./lib/audit");
const { createStore } = require("./direct-deposit/store");
const { createDirectDepositProvider } = require("./direct-deposit/providers");
const { createBankingProvider } = require("./direct-deposit/banking");
const { createDirectDepositRouter } = require("./direct-deposit/routes");
const { createStore: createProfitStore } = require("./profit/store");
const { createProfitRouter } = require("./profit/routes");
const { createBillingProvider } = require("./profit/billing");
const { createProfitService } = require("./profit/service");

const BCRYPT_ROUNDS = 12;

function createApp(options = {}) {
  const runtimeConfig = options.config || readConfig();
  const JWT_SECRET = runtimeConfig.jwtSecret;
  const JWT_DAYS = runtimeConfig.jwtDays;
  const DEMO_PASSWORD = runtimeConfig.demoPassword;
  const CORS_ORIGIN = runtimeConfig.corsOrigin;
  const users = options.users || db;
  const ddConfig = runtimeConfig.directDeposit || {};

  const app = express();
  app.set("trust proxy", 1);
  app.use(
    express.json({
      limit: "32kb",
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
      },
    })
  );
  app.use(
    cors({
      origin: CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Idempotency-Key",
        "X-SR-Webhook-Signature",
        "X-SR-Webhook-Timestamp",
        "X-Admin-Password",
      ],
    })
  );

  function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: `${JWT_DAYS}d` });
  }

  function authMiddleware(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      return res.status(401).json({ ok: false, error: "Not signed in" });
    }
    try {
      req.auth = jwt.verify(token, JWT_SECRET);
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
    const e = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
    return e;
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
      service: "smart-realty-auth",
      time: new Date().toISOString(),
      directDeposit: {
        mode: ddConfig.mode || "mock",
        productionFinancialActivity: false,
      },
      billing: {
        mode: (runtimeConfig.billing && runtimeConfig.billing.mode) || "mock",
        liveCharging: false,
      },
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
      const pwErr = validatePassword(password);
      if (pwErr) return res.status(400).json({ ok: false, error: pwErr });

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = users.createUser({ name, email, passwordHash });
      const token = signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        kind: "user",
      });

      return res.status(201).json({
        ok: true,
        token,
        user,
        message: "Account created. Welcome to Smart Realty USA.",
      });
    } catch (err) {
      if (err.code === "EMAIL_TAKEN") {
        return res.status(409).json({ ok: false, error: "That email is already registered. Sign in instead." });
      }
      console.error("register error", err);
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
      if (!row) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }

      const match = await bcrypt.compare(password, row.passwordHash);
      if (!match) {
        return res.status(401).json({ ok: false, error: "Invalid email or password." });
      }

      const user = users.publicUser(row);
      const token = signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        kind: "user",
      });

      return res.json({
        ok: true,
        token,
        user,
        message: `Welcome back, ${user.name.split(" ")[0]}.`,
      });
    } catch (err) {
      console.error("login error", err);
      return res.status(500).json({ ok: false, error: "Sign-in failed." });
    }
  });

  app.post("/api/auth/demo", async (req, res) => {
    try {
      if (!DEMO_PASSWORD || runtimeConfig.issues.includes("demo_password_weak")) {
        return res.status(503).json({
          ok: false,
          error: "Demo access is not configured.",
        });
      }
      const ip = req.ip || "unknown";
      if (!rateLimit(`demo:${ip}`, 40, 15 * 60 * 1000)) {
        return res.status(429).json({ ok: false, error: "Too many attempts." });
      }
      const password = req.body?.password;
      if (password !== DEMO_PASSWORD) {
        return res.status(401).json({ ok: false, error: "Incorrect demo password." });
      }
      const user = {
        id: "demo",
        name: "Demo Guest",
        email: "demo@smartrealty.us",
        role: "demo",
        createdAt: new Date().toISOString(),
      };
      const token = signToken({
        sub: user.id,
        email: user.email,
        role: "demo",
        name: user.name,
        kind: "demo",
      });
      return res.json({
        ok: true,
        token,
        user,
        message: "Demo unlocked.",
      });
    } catch (err) {
      console.error("demo error", err);
      return res.status(500).json({ ok: false, error: "Demo unlock failed." });
    }
  });

  app.get("/api/auth/me", authMiddleware, (req, res) => {
    if (req.auth.kind === "demo" || req.auth.sub === "demo") {
      return res.json({
        ok: true,
        user: {
          id: "demo",
          name: "Demo Guest",
          email: "demo@smartrealty.us",
          role: "demo",
        },
      });
    }
    const row = users.findById(req.auth.sub);
    if (!row) {
      return res.status(401).json({ ok: false, error: "Account not found." });
    }
    return res.json({ ok: true, user: users.publicUser(row) });
  });

  const store = options.ddStore || createStore({
    memory: !!options.ddMemory,
    dataDir: options.ddDataDir || path.join(__dirname, "data"),
  });
  const provider = options.ddProvider || createDirectDepositProvider(ddConfig);
  const banking = options.ddBanking || createBankingProvider(ddConfig);
  const audit = options.audit || createAuditLogger();

  app.use(
    createDirectDepositRouter({
      authMiddleware,
      store,
      provider,
      banking,
      users,
      audit,
      webhookSecret: options.webhookSecret || ddConfig.webhookSecret,
    })
  );

  const profitStore =
    options.profitStore ||
    createProfitStore({
      memory: !!options.profitMemory || (!options.profitDataDir && !!options.ddMemory),
      dataDir: options.profitDataDir || path.join(__dirname, "data"),
    });
  const billingCfg = runtimeConfig.billing || { mode: "mock", productionApproved: false };
  const billingProvider = options.billingProvider || createBillingProvider(billingCfg, { store: profitStore });
  const profitService =
    options.profitService ||
    createProfitService({ store: profitStore, billing: billingProvider, config: { billing: billingCfg } });

  app.use(
    createProfitRouter({
      authMiddleware,
      store: profitStore,
      service: profitService,
      adminPassword: options.adminPassword || runtimeConfig.adminPassword || "",
      stripeWebhookSecret: billingCfg.stripeWebhookSecret || "",
    })
  );

  if (runtimeConfig.serveStatic || options.serveStatic) {
    const root = path.join(__dirname, "..");
    app.use(express.static(root));
  }

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: "Not found" });
  });

  return app;
}

function start(options = {}) {
  const runtimeConfig = options.config || readConfig();
  assertRequiredConfig(runtimeConfig);
  const app = createApp({ ...options, config: runtimeConfig });
  const PORT = runtimeConfig.port;
  return app.listen(PORT, () => {
    console.log(`Smart Realty Auth API → http://127.0.0.1:${PORT}`);
    console.log(`  POST /api/auth/register`);
    console.log(`  POST /api/auth/login`);
    console.log(`  POST /api/auth/demo`);
    console.log(`  GET  /api/auth/me`);
    console.log(`  GET  /api/direct-deposit  (mode=${runtimeConfig.directDeposit.mode}, production=DISABLED)`);
    console.log(`  GET  /api/billing/catalog  (live charging=DISABLED)`);
    if (!runtimeConfig.demoPassword) {
      console.log("  Demo access disabled (set DEMO_PASSWORD to enable it). ");
    }
    if (runtimeConfig.serveStatic) {
      console.log(`  Static site → http://127.0.0.1:${PORT}/direct-deposit/`);
    }
  });
}

if (require.main === module) {
  start();
}

module.exports = { createApp, start };
