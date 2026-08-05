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
