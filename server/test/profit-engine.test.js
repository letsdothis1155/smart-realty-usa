"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../index");
const { createStore } = require("../profit/store");
const { createProfitService } = require("../profit/service");
const { createBillingProvider } = require("../profit/billing");
const { createStripeBillingProvider } = require("../profit/billing/stripe");
const { canUse, checkLimit } = require("../profit/entitlements");
const { annualSavingsPercent, publicCatalog, defaultCatalog } = require("../profit/catalog");
const { breakEven } = require("../profit/breakeven");
const { forecast } = require("../profit/forecast");
const { recordRevenue } = require("../profit/ledger");
const { snapshot } = require("../profit/economics");

const JWT = "profit-test-secret-do-not-use-in-production-zz";
const ADMIN = "admin-test-password-xx";

function memoryUsers() {
  const users = [];
  return {
    createUser({ name, email, passwordHash }) {
      if (users.some((u) => u.email === email)) {
        const err = new Error("Email already registered");
        err.code = "EMAIL_TAKEN";
        throw err;
      }
      const user = {
        id: `u_${users.length + 1}`,
        name,
        email,
        passwordHash,
        role: "member",
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
    },
    findByEmail(email) {
      return users.find((u) => u.email === email) || null;
    },
    findById(id) {
      return users.find((u) => u.id === id) || null;
    },
    publicUser(u) {
      return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
    },
  };
}

function testConfig() {
  return {
    port: 0,
    jwtSecret: JWT,
    jwtDays: 1,
    demoPassword: "",
    corsOrigin: true,
    issues: [],
    serveStatic: false,
    adminPassword: ADMIN,
    directDeposit: {
      mode: "mock",
      webhookSecret: "webhook-test-secret-32-chars-min-xx",
      pinwheelApiSecret: "",
      sandboxAccountDetails: false,
      productionApproved: false,
      productionFinancialActivity: false,
    },
    billing: {
      mode: "mock",
      stripeSecretKey: "",
      productionApproved: false,
      liveCharging: false,
    },
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

async function json(url, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function bundle() {
  const users = memoryUsers();
  const profitStore = createStore({ memory: true });
  const app = createApp({
    config: testConfig(),
    users,
    ddMemory: true,
    profitStore,
    profitMemory: true,
    adminPassword: ADMIN,
    audit: { log() {} },
  });
  return { app, users, profitStore };
}

async function signup(base, email = "a@smartrealty.us") {
  const res = await json(`${base}/api/auth/register`, {
    method: "POST",
    body: { name: "Ada Member", email, password: "correct-horse-12" },
  });
  assert.equal(res.status, 201, res.data.error);
  return res.data;
}

test("catalog is public and live charging is off", async () => {
  const { app } = bundle();
  const srv = await listen(app);
  try {
    const res = await json(`${srv.url}/api/billing/catalog`);
    assert.equal(res.status, 200);
    assert.equal(res.data.liveCharging, false);
    assert.equal(res.data.catalog.plans.free.priceMonthlyCents, 0);
    assert.ok(res.data.catalog.plans.plus.features.includes("unlimited_property_goals"));
    assert.ok(res.data.ethics.neverSellBankingData);
  } finally {
    await srv.close();
  }
});

test("free users get genuine value and legally required info", () => {
  const free = { id: "u1" };
  const store = createStore({ memory: true });
  assert.equal(canUse(free, "direct_deposit_setup", { store }).ok, true);
  assert.equal(canUse(free, "legally_required_financial_info", { store }).ok, true);
  assert.equal(canUse(free, "basic_dashboard", { store }).ok, true);
  assert.equal(canUse(free, "unlimited_property_goals", { store }).ok, false);
  assert.equal(canUse(free, "ai_property_analysis", { store }).ok, false);
  const limit = checkLimit(free, "propertyGoals", 0, { store });
  assert.equal(limit.ok, true);
  assert.equal(limit.limit, 1);
  assert.equal(checkLimit(free, "propertyGoals", 1, { store }).ok, false);
});

test("plus entitlements unlock unlimited goals and SmartSplit", () => {
  const store = createStore({ memory: true });
  store.mutate((db) => {
    db.entitlements.push({
      userId: "u1",
      plan: "plus",
      status: "active",
      createdAt: new Date().toISOString(),
    });
  });
  assert.equal(canUse({ id: "u1" }, "unlimited_property_goals", { store }).ok, true);
  assert.equal(canUse({ id: "u1" }, "advanced_smartsplit", { store }).ok, true);
  assert.equal(checkLimit({ id: "u1" }, "propertyGoals", 12, { store }).ok, true);
});

test("pro includes portfolio analytics; business includes team accounts", () => {
  const store = createStore({ memory: true });
  store.mutate((db) => {
    db.entitlements.push({ userId: "p1", plan: "pro", status: "active" });
    db.entitlements.push({ userId: "b1", plan: "business", status: "active" });
  });
  assert.equal(canUse({ id: "p1" }, "portfolio_analytics", { store }).ok, true);
  assert.equal(canUse({ id: "p1" }, "crm", { store }).ok, true);
  assert.equal(canUse({ id: "b1" }, "team_accounts", { store }).ok, true);
  assert.equal(canUse({ id: "b1" }, "api_access", { store }).ok, false);
});

test("annual savings percent is the real math", () => {
  assert.equal(annualSavingsPercent(999, 9990), 16.7);
  assert.equal(annualSavingsPercent(1000, 1000 * 12), 0);
  assert.equal(annualSavingsPercent(0, 0), 0);
});

test("checkout requires auth and does not collect cards", async () => {
  const { app } = bundle();
  const srv = await listen(app);
  try {
    const denied = await json(`${srv.url}/api/billing/checkout`, { method: "POST", body: { planId: "plus" } });
    assert.equal(denied.status, 401);
    const user = await signup(srv.url);
    const co = await json(`${srv.url}/api/billing/checkout`, {
      method: "POST",
      token: user.token,
      body: { planId: "plus", billingPeriod: "annual" },
    });
    assert.equal(co.status, 201);
    assert.equal(co.data.liveCharging, false);
    assert.equal(co.data.cardCollected, false);
    assert.equal(co.data.plan.amountCents, defaultCatalog().plans.plus.priceAnnualCents);
    assert.match(co.data.url, /sandbox/);
  } finally {
    await srv.close();
  }
});

test("silent enrollment and deceptive trials are rejected", async () => {
  const { app } = bundle();
  const srv = await listen(app);
  try {
    const user = await signup(srv.url);
    const res = await json(`${srv.url}/api/billing/checkout`, {
      method: "POST",
      token: user.token,
      body: { planId: "plus", autoEnroll: true },
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, "BANNED_MONETIZATION");
    const trial = await json(`${srv.url}/api/billing/checkout`, {
      method: "POST",
      token: user.token,
      body: { planId: "plus", deceptiveTrial: true },
    });
    assert.equal(trial.status, 400);
  } finally {
    await srv.close();
  }
});

test("sandbox confirm grants plus without counting production revenue", async () => {
  const { app, profitStore } = bundle();
  const srv = await listen(app);
  try {
    const user = await signup(srv.url);
    const co = await json(`${srv.url}/api/billing/checkout`, {
      method: "POST",
      token: user.token,
      body: { planId: "plus" },
    });
    const sessionId = co.data.id;
    const done = await json(`${srv.url}/api/billing/sandbox/confirm`, {
      method: "POST",
      token: user.token,
      body: { sessionId },
    });
    assert.equal(done.status, 200);
    assert.equal(done.data.charged, false);
    const me = await json(`${srv.url}/api/billing/me`, { token: user.token });
    assert.equal(me.data.entitlements.plan, "plus");
    const founder = snapshot(profitStore, { includeSandbox: false });
    assert.equal(founder.revenue.netRevenue, 0);
    assert.equal(founder.unit.MRR, 0);
    const sandbox = snapshot(profitStore, { includeSandbox: true });
    assert.ok(sandbox.revenue.netRevenue > 0);
  } finally {
    await srv.close();
  }
});

test("cancellation is one call and does not require a reason", async () => {
  const { app } = bundle();
  const srv = await listen(app);
  try {
    const user = await signup(srv.url);
    const co = await json(`${srv.url}/api/billing/checkout`, {
      method: "POST",
      token: user.token,
      body: { planId: "plus" },
    });
    await json(`${srv.url}/api/billing/sandbox/confirm`, {
      method: "POST",
      token: user.token,
      body: { sessionId: co.data.id },
    });
    const canceled = await json(`${srv.url}/api/billing/cancel`, {
      method: "POST",
      token: user.token,
      body: {},
    });
    assert.equal(canceled.status, 200);
    assert.equal(canceled.data.canceled, true);
    assert.equal(canceled.data.friction, false);
    const me = await json(`${srv.url}/api/billing/me`, { token: user.token });
    assert.equal(me.data.entitlements.plan, "free");
  } finally {
    await srv.close();
  }
});

test("a user paycheck is refused as company revenue", () => {
  const store = createStore({ memory: true });
  assert.throws(
    () => recordRevenue(store, { revenueType: "subscription", source: "direct_deposit", grossAmountCents: 200000 }),
    /not SmartRealty revenue/
  );
  assert.throws(
    () =>
      recordRevenue(store, {
        revenueType: "other",
        source: "sale",
        grossAmountCents: 100,
        accountNumber: "123456789",
      }),
    /sensitive/
  );
});

test("break-even uses the documented formula", () => {
  const r = breakEven({
    monthlyFixedCostsCents: 100000,
    averageSubscriptionPriceCents: 999,
    grossMargin: 0.8,
  });
  assert.equal(r.ok, true);
  assert.equal(r.averageContributionPerSubscriberCents, 799);
  assert.equal(r.breakEvenSubscribers, Math.ceil(100000 / 799));
  const zero = breakEven({
    monthlyFixedCostsCents: 100000,
    averageSubscriptionPriceCents: 0,
    grossMargin: 0.8,
  });
  assert.equal(zero.breakEvenSubscribers, null);
});

test("forecasts are labeled as projections not guarantees", () => {
  const f = forecast({
    visitors: 1000,
    signupConversion: 0.2,
    paidConversion: 0.1,
    averageRevenueCents: 999,
    retention: 0.8,
    variableCostRate: 0.3,
    fixedCostsCents: 50000,
  });
  assert.equal(f.guarantee, false);
  assert.equal(f.projection, true);
  assert.ok(f.low.projectedRevenueCents <= f.base.projectedRevenueCents);
  assert.ok(f.base.projectedRevenueCents <= f.high.projectedRevenueCents);
});

test("lead matching requires consent and never attaches bank data", async () => {
  const { app } = bundle();
  const srv = await listen(app);
  try {
    const user = await signup(srv.url);
    const no = await json(`${srv.url}/api/leads/request-agent`, {
      method: "POST",
      token: user.token,
      body: { consent: false, message: "help" },
    });
    assert.equal(no.status, 400);
    assert.equal(no.data.code, "CONSENT_REQUIRED");
    const yes = await json(`${srv.url}/api/leads/request-agent`, {
      method: "POST",
      token: user.token,
      body: { consent: true, message: "I want help buying a home", city: "Louisville" },
    });
    assert.equal(yes.status, 201);
    assert.equal(yes.data.matchingEnabled, false);
    assert.equal(yes.data.financialDataAttached, false);
  } finally {
    await srv.close();
  }
});

test("Stripe adapter refuses live charging", async () => {
  const stripe = createStripeBillingProvider({
    stripeSecretKey: "sk_test_placeholder",
    productionApproved: false,
  });
  assert.equal(stripe.live, false);
  await assert.rejects(() => stripe.createCheckoutSession({}), /not live/);
  const store = createStore({ memory: true });
  const forced = createBillingProvider({ mode: "stripe", stripeSecretKey: "sk_live_example", productionApproved: false }, { store });
  assert.equal(forced.name, "mock");
  assert.equal(forced.forcedFromProvider, true);
});

test("founder dashboard stays at actual zero without sandbox bleed", async () => {
  const { app } = bundle();
  const srv = await listen(app);
  try {
    const user = await signup(srv.url);
    const co = await json(`${srv.url}/api/billing/checkout`, {
      method: "POST",
      token: user.token,
      body: { planId: "plus" },
    });
    await json(`${srv.url}/api/billing/sandbox/confirm`, {
      method: "POST",
      token: user.token,
      body: { sessionId: co.data.id },
    });
    const admin = await json(`${srv.url}/api/admin/profit`, {
      method: "POST",
      headers: { "X-Admin-Password": ADMIN },
      body: { password: ADMIN },
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.data.founder.mrrCents, 0);
    assert.equal(admin.data.founder.revenueThisMonthCents, 0);
    assert.equal(admin.data.founder.invented, false);
    assert.equal(admin.data.founder.liveCharging, false);
  } finally {
    await srv.close();
  }
});

test("admin catalog updates change prices without a deploy", async () => {
  const { app } = bundle();
  const srv = await listen(app);
  try {
    const upd = await json(`${srv.url}/api/admin/profit/config`, {
      method: "POST",
      headers: { "X-Admin-Password": ADMIN },
      body: { password: ADMIN, catalog: { plans: { plus: { priceMonthlyCents: 1200, priceAnnualCents: 12000 } } } },
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.data.catalog.plans.plus.priceMonthlyCents, 1200);
    assert.equal(upd.data.liveCharging, false);
    const cat = await json(`${srv.url}/api/billing/catalog`);
    assert.equal(cat.data.catalog.plans.plus.priceMonthlyCents, 1200);
  } finally {
    await srv.close();
  }
});

test("economics definitions are present and CAC is null with no spend", () => {
  const store = createStore({ memory: true });
  const service = createProfitService({ store, config: { billing: { mode: "mock" } } });
  const stats = service.adminEconomics({ includeSandbox: false });
  assert.equal(stats.unit.MRR, 0);
  assert.equal(stats.unit.CAC, null);
  assert.equal(stats.unit.LTV, null);
  assert.ok(stats.definitions.ContributionMargin.includes("Revenue"));
});

test("public catalog still lists plus as coming soon while free is live", () => {
  const cat = publicCatalog(defaultCatalog());
  assert.equal(cat.plans.free.live, true);
  assert.equal(cat.plans.plus.comingSoon, true);
  assert.equal(cat.liveCharging, false);
});
