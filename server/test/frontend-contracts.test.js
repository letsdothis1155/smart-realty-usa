"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");

test("placeholder Supabase config leaves legacy member gates usable", async () => {
  const listeners = new Map();
  const classes = new Set();
  const gate = {
    dataset: {},
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    querySelector() { return {}; },
  };
  const classList = { toggle() {}, add() {}, remove() {} };
  const document = {
    readyState: "complete",
    referrer: "",
    documentElement: { classList },
    body: { classList },
    querySelectorAll(selector) {
      return selector.includes("signin-gate") ? [gate] : [];
    },
    getElementById() { return null; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatchEvent() {},
  };
  const location = {
    href: "https://smartrealty.us/index.html",
    origin: "https://smartrealty.us",
    hostname: "smartrealty.us",
    pathname: "/index.html",
    search: "",
  };
  const window = { document, location, SRU_SUPABASE_CONFIG: {} };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    location,
    URL,
    URLSearchParams,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout,
    console,
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "auth-guard.js"), "utf8"), context);
  await window.SRU_SUPABASE.ready;
  assert.equal(window.SRU_SUPABASE.configured, false);
  assert.equal(classes.has("is-auth-locked"), false);

  let prevented = false;
  listeners.get("click")({
    target: {
      closest(selector) { return selector.includes("data-requires-auth") ? gate : null; },
    },
    preventDefault() { prevented = true; },
    stopImmediatePropagation() {},
  });
  assert.equal(prevented, false);

  window.SRU_SUPABASE.openSignIn({ next: "https://smartrealty.us/listings" });
  assert.match(location.href, /^\/auth\.html\?next=/);
});

test("listing photos attempt reconstruction unless the API is explicitly disabled", () => {
  const source = fs.readFileSync(path.join(ROOT, "js", "room-pipeline.js"), "utf8");
  assert.match(source, /photoUrl && window\.SRU_SHOP_API !== false/);
  assert.doesNotMatch(source, /window\.SRU_SHOP_API === true/);
  assert.match(source, /\/api\/shop\/reconstruct/);
});

test("room builder disposes owned GPU resources without destroying cached GLTF assets", () => {
  const source = fs.readFileSync(path.join(ROOT, "js", "room-builder.js"), "utf8");
  assert.match(source, /resourceOwnership = "procedural"/);
  assert.match(source, /resourceOwnership = "shared-gltf"/);
  assert.match(source, /if \(ownership === "shared-gltf"\) return/);
  assert.match(source, /disposeMesh\(ghost\)/);
  assert.match(source, /floorTex\.dispose\(\)/);
  assert.match(source, /wallTex\.dispose\(\)/);
  assert.match(source, /controls\.dispose\(\)/);
});

test("listings without eligible photos offer an honestly labeled sample 3D room", () => {
  const source = fs.readFileSync(path.join(ROOT, "new-listings", "index.html"), "utf8");
  assert.match(source, /Try sample 3D room/);
  assert.match(source, /Try a sample 3D room/);
  assert.match(source, /demo=1/);
  assert.match(source, /generic sample room; it does not model this property/i);
});
