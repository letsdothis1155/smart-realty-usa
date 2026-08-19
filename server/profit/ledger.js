"use strict";

const { REVENUE_TYPES } = require("./constants");
const { assertEthicalRevenue } = require("./ethics");

/**
 * Company revenue ledger.
 * A $2,000 paycheck deposited to a user's account is NOT $2,000 of SmartRealty revenue.
 */

function recordRevenue(store, input) {
  assertEthicalRevenue(input);
  const type = String(input.revenueType || input.revenue_type || "");
  if (!REVENUE_TYPES.includes(type)) {
    const err = new Error(`Unknown revenue type. Allowed: ${REVENUE_TYPES.join(", ")}.`);
    err.status = 400;
    err.expose = true;
    err.code = "BAD_REVENUE_TYPE";
    throw err;
  }
  const gross = Math.round(Number(input.grossAmountCents ?? input.gross_amount ?? 0));
  const fees = Math.round(Number(input.feesCents ?? input.fees ?? 0));
  if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(fees) || fees < 0) {
    const err = new Error("Amounts must be non-negative integer cents.");
    err.status = 400;
    err.expose = true;
    err.code = "BAD_AMOUNT";
    throw err;
  }
  return store.mutate((db) => {
    const row = {
      id: input.id || store.id("rev"),
      user_id: input.userId || input.user_id || null,
      business_id: input.businessId || input.business_id || null,
      revenue_type: type,
      source: String(input.source || type).slice(0, 80),
      gross_amount: gross,
      fees,
      net_amount: gross - fees,
      currency: (input.currency || "usd").toLowerCase(),
      external_reference: input.externalReference || input.external_reference || null,
      sandbox: input.sandbox !== false,
      created_at: input.createdAt || store.now(),
    };
    db.revenueEvents.push(row);
    return row;
  });
}

function listRevenue(store, { includeSandbox = false, since, until, type } = {}) {
  return store.read().revenueEvents.filter((r) => {
    if (!includeSandbox && r.sandbox) return false;
    if (type && r.revenue_type !== type) return false;
    if (since && r.created_at < since) return false;
    if (until && r.created_at > until) return false;
    return true;
  });
}

function sumCents(rows, field = "net_amount") {
  return rows.reduce((n, r) => n + (Number(r[field]) || 0), 0);
}

module.exports = { recordRevenue, listRevenue, sumCents };
