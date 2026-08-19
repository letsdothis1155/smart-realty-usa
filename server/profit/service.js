"use strict";

const { publicCatalog, mergeCatalog } = require("./catalog");
const { canUse, checkLimit, grantEntitlement, revokeEntitlement, activeEntitlement, planOf } = require("./entitlements");
const { createBillingProvider } = require("./billing");
const { recordRevenue, listRevenue } = require("./ledger");
const { recordCost, listCosts } = require("./costs");
const { snapshot, periodWindow, revenueByProduct, customerContribution, timeSeries } = require("./economics");
const { breakEven } = require("./breakeven");
const { forecast } = require("./forecast");
const { evaluateAlerts } = require("./alerts");
const {
  listProfessionals,
  upsertProfessional,
  requestAgentLead,
  recordPartnerEvent,
  marketplaceStatus,
} = require("./marketplace");
const { upsertAffiliate, recordAffiliateEvent } = require("./affiliates");
const { upsertExperiment } = require("./experiments");
const { assertEthicalCheckout, publicEthics } = require("./ethics");
const { CHURN_REASONS } = require("./constants");

function periodDates(billingPeriod) {
  const start = new Date();
  const end = new Date(start);
  if (billingPeriod === "annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function amountFor(plan, billingPeriod) {
  if (!plan) return 0;
  if (billingPeriod === "annual") return plan.priceAnnualCents || 0;
  return plan.priceMonthlyCents || 0;
}

function createProfitService({ store, billing, config = {} }) {
  const provider = billing || createBillingProvider(config.billing || {}, { store });

  function catalog() {
    return mergeCatalog(store.read().catalog);
  }

  function publicPlans() {
    return publicCatalog(catalog());
  }

  function entitlementsFor(userId) {
    const db = store.read();
    const cat = catalog();
    const ent = activeEntitlement(db.entitlements, userId);
    const plan = cat.plans[ent.plan] || cat.plans.free;
    return {
      userId,
      plan: plan.id,
      status: ent.status || "active",
      features: plan.features,
      limits: plan.limits || {},
      liveCharging: false,
    };
  }

  function canUseFeature(user, featureId) {
    return canUse(user, featureId, { store });
  }

  function canCreateGoal(user, currentCount) {
    return checkLimit(user, "propertyGoals", currentCount, { store });
  }

  async function checkout(userId, input) {
    const cat = catalog();
    const plan = cat.plans[input.planId];
    if (!plan) {
      const err = new Error("Unknown plan.");
      err.status = 400;
      err.expose = true;
      throw err;
    }
    const billingPeriod = input.billingPeriod === "annual" ? "annual" : "monthly";
    if (plan.contractBilling && billingPeriod !== "contract") {
      const err = new Error("Enterprise uses contract billing, not self-serve checkout.");
      err.status = 400;
      err.expose = true;
      err.code = "CONTRACT_BILLING";
      throw err;
    }
    assertEthicalCheckout({ ...input, planId: plan.id }, cat);
    const amountCents = amountFor(plan, billingPeriod);
    const session = await provider.createCheckoutSession({
      userId,
      planId: plan.id,
      billingPeriod,
      amountCents,
      currency: plan.currency || "usd",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    return {
      ...session,
      plan: {
        id: plan.id,
        name: plan.name,
        billingPeriod,
        amountCents,
        currency: plan.currency || "usd",
        annualSavingsPercent: billingPeriod === "annual" ? plan.annualSavingsPercent || 0 : 0,
      },
      liveCharging: false,
      cardCollected: false,
    };
  }

  async function confirmSandboxCheckout(sessionId, userId) {
    const db = store.read();
    const session = db.checkoutSessions.find((s) => s.id === sessionId && s.userId === userId);
    if (!session || session.status !== "open") {
      const err = new Error("Checkout session not found or already used.");
      err.status = 404;
      err.expose = true;
      throw err;
    }
    const cat = catalog();
    const plan = cat.plans[session.planId];
    const dates = periodDates(session.billingPeriod);
    const sub = store.mutate((d) => {
      session.status = "complete";
      session.completedAt = store.now();
      const row = {
        id: store.id("sub"),
        user_id: userId,
        provider_customer_id: session.customerId,
        provider_subscription_id: store.id("mocksub"),
        plan: session.planId,
        status: "active",
        billing_period: session.billingPeriod,
        amount_cents: session.amountCents,
        currency: session.currency,
        current_period_start: dates.start,
        current_period_end: dates.end,
        sandbox: true,
        created_at: store.now(),
        updated_at: store.now(),
      };
      d.subscriptions.push(row);
      return row;
    });
    grantEntitlement(store, {
      userId,
      plan: session.planId,
      source: "sandbox_checkout",
      subscriptionId: sub.id,
    });
    // Sandbox revenue is recorded but flagged sandbox so founder totals stay $0.
    recordRevenue(store, {
      userId,
      revenueType: plan?.audience === "agent" ? "agent" : plan?.audience === "business" || plan?.audience === "enterprise" ? "business" : "subscription",
      source: session.planId,
      grossAmountCents: session.amountCents,
      feesCents: 0,
      sandbox: true,
      externalReference: sub.id,
    });
    return {
      ok: true,
      subscription: publicSubscription(sub),
      liveCharging: false,
      charged: false,
      message: "Sandbox plan activated. No card was charged. This does not count as production revenue.",
    };
  }

  function publicSubscription(row) {
    if (!row) return { plan: "free", status: "none", liveCharging: false };
    return {
      id: row.id,
      plan: row.plan,
      status: row.status,
      billingPeriod: row.billing_period,
      amountCents: row.amount_cents || 0,
      currency: row.currency || "usd",
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      sandbox: !!row.sandbox,
      liveCharging: false,
      canceledAt: row.canceled_at || null,
    };
  }

  async function currentSubscription(userId) {
    const fromProvider = await provider.getSubscription(userId);
    const local = store.read().subscriptions.filter((s) => s.user_id === userId);
    const active = local.find((s) => s.status === "active" || s.status === "trialing");
    return {
      subscription: publicSubscription(active || local[local.length - 1] || fromProvider),
      entitlements: entitlementsFor(userId),
    };
  }

  async function cancel(userId, { subscriptionId, reason, details } = {}) {
    const db = store.read();
    const row = db.subscriptions.find(
      (s) => s.user_id === userId && (subscriptionId ? s.id === subscriptionId : s.status === "active" || s.status === "trialing")
    );
    if (!row) {
      const err = new Error("No active subscription to cancel.");
      err.status = 404;
      err.expose = true;
      throw err;
    }
    await provider.cancelSubscription(row.id);
    revokeEntitlement(store, userId, "canceled");
    if (reason) {
      if (reason !== "other" && !CHURN_REASONS.includes(reason)) {
        const err = new Error("Unknown cancellation reason.");
        err.status = 400;
        err.expose = true;
        throw err;
      }
      store.mutate((d) => {
        d.churnSurveys.push({
          id: store.id("churn"),
          user_id: userId,
          subscription_id: row.id,
          reason,
          details: String(details || "").slice(0, 240),
          created_at: store.now(),
        });
      });
    }
    return {
      ok: true,
      canceled: true,
      friction: false,
      message: "Subscription canceled. You keep Free. Direct deposit and your existing goal stay available.",
      subscription: publicSubscription({ ...row, status: "canceled", canceled_at: new Date().toISOString() }),
    };
  }

  async function portal(userId) {
    const url = await provider.createBillingPortal(userId);
    return { url, liveCharging: false };
  }

  function updateCatalog(patch) {
    return store.mutate((db) => {
      const next = mergeCatalog({ ...db.catalog, ...patch, plans: { ...db.catalog.plans, ...(patch.plans || {}) } });
      next.liveCharging = false;
      next.updatedAt = store.now();
      db.catalog = next;
      return publicCatalog(next);
    });
  }

  function founderSnapshot({ signups = 0, activeUsers = 0, ddSetups = 0, goalsCreated = 0, plusConversions = 0 } = {}) {
    const month = periodWindow("month");
    const stats = snapshot(store, { includeSandbox: false, since: month.since, until: month.until, signups, activeUsers });
    const db = store.read();
    const businessCustomers = new Set(
      db.subscriptions
        .filter((s) => !s.sandbox && ["business", "enterprise", "brokerage", "agent_pro", "agent_starter"].includes(s.plan) && (s.status === "active" || s.status === "trialing"))
        .map((s) => s.user_id)
    ).size;
    const towardProfit =
      stats.results.operatingProfit > 0
        ? "yes"
        : stats.revenue.netRevenue === 0 && stats.costs.total === 0
          ? "not_yet_zero_activity"
          : stats.results.operatingProfit === 0
            ? "break_even"
            : "no";
    return {
      title: "SMARTREALTY TODAY",
      users: stats.users.customers,
      activeUsers,
      payingUsers: stats.users.payingUsers,
      mrrCents: stats.unit.MRR,
      revenueThisMonthCents: stats.revenue.netRevenue,
      costsThisMonthCents: stats.costs.total,
      netOperatingResultCents: stats.results.operatingProfit,
      newDirectDepositSetups: ddSetups,
      propertyGoalsCreated: goalsCreated,
      plusConversions,
      businessCustomers,
      areWeMovingTowardProfitability: towardProfit,
      liveMoneyMovement: "disabled",
      liveCharging: false,
      invented: false,
      notice:
        towardProfit === "not_yet_zero_activity"
          ? "No production revenue or costs are recorded. That is actual $0, not a projection."
          : towardProfit === "yes"
            ? "Production operating result is positive for this month."
            : "Production operating result is not yet positive.",
    };
  }

  function adminEconomics(opts = {}) {
    const stats = snapshot(store, opts);
    stats.alerts = evaluateAlerts(stats);
    stats.byProduct = revenueByProduct(store, opts);
    stats.series = timeSeries(store, { includeSandbox: !!opts.includeSandbox, days: opts.days || 30 });
    stats.windows = {};
    for (const name of ["today", "7d", "30d", "month", "quarter", "year"]) {
      const w = periodWindow(name);
      stats.windows[name] = snapshot(store, { ...opts, since: w.since, until: w.until });
    }
    return stats;
  }

  function profitability() {
    const windows = {};
    for (const name of ["today", "7d", "30d", "month", "quarter", "year"]) {
      const w = periodWindow(name);
      windows[name] = snapshot(store, { includeSandbox: false, since: w.since, until: w.until });
    }
    const month = windows.month;
    return {
      revenue: Object.fromEntries(
        Object.entries(windows).map(([k, v]) => [
          k,
          {
            total: v.revenue.netRevenue,
            subscriptions: v.revenue.byType.subscription || 0,
            marketplace: v.revenue.byType.marketplace || 0,
            b2b: (v.revenue.byType.business || 0) + (v.revenue.byType.agent || 0) + (v.revenue.byType.enterprise || 0),
            partners: v.revenue.byType.partner || 0,
            other: (v.revenue.byType.other || 0) + (v.revenue.byType.service || 0) + (v.revenue.byType.affiliate || 0),
          },
        ])
      ),
      expenses: month.costs.byCategory,
      results: {
        revenue: month.revenue.netRevenue,
        costOfRevenue: month.costs.costOfRevenue,
        grossProfit: month.results.grossProfit,
        operatingExpenses: month.costs.operatingExpenses,
        operatingProfit: month.results.operatingProfit,
      },
      breakEvenProgress: {
        mrrCents: month.unit.MRR,
        note: "Use /admin/economics break-even calculator with your actual fixed costs. No assumed burn is injected.",
      },
      liveCharging: false,
    };
  }

  return {
    provider,
    publicPlans,
    catalog,
    entitlementsFor,
    canUseFeature,
    canCreateGoal,
    checkout,
    confirmSandboxCheckout,
    currentSubscription,
    cancel,
    portal,
    updateCatalog,
    recordRevenue: (input) => recordRevenue(store, input),
    recordCost: (input) => recordCost(store, input),
    listRevenue: (opts) => listRevenue(store, opts),
    listCosts: (opts) => listCosts(store, opts),
    founderSnapshot,
    adminEconomics,
    profitability,
    breakEven,
    forecast,
    listProfessionals: (opts) => listProfessionals(store, opts),
    upsertProfessional: (input) => upsertProfessional(store, input),
    requestAgentLead: (input) => requestAgentLead(store, input),
    recordPartnerEvent: (input) => recordPartnerEvent(store, input),
    marketplaceStatus,
    upsertAffiliate: (input) => upsertAffiliate(store, input),
    recordAffiliateEvent: (input) => recordAffiliateEvent(store, input),
    upsertExperiment: (input) => upsertExperiment(store, input),
    customerContribution: (userId, opts) => customerContribution(store, userId, opts),
    publicEthics,
    planOf: (user) => planOf(user, store.read()),
  };
}

module.exports = { createProfitService };
