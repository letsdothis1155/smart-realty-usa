/**
 * Smart Realty USA — Auth API
 *
 * Endpoints:
 *   GET  /health
 *   POST /api/auth/register  { name, email, password }
 *   POST /api/auth/login     { email, password }
 *   POST /api/auth/demo      { password }  — shared demo access
 *   GET  /api/auth/me        Authorization: Bearer <token>
 *
 * Run:  cd server && npm install && npm start
 * Port: AUTH_PORT or 8787
 */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { readConfig, assertRequiredConfig } = require("./config");

const runtimeConfig = readConfig();
assertRequiredConfig(runtimeConfig);
const PORT = runtimeConfig.port;
const JWT_SECRET = runtimeConfig.jwtSecret;
const JWT_DAYS = runtimeConfig.jwtDays;
const DEMO_PASSWORD = runtimeConfig.demoPassword;
const BCRYPT_ROUNDS = 12;

// Comma-separated origins, or * for local demos
const CORS_ORIGIN = runtimeConfig.corsOrigin;

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// --- helpers ---
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

// crude rate limit (per IP)
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

// --- routes ---
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "smart-realty-auth",
    time: new Date().toISOString(),
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
    const user = db.createUser({ name, email, passwordHash });
    const token = signToken({ sub: user.id, email: user.email, role: user.role, kind: "user" });

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

    const row = db.findByEmail(email);
    if (!row) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, row.passwordHash);
    if (!match) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    const user = db.publicUser(row);
    const token = signToken({ sub: user.id, email: user.email, role: user.role, kind: "user" });

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

/** Shared demo password → short-lived guest session (presenter / private demos) */
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
    const token = signToken({ sub: user.id, email: user.email, role: "demo", kind: "demo" });
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
  const row = db.findById(req.auth.sub);
  if (!row) {
    return res.status(401).json({ ok: false, error: "Account not found." });
  }
  return res.json({ ok: true, user: db.publicUser(row) });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Smart Realty Auth API → http://127.0.0.1:${PORT}`);
  console.log(`  POST /api/auth/register`);
  console.log(`  POST /api/auth/login`);
  console.log(`  POST /api/auth/demo`);
  console.log(`  GET  /api/auth/me`);
  if (!DEMO_PASSWORD) {
    console.log("  Demo access disabled (set DEMO_PASSWORD to enable it). ");
  }
});
