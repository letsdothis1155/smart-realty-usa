"use strict";

const { mergeCatalog, planHasFeature, featureLimit, FEATURES } = require("./catalog");

/**
 * Central entitlement service.
 * Do not scatter subscription checks through product code — call canUse().
 */

function activeEntitlement(rows, userId, at = new Date()) {
  const list = (rows || []).filter((e) => e.userId === userId);
  const now = at instanceof Date ? at : new Date(at);
  const live = list
    .filter((e) => {
      if (e.status && e.status !== "active" && e.status !== "trialing") return false;
      if (e.expiresAt && new Date(e.expiresAt) < now) return false;
      return true;
    })
    .sort((a, b) => rank(b.plan) - rank(a.plan));
  return live[0] || { userId, plan: "free", status: "active", source: "default" };
}

function rank(plan) {
  const order = {
    free: 0,
    plus: 1,
    agent_starter: 2,
    pro: 3,
    agent_pro: 4,
    business: 5,
    brokerage: 6,
    enterprise: 7,
  };
  return order[plan] || 0;
}

function planOf(user, storeDb, catalog) {
  const userId = typeof user === "string" ? user : user?.id || user?.userId || user?.sub;
  const cat = mergeCatalog(catalog || storeDb?.catalog);
  if (!userId) return cat.plans.free;
  const ent = activeEntitlement(storeDb?.entitlements, userId);
  return cat.plans[ent.plan] || cat.plans.free;
}

function canUse(user, featureId, ctx = {}) {
  const feature = FEATURES[featureId] || ctx.catalog?.features?.[featureId];
  if (feature?.legallyRequired || feature?.alwaysFree) {
    return { ok: true, feature: featureId, reason: feature?.legallyRequired ? "legally_required" : "always_free" };
  }
  const db = ctx.store?.read ? ctx.store.read() : ctx.db || {};
  const catalog = mergeCatalog(ctx.catalog || db.catalog);
  const plan = planOf(user, db, catalog);
  if (planHasFeature(plan, featureId)) {
    return { ok: true, feature: featureId, plan: plan.id };
  }
  return {
    ok: false,
    feature: featureId,
    plan: plan.id,
    reason: "upgrade_required",
    suggestedPlan: suggestPlanFor(featureId, catalog),
  };
}

function suggestPlanFor(featureId, catalog) {
  const cat = mergeCatalog(catalog);
  const order = ["plus", "pro", "business", "agent_starter", "agent_pro", "brokerage", "enterprise"];
  for (const id of order) {
    if (planHasFeature(cat.plans[id], featureId)) return id;
  }
  return "plus";
}

function checkLimit(user, limitKey, usedCount, ctx = {}) {
  const db = ctx.store?.read ? ctx.store.read() : ctx.db || {};
  const catalog = mergeCatalog(ctx.catalog || db.catalog);
  const plan = planOf(user, db, catalog);
  const limit = featureLimit(plan, limitKey);
  if (limit == null) {
    return { ok: true, limit: null, used: usedCount, plan: plan.id };
  }
  if (usedCount < limit) {
    return { ok: true, limit, used: usedCount, remaining: limit - usedCount, plan: plan.id };
  }
  return {
    ok: false,
    limit,
    used: usedCount,
    remaining: 0,
    plan: plan.id,
    reason: "limit_reached",
    suggestedPlan: limitKey === "propertyGoals" ? "plus" : suggestPlanFor("unlimited_property_goals", catalog),
  };
}

function grantEntitlement(store, { userId, plan, source = "billing", status = "active", expiresAt = null, subscriptionId = null }) {
  return store.mutate((db) => {
    const row = {
      id: store.id("ent"),
      userId,
      plan,
      status,
      source,
      subscriptionId,
      expiresAt,
      createdAt: store.now(),
      updatedAt: store.now(),
    };
    db.entitlements = db.entitlements.filter((e) => !(e.userId === userId && e.plan === plan && e.status === "active"));
    db.entitlements.push(row);
    return row;
  });
}

function revokeEntitlement(store, userId, reason = "canceled") {
  return store.mutate((db) => {
    const nowIso = store.now();
    db.entitlements.forEach((e) => {
      if (e.userId === userId && e.status === "active") {
        e.status = "revoked";
        e.revokedReason = reason;
        e.updatedAt = nowIso;
      }
    });
    return { userId, plan: "free" };
  });
}

module.exports = {
  canUse,
  checkLimit,
  planOf,
  activeEntitlement,
  grantEntitlement,
  revokeEntitlement,
  suggestPlanFor,
  rank,
};
