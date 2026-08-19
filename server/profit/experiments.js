"use strict";

/**
 * Controlled pricing tests. Users must always know the exact charge.
 * Deceptive pricing is rejected.
 */

function assertHonestExperiment(exp) {
  if (exp?.hidePrice || exp?.baitSwitch || exp?.darkPattern) {
    const err = new Error("Deceptive pricing experiments are banned.");
    err.status = 400;
    err.expose = true;
    err.code = "BANNED_MONETIZATION";
    throw err;
  }
  if (!exp?.variants || !Object.keys(exp.variants).length) {
    const err = new Error("A pricing experiment needs named variants with disclosed prices.");
    err.status = 400;
    err.expose = true;
    throw err;
  }
  for (const [name, v] of Object.entries(exp.variants)) {
    if (v.priceCents == null && v.priceMonthlyCents == null && !v.contract) {
      const err = new Error(`Variant ${name} must disclose a price.`);
      err.status = 400;
      err.expose = true;
      throw err;
    }
  }
  return true;
}

function upsertExperiment(store, input) {
  assertHonestExperiment(input);
  return store.mutate((db) => {
    const row = {
      id: input.id || store.id("px"),
      name: String(input.name || "").slice(0, 80),
      status: input.status || "draft",
      variants: input.variants,
      metrics: input.metrics || {
        conversion: 0,
        retention: 0,
        churn: 0,
        ARPU: 0,
        LTV: 0,
        supportLoad: 0,
        refunds: 0,
      },
      created_at: input.created_at || store.now(),
    };
    const i = db.pricingExperiments.findIndex((e) => e.id === row.id);
    if (i >= 0) db.pricingExperiments[i] = { ...db.pricingExperiments[i], ...row };
    else db.pricingExperiments.push(row);
    return row;
  });
}

module.exports = { assertHonestExperiment, upsertExperiment };
