"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { id } = require("../lib/ids");
const { defaultCatalog } = require("./catalog");

function now() {
  return new Date().toISOString();
}

function emptyDb() {
  return {
    catalog: defaultCatalog(),
    customers: [],
    subscriptions: [],
    entitlements: [],
    checkoutSessions: [],
    revenueEvents: [],
    costEvents: [],
    affiliates: [],
    affiliateEvents: [],
    partners: [],
    partnerEvents: [],
    professionals: [],
    leadRequests: [],
    businesses: [],
    enterprises: [],
    employerPrograms: [],
    pricingExperiments: [],
    churnSurveys: [],
    alerts: [],
    acquisitionEvents: [],
    webhookReceipts: [],
    updatedAt: now(),
  };
}

function createStore({ dataDir, memory = false, fileName = "profit.json" } = {}) {
  const file = dataDir ? path.join(dataDir, fileName) : null;
  let cache = emptyDb();

  function ensure() {
    if (memory || !file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(emptyDb(), null, 2));
    }
  }

  function read() {
    if (memory || !file) return cache;
    ensure();
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      cache = { ...emptyDb(), ...data };
      return cache;
    } catch {
      cache = emptyDb();
      return cache;
    }
  }

  function write(next) {
    next.updatedAt = now();
    cache = next;
    if (memory || !file) return;
    ensure();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, file);
  }

  function mutate(fn) {
    const db = read();
    const result = fn(db);
    write(db);
    return result;
  }

  return {
    read,
    mutate,
    now,
    id,
    emptyDb,
  };
}

module.exports = { createStore, emptyDb };
