"use strict";

const { COST_CATEGORIES } = require("./constants");

function recordCost(store, input) {
  const category = String(input.category || "");
  if (!COST_CATEGORIES.includes(category)) {
    const err = new Error(`Unknown cost category. Allowed: ${COST_CATEGORIES.join(", ")}.`);
    err.status = 400;
    err.expose = true;
    err.code = "BAD_COST_CATEGORY";
    throw err;
  }
  const amount = Math.round(Number(input.amountCents ?? input.amount ?? 0));
  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error("Cost amount must be non-negative integer cents.");
    err.status = 400;
    err.expose = true;
    err.code = "BAD_AMOUNT";
    throw err;
  }
  return store.mutate((db) => {
    const row = {
      id: input.id || store.id("cost"),
      category,
      amount,
      currency: (input.currency || "usd").toLowerCase(),
      user_id: input.userId || input.user_id || null,
      variable: input.variable !== false,
      note: String(input.note || "").slice(0, 200),
      sandbox: input.sandbox !== false,
      created_at: input.createdAt || store.now(),
    };
    db.costEvents.push(row);
    return row;
  });
}

function listCosts(store, { includeSandbox = false, since, until, category } = {}) {
  return store.read().costEvents.filter((r) => {
    if (!includeSandbox && r.sandbox) return false;
    if (category && r.category !== category) return false;
    if (since && r.created_at < since) return false;
    if (until && r.created_at > until) return false;
    return true;
  });
}

module.exports = { recordCost, listCosts };
