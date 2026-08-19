"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readConfig, assertRequiredConfig } = require("../config");

test("missing JWT secret fails closed", () => {
  const config = readConfig({});
  assert.throws(() => assertRequiredConfig(config), /JWT_SECRET/);
});

test("placeholder JWT secret fails closed", () => {
  const config = readConfig({ JWT_SECRET: "change-me-change-me-change-me-change-me" });
  assert.throws(() => assertRequiredConfig(config), /JWT_SECRET/);
});

test("the committed env.example JWT placeholder fails closed even though it's 32+ chars", () => {
  const config = readConfig({ JWT_SECRET: "replace-with-a-long-random-secret-at-least-32-chars" });
  assert.throws(() => assertRequiredConfig(config), /JWT_SECRET/);
});

test("strong JWT secret enables account auth without demo access", () => {
  const config = readConfig({ JWT_SECRET: "9f8e7d6c5b4a32109f8e7d6c5b4a3210" });
  assert.doesNotThrow(() => assertRequiredConfig(config));
  assert.equal(config.demoPassword, "");
  assert.deepEqual(config.issues, []);
});

test("weak optional demo password is rejected", () => {
  const config = readConfig({
    JWT_SECRET: "9f8e7d6c5b4a32109f8e7d6c5b4a3210",
    DEMO_PASSWORD: "too-short",
  });
  assert.ok(config.issues.includes("demo_password_weak"));
});

test("previously published demo password is rejected", () => {
  const config = readConfig({
    JWT_SECRET: "9f8e7d6c5b4a32109f8e7d6c5b4a3210",
    DEMO_PASSWORD: ["Smart", "Realty2026"].join(""),
  });
  assert.ok(config.issues.includes("demo_password_weak"));
});

test("billing production stays off even if env asks for stripe", () => {
  const config = readConfig({
    JWT_SECRET: "9f8e7d6c5b4a32109f8e7d6c5b4a3210",
    BILLING_MODE: "stripe",
    STRIPE_SECRET_KEY: "sk_test_not_used",
  });
  assert.equal(config.billing.mode, "stripe");
  assert.equal(config.billing.productionApproved, false);
  assert.equal(config.billing.liveCharging, false);
});

test("live MLS data stays off even if env asks for the provider with credentials", () => {
  const config = readConfig({
    JWT_SECRET: "9f8e7d6c5b4a32109f8e7d6c5b4a3210",
    LISTINGS_MODE: "provider",
    RESO_CLIENT_ID: "client",
    RESO_CLIENT_SECRET: "secret",
    RESO_TOKEN_URL: "https://example.test/token",
    RESO_QUERY_URL: "https://example.test/odata",
  });
  assert.equal(config.listings.mode, "provider");
  assert.equal(config.listings.idxAgreementAccepted, false);
});
