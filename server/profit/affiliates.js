"use strict";

const { AFFILIATE_EVENTS } = require("./constants");
const { rejectSensitivePayload } = require("./ethics");

function upsertAffiliate(store, input) {
  return store.mutate((db) => {
    const row = {
      id: input.id || store.id("aff"),
      name: String(input.name || "").slice(0, 80),
      type: String(input.type || "partner").slice(0, 40),
      status: input.status || "pending",
      commission_model: String(input.commission_model || "none").slice(0, 40),
      created_at: input.created_at || store.now(),
    };
    const i = db.affiliates.findIndex((a) => a.id === row.id);
    if (i >= 0) db.affiliates[i] = { ...db.affiliates[i], ...row };
    else db.affiliates.push(row);
    return row;
  });
}

function recordAffiliateEvent(store, input) {
  const event = String(input.event || "");
  if (!AFFILIATE_EVENTS.includes(event)) {
    const err = new Error(`Unknown affiliate event. Allowed: ${AFFILIATE_EVENTS.join(", ")}.`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const sensitive = rejectSensitivePayload(input);
  if (sensitive) {
    const err = new Error(sensitive);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return store.mutate((db) => {
    const row = {
      id: store.id("afe"),
      affiliate_id: input.affiliate_id || input.affiliateId,
      user_id: input.user_id || input.userId || null,
      event,
      conversion_value: Math.round(Number(input.conversion_value || 0)),
      revenue: Math.round(Number(input.revenue || 0)),
      created_at: store.now(),
    };
    db.affiliateEvents.push(row);
    return row;
  });
}

module.exports = { upsertAffiliate, recordAffiliateEvent };
