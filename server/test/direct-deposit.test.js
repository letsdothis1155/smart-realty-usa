"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createApp } = require("../index");
const { createStore } = require("../direct-deposit/store");
const { signPayload } = require("../lib/hmac");
const { maskAccountNumber, maskRoutingNumber, publicAccountView } = require("../lib/mask");
const { searchPayers } = require("../direct-deposit/payers");
const { createDirectDepositService } = require("../direct-deposit/service");
const { createMockDirectDepositProvider } = require("../direct-deposit/providers/mock");
const { createMockBankingProvider } = require("../direct-deposit/banking/mock");
const { createPinwheelDirectDepositProvider } = require("../direct-deposit/providers/pinwheel");
const { createDirectDepositProvider } = require("../direct-deposit/providers");

const JWT = "dd-test-secret-do-not-use-in-production-zz";
const HOOK = "webhook-test-secret-32-chars-min-xx";

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

function testConfig(extra = {}) {
  return {
    port: 0,
    jwtSecret: JWT,
    jwtDays: 1,
    demoPassword: "",
    corsOrigin: true,
    issues: [],
    serveStatic: false,
    directDeposit: {
      mode: "mock",
      webhookSecret: HOOK,
      pinwheelApiSecret: "",
      sandboxAccountDetails: false,
      productionApproved: false,
      productionFinancialActivity: false,
      ...extra,
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

async function signup(base, name, email) {
  const res = await json(`${base}/api/auth/register`, {
    method: "POST",
    body: { name, email, password: "correct-horse-12" },
  });
  assert.equal(res.status, 201, res.data.error);
  return res.data;
}

function appBundle(extraCfg = {}) {
  const users = memoryUsers();
  const store = createStore({ memory: true });
  const app = createApp({
    config: testConfig(extraCfg),
    users,
    ddStore: store,
    ddMemory: true,
    webhookSecret: HOOK,
    audit: { log() {} },
  });
  return { app, users, store };
}

test("unauthenticated dashboard is rejected", async () => {
  const { app } = appBundle();
  const srv = await listen(app);
  try {
    const res = await json(`${srv.url}/api/direct-deposit`);
    assert.equal(res.status, 401);
  } finally {
    await srv.close();
  }
});

test("payer search filters payroll and query", () => {
  const adp = searchPayers("adp", "payroll");
  assert.ok(adp.some((p) => p.id === "adp"));
  const gig = searchPayers("", "gig");
  assert.ok(gig.every((p) => p.type === "gig"));
  assert.ok(gig.some((p) => p.id === "uber"));
  const miss = searchPayers("zzzz-no-such-employer");
  assert.equal(miss.length, 0);
});

test("allocation validation", () => {
  const service = createDirectDepositService({
    store: createStore({ memory: true }),
    provider: createMockDirectDepositProvider(),
    banking: createMockBankingProvider(),
    users: memoryUsers(),
    audit: { log() {} },
  });
  assert.deepEqual(service.validateAllocation("entire"), { allocationType: "entire", allocationValue: 100 });
  assert.deepEqual(service.validateAllocation("percent", 25), { allocationType: "percent", allocationValue: 25 });
  assert.deepEqual(service.validateAllocation("fixed", 250), { allocationType: "fixed", allocationValue: 250 });
  assert.throws(() => service.validateAllocation("percent", 140), /percentage|percent|Choose/i);
  assert.throws(() => service.validateAllocation("fixed", 0), /Choose|fixed/i);
});

test("complete sandbox demo flow", async () => {
  const { app, store } = appBundle();
  const srv = await listen(app);
  try {
    const { token } = await signup(srv.url, "Andrew Test", "dd1@smartrealty.us");
    const dash0 = await json(`${srv.url}/api/direct-deposit`, { token });
    assert.equal(dash0.status, 200);
    assert.equal(dash0.data.status, "not_configured");
    assert.equal(dash0.data.productionFinancialActivity, false);

    const payers = await json(`${srv.url}/api/direct-deposit/payers?q=ADP&type=payroll`, { token });
    assert.ok(payers.data.payers.some((p) => p.id === "adp"));

    const sess = await json(`${srv.url}/api/direct-deposit/session`, { method: "POST", token, body: {} });
    assert.equal(sess.status, 201);
    assert.equal(sess.data.credentialCapture, "provider_hosted");

    const conn = await json(`${srv.url}/api/direct-deposit/session/${sess.data.sessionId}/connect`, {
      method: "POST",
      token,
      body: { payerId: "adp" },
    });
    assert.equal(conn.status, 200);
    assert.equal(conn.data.payer.name, "ADP");

    const sw = await json(`${srv.url}/api/direct-deposit/switch`, {
      method: "POST",
      token,
      headers: { "Idempotency-Key": "demo-1" },
      body: {
        connectionId: conn.data.connectionId,
        allocationType: "entire",
      },
    });
    assert.equal(sw.status, 201);
    assert.equal(sw.data.status, "pending");
    assert.equal(sw.data.fundsMoved, false);

    const again = await json(`${srv.url}/api/direct-deposit/switch`, {
      method: "POST",
      token,
      headers: { "Idempotency-Key": "demo-1" },
      body: {
        connectionId: conn.data.connectionId,
        allocationType: "entire",
      },
    });
    assert.equal(again.data.id, sw.data.id);

    const got = await json(`${srv.url}/api/direct-deposit/switch/${sw.data.id}`, { token });
    assert.equal(got.data.switch.status, "pending");

    const row = store.getSwitch(sw.data.id);
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_active_1",
      type: "switch.active",
      switch_id: row.provider_switch_id,
    });
    const sig = signPayload(HOOK, String(ts), payload);
    const hook = await fetch(`${srv.url}/api/webhooks/direct-deposit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SR-Webhook-Timestamp": String(ts),
        "X-SR-Webhook-Signature": `sha256=${sig}`,
      },
      body: payload,
    });
    assert.equal(hook.status, 200);
    const hookDup = await fetch(`${srv.url}/api/webhooks/direct-deposit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SR-Webhook-Timestamp": String(ts),
        "X-SR-Webhook-Signature": `sha256=${sig}`,
      },
      body: payload,
    });
    const dupBody = await hookDup.json();
    assert.equal(dupBody.duplicate, true);

    const after = await json(`${srv.url}/api/direct-deposit/switch/${sw.data.id}`, { token });
    assert.equal(after.data.switch.status, "active");
    assert.equal(after.data.fundsMoved, false);

    const cancel = await json(`${srv.url}/api/direct-deposit/switch/${sw.data.id}/cancel`, {
      method: "POST",
      token,
      body: {},
    });
    assert.equal(cancel.data.switch.status, "disabled");
  } finally {
    await srv.close();
  }
});

test("webhook rejects bad signature and replayed timestamps", async () => {
  const { app } = appBundle();
  const srv = await listen(app);
  try {
    const payload = JSON.stringify({ id: "evt_x", type: "switch.pending" });
    const bad = await fetch(`${srv.url}/api/webhooks/direct-deposit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SR-Webhook-Timestamp": String(Math.floor(Date.now() / 1000)),
        "X-SR-Webhook-Signature": "sha256=deadbeef",
      },
      body: payload,
    });
    assert.equal(bad.status, 401);

    const old = Math.floor(Date.now() / 1000) - 3600;
    const sig = signPayload(HOOK, String(old), payload);
    const replay = await fetch(`${srv.url}/api/webhooks/direct-deposit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SR-Webhook-Timestamp": String(old),
        "X-SR-Webhook-Signature": `sha256=${sig}`,
      },
      body: payload,
    });
    assert.equal(replay.status, 401);
  } finally {
    await srv.close();
  }
});

test("unauthorized user cannot read another member's switch", async () => {
  const { app } = appBundle();
  const srv = await listen(app);
  try {
    const a = await signup(srv.url, "User A", "a@smartrealty.us");
    const b = await signup(srv.url, "User B", "b@smartrealty.us");
    const sess = await json(`${srv.url}/api/direct-deposit/session`, { method: "POST", token: a.token, body: {} });
    const conn = await json(`${srv.url}/api/direct-deposit/session/${sess.data.sessionId}/connect`, {
      method: "POST",
      token: a.token,
      body: { payerId: "uber" },
    });
    const sw = await json(`${srv.url}/api/direct-deposit/switch`, {
      method: "POST",
      token: a.token,
      body: { connectionId: conn.data.connectionId, allocationType: "fixed", allocationValue: 250 },
    });
    const sneak = await json(`${srv.url}/api/direct-deposit/switch/${sw.data.id}`, { token: b.token });
    assert.equal(sneak.status, 403);
    const acc = await json(`${srv.url}/api/direct-deposit/account`, { token: b.token });
    assert.ok(!String(acc.data.account.accountNumber || "").includes("0000000004821"));
  } finally {
    await srv.close();
  }
});

test("provider errors stay user-safe", async () => {
  const { app } = appBundle();
  const srv = await listen(app);
  try {
    const { token } = await signup(srv.url, "Err User", "err@smartrealty.us");
    const sess = await json(`${srv.url}/api/direct-deposit/session`, { method: "POST", token, body: {} });
    const missing = await json(`${srv.url}/api/direct-deposit/session/${sess.data.sessionId}/connect`, {
      method: "POST",
      token,
      body: { payerId: "no-such-employer" },
    });
    assert.equal(missing.status, 404);
    assert.match(missing.data.error, /couldn't find/i);
    assert.equal(missing.data.error.includes("stack"), false);

    const unsup = await json(`${srv.url}/api/direct-deposit/session/${sess.data.sessionId}/connect`, {
      method: "POST",
      token,
      body: { payerId: "unsupported-payroll" },
    });
    assert.equal(unsup.status, 422);

    const fail = await json(`${srv.url}/api/direct-deposit/session/${sess.data.sessionId}/connect`, {
      method: "POST",
      token,
      body: { payerId: "fail-connect" },
    });
    assert.equal(fail.status, 422);

    const kyc = await json(`${srv.url}/api/direct-deposit/session/${sess.data.sessionId}/connect`, {
      method: "POST",
      token,
      body: { payerId: "kyc-required" },
    });
    assert.equal(kyc.status, 403);
  } finally {
    await srv.close();
  }
});

test("account numbers stay masked and unprovisioned by default", async () => {
  assert.equal(maskAccountNumber("0000000004821"), "•••• 4821");
  assert.equal(maskRoutingNumber("110000000"), "•••••0000");
  const view = publicAccountView({
    id: "x",
    displayName: "SmartRealty-linked account",
    last4: "4821",
    provisioned: false,
    sandbox: true,
    routingNumber: null,
    accountNumber: null,
  });
  assert.equal(view.routingNumber, null);
  assert.equal(view.revealed, false);

  const { app } = appBundle();
  const srv = await listen(app);
  try {
    const { token } = await signup(srv.url, "Mask User", "mask@smartrealty.us");
    const acc = await json(`${srv.url}/api/direct-deposit/account`, { token });
    assert.equal(acc.data.account.provisioned, false);
    assert.equal(acc.data.account.routingNumber, null);
    const reveal = await json(`${srv.url}/api/direct-deposit/account/reveal`, {
      method: "POST",
      token,
      body: { password: "wrong-password" },
    });
    assert.equal(reveal.status, 401);
    const reveal2 = await json(`${srv.url}/api/direct-deposit/account/reveal`, {
      method: "POST",
      token,
      body: { password: "correct-horse-12" },
    });
    assert.equal(reveal2.status, 409);
    assert.match(reveal2.data.error, /has not issued/i);
  } finally {
    await srv.close();
  }
});

test("pinwheel adapter and provider mode stay disabled without approvals", async () => {
  const pin = createPinwheelDirectDepositProvider({});
  await assert.rejects(() => pin.createConnectionSession("u1"), /not enabled/i);
  const forced = createDirectDepositProvider({ mode: "provider", pinwheelApiSecret: "", productionApproved: false });
  assert.equal(forced.name, "mock");
  assert.equal(forced.sandbox, true);
});

test("store never persists a password field", async () => {
  const store = createStore({ memory: true });
  store.addEvent({
    userId: "u1",
    eventType: "switch.created",
    metadata: { password: "should-not-store", token: "nope", payer: "adp" },
  });
  const ev = store.listEvents(null).concat(store.read().events);
  assert.ok(ev.every((e) => !e.metadata.password && !e.metadata.token));
});

test("duplicate open switch is rejected", async () => {
  const { app } = appBundle();
  const srv = await listen(app);
  try {
    const { token } = await signup(srv.url, "Dup User", "dup@smartrealty.us");
    const sess = await json(`${srv.url}/api/direct-deposit/session`, { method: "POST", token, body: {} });
    const conn = await json(`${srv.url}/api/direct-deposit/session/${sess.data.sessionId}/connect`, {
      method: "POST",
      token,
      body: { payerId: "lyft" },
    });
    const first = await json(`${srv.url}/api/direct-deposit/switch`, {
      method: "POST",
      token,
      body: { connectionId: conn.data.connectionId, allocationType: "percent", allocationValue: 40 },
    });
    assert.equal(first.status, 201);
    const sess2 = await json(`${srv.url}/api/direct-deposit/session`, { method: "POST", token, body: {} });
    const conn2 = await json(`${srv.url}/api/direct-deposit/session/${sess2.data.sessionId}/connect`, {
      method: "POST",
      token,
      body: { payerId: "lyft" },
    });
    const dup = await json(`${srv.url}/api/direct-deposit/switch`, {
      method: "POST",
      token,
      body: { connectionId: conn2.data.connectionId, allocationType: "percent", allocationValue: 10 },
    });
    assert.equal(dup.status, 409);
  } finally {
    await srv.close();
  }
});

test("mobile page has a11y and touch-target CSS", () => {
  const root = path.resolve(__dirname, "../..");
  const html = fs.readFileSync(path.join(root, "direct-deposit/app/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "direct-deposit/styles.css"), "utf8");
  const app = fs.readFileSync(path.join(root, "js/direct-deposit/app.js"), "utf8");
  const components = fs.readFileSync(path.join(root, "js/direct-deposit/components.js"), "utf8");
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /Skip to content/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Sandbox/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /360|430/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /dd-skeleton|dd-skel/);
  assert.match(components, /function PayerSearch/);
  assert.match(components, /function DirectDepositDashboard/);
  assert.match(components, /function SensitiveAccountDetails/);
  assert.match(app, /Get Started|Confirm Direct Deposit/);
  assert.match(html, /SmartRealty is not a bank/);
});
