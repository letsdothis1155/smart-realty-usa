"use strict";

/**
 * Unit economics. Formulas are documented and not massaged to look better.
 *
 * All money is integer cents. Null means "not computable" (usually divide-by-zero
 * or missing inputs). Never invent CAC, LTV, or revenue.
 *
 * Customer bank deposits are excluded: only revenue_events rows are summed.
 */

const { listRevenue, sumCents } = require("./ledger");
const { listCosts } = require("./costs");
const { mergeCatalog } = require("./catalog");

const DEFINITIONS = {
  GrossRevenue: "Sum of gross_amount on company revenue_events. User paychecks are not included.",
  NetRevenue: "Sum of net_amount (gross minus processor/partner fees recorded on the event).",
  CostOfRevenue: "Variable costs directly tied to serving paying activity (processing, AI, provider APIs, comms).",
  GrossProfit: "NetRevenue - CostOfRevenue.",
  OperatingExpenses: "Non-variable operating costs (hosting, support, marketing, infrastructure, etc. when marked variable=false).",
  OperatingProfit: "GrossProfit - OperatingExpenses.",
  ContributionMargin: "Revenue - Variable Costs (for a period, product, or customer).",
  ARPU: "NetRevenue in period / active users in period. 0 users → null.",
  ARPPU: "NetRevenue in period / paying users in period. 0 paying users → null.",
  MRR: "Monthly recurring revenue from active subscriptions annualized to a month. Annual plans contribute priceAnnual/12. Sandbox excluded unless requested.",
  ARR: "MRR × 12.",
  CAC: "Sales & marketing cost attributed to new paying customers / new paying customers. 0 new payers → null.",
  LTV: "ARPPU × gross-margin × (1 / churnRate). churnRate 0 or missing → null (do not assume infinite LTV).",
  GrossMargin: "GrossProfit / NetRevenue. 0 revenue → null.",
  Churn: "Paying customers who canceled in period / paying customers at start of period.",
  ConversionRate: "New paying customers / new free signups in period. 0 signups → null.",
  PaybackPeriod: "CAC / monthly contribution per paying customer. Missing inputs → null.",
  LTV_CAC: "LTV / CAC. Either null → null.",
};

const VARIABLE_COST_CATEGORIES = [
  "payment_processing",
  "banking_provider",
  "payroll_provider",
  "AI",
  "email",
  "SMS",
  "data",
  "identity_verification",
  "fraud",
  "affiliate_payout",
];

function inRange(iso, since, until) {
  if (since && iso < since) return false;
  if (until && iso > until) return false;
  return true;
}

function activeSubscriptions(db, { includeSandbox = false, at } = {}) {
  const when = at || new Date().toISOString();
  return (db.subscriptions || []).filter((s) => {
    if (!includeSandbox && s.sandbox) return false;
    if (s.status !== "active" && s.status !== "trialing") return false;
    if (s.current_period_end && s.current_period_end < when) return false;
    return true;
  });
}

function mrrCents(db, catalog, opts = {}) {
  const cat = mergeCatalog(catalog || db.catalog);
  const subs = activeSubscriptions(db, opts);
  let mrr = 0;
  for (const s of subs) {
    const plan = cat.plans[s.plan];
    if (!plan) continue;
    if (s.billing_period === "annual") {
      const annual = s.amount_cents != null ? s.amount_cents : plan.priceAnnualCents || 0;
      mrr += Math.round(annual / 12);
    } else if (s.billing_period === "contract") {
      const monthly = s.amount_cents != null ? s.amount_cents : 0;
      mrr += monthly;
    } else {
      const monthly = s.amount_cents != null ? s.amount_cents : plan.priceMonthlyCents || 0;
      mrr += monthly;
    }
  }
  return mrr;
}

function ratio(num, den) {
  if (den == null || den === 0) return null;
  return num / den;
}

function round4(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 10000) / 10000;
}

function periodWindow(name, now = new Date()) {
  const end = now.toISOString();
  const start = new Date(now);
  if (name === "today") start.setUTCHours(0, 0, 0, 0);
  else if (name === "7d") start.setUTCDate(start.getUTCDate() - 7);
  else if (name === "30d") start.setUTCDate(start.getUTCDate() - 30);
  else if (name === "month") start.setUTCDate(1), start.setUTCHours(0, 0, 0, 0);
  else if (name === "quarter") {
    const q = Math.floor(start.getUTCMonth() / 3) * 3;
    start.setUTCMonth(q, 1);
    start.setUTCHours(0, 0, 0, 0);
  } else if (name === "year") start.setUTCMonth(0, 1), start.setUTCHours(0, 0, 0, 0);
  else start.setUTCDate(start.getUTCDate() - 30);
  return { since: start.toISOString(), until: end, label: name };
}

function snapshot(store, opts = {}) {
  const includeSandbox = !!opts.includeSandbox;
  const db = store.read();
  const catalog = mergeCatalog(db.catalog);
  const since = opts.since || null;
  const until = opts.until || null;

  const revenue = listRevenue(store, { includeSandbox, since, until });
  const costs = listCosts(store, { includeSandbox, since, until });
  const grossRevenue = sumCents(revenue, "gross_amount");
  const netRevenue = sumCents(revenue, "net_amount");
  const variableCosts = costs.filter((c) => c.variable !== false);
  const operatingCosts = costs.filter((c) => c.variable === false);
  const costOfRevenue = sumCents(variableCosts, "amount");
  const opex = sumCents(operatingCosts, "amount");
  const grossProfit = netRevenue - costOfRevenue;
  const operatingProfit = grossProfit - opex;

  const subs = activeSubscriptions(db, { includeSandbox });
  const payingUsers = new Set(subs.map((s) => s.user_id)).size;
  const entitlementUsers = new Set((db.entitlements || []).map((e) => e.userId)).size;
  const customers = new Set((db.customers || []).map((c) => c.userId)).size;
  const freeUsers = Math.max(0, (opts.activeUsers != null ? opts.activeUsers : customers) - payingUsers);

  const mrr = includeSandbox ? mrrCents(db, catalog, { includeSandbox: true }) : mrrCents(db, catalog, { includeSandbox: false });
  const canceled = (db.subscriptions || []).filter((s) => {
    if (!includeSandbox && s.sandbox) return false;
    if (s.status !== "canceled") return false;
    return inRange(s.canceled_at || s.updated_at || "", since, until);
  });
  const startPaying = payingUsers + canceled.length;
  const churnRate = ratio(canceled.length, startPaying);

  const newPaying = (db.subscriptions || []).filter((s) => {
    if (!includeSandbox && s.sandbox) return false;
    return inRange(s.created_at || "", since, until);
  }).length;
  const signups = (opts.signups != null ? opts.signups : (db.acquisitionEvents || []).filter((a) => inRange(a.created_at, since, until) && a.event === "signup").length);
  const conversionRate = ratio(newPaying, signups);

  const marketing = costs.filter((c) => c.category === "marketing");
  const marketingSpend = sumCents(marketing, "amount");
  const cac = ratio(marketingSpend, newPaying);
  const arpu = ratio(netRevenue, payingUsers + freeUsers);
  const arppu = ratio(netRevenue, payingUsers);
  const grossMargin = ratio(grossProfit, netRevenue);
  const contribution = netRevenue - costOfRevenue;
  const contributionMarginRatio = ratio(contribution, netRevenue);
  const monthlyContributionPerPayer = payingUsers ? contribution / payingUsers : null;
  const ltv =
    arppu != null && grossMargin != null && churnRate && churnRate > 0
      ? arppu * grossMargin * (1 / churnRate)
      : null;
  const payback = cac != null && monthlyContributionPerPayer ? cac / monthlyContributionPerPayer : null;
  const ltvCac = ratio(ltv, cac);

  const byType = {};
  for (const r of revenue) {
    byType[r.revenue_type] = (byType[r.revenue_type] || 0) + r.net_amount;
  }
  const costsByCategory = {};
  for (const c of costs) {
    costsByCategory[c.category] = (costsByCategory[c.category] || 0) + c.amount;
  }

  return {
    generatedAt: new Date().toISOString(),
    includeSandbox,
    liveCharging: false,
    liveMoneyMovement: "disabled",
    productionComplianceReview: catalog.productionComplianceReview || "required",
    currency: "usd",
    users: {
      customers,
      entitlementUsers,
      payingUsers,
      freeUsers,
      activeSubscriptions: subs.length,
    },
    revenue: {
      grossRevenue,
      netRevenue,
      byType,
    },
    costs: {
      costOfRevenue,
      operatingExpenses: opex,
      total: costOfRevenue + opex,
      byCategory: costsByCategory,
    },
    results: {
      grossProfit,
      contribution,
      operatingProfit,
    },
    unit: {
      ARPU: arpu == null ? null : Math.round(arpu),
      ARPPU: arppu == null ? null : Math.round(arppu),
      MRR: mrr,
      ARR: mrr * 12,
      CAC: cac == null ? null : Math.round(cac),
      LTV: ltv == null ? null : Math.round(ltv),
      GrossMargin: round4(grossMargin),
      ContributionMargin: round4(contributionMarginRatio),
      Churn: round4(churnRate),
      ConversionRate: round4(conversionRate),
      PaybackPeriodMonths: round4(payback),
      "LTV:CAC": round4(ltvCac),
    },
    counts: {
      newPaying,
      signups,
      canceled: canceled.length,
    },
    definitions: DEFINITIONS,
    notice:
      "Null metrics mean the formula cannot run on current data (usually zero denominator). Values are not invented. Sandbox rows are excluded from founder totals.",
  };
}

function revenueByProduct(store, opts = {}) {
  const revenue = listRevenue(store, opts);
  const costs = listCosts(store, opts);
  const products = {};
  for (const r of revenue) {
    const key = r.source || r.revenue_type;
    products[key] = products[key] || { revenue: 0, variableCost: 0, contribution: 0, events: 0 };
    products[key].revenue += r.net_amount;
    products[key].events += 1;
  }
  for (const c of costs) {
    const key = c.note || c.category;
    if (!products[key]) continue;
    if (c.variable !== false) products[key].variableCost += c.amount;
  }
  for (const row of Object.values(products)) {
    row.contribution = row.revenue - row.variableCost;
  }
  return products;
}

function customerContribution(store, userId, opts = {}) {
  const revenue = listRevenue(store, opts).filter((r) => r.user_id === userId);
  const costs = listCosts(store, opts).filter((c) => c.user_id === userId && c.variable !== false);
  const rev = sumCents(revenue, "net_amount");
  const cost = sumCents(costs, "amount");
  return {
    userId,
    revenue: rev,
    variableCosts: cost,
    contribution: rev - cost,
    includesBankDeposits: false,
  };
}

function timeSeries(store, { includeSandbox = false, days = 30 } = {}) {
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - days);
  const revenue = listRevenue(store, { includeSandbox, since: since.toISOString() });
  const costs = listCosts(store, { includeSandbox, since: since.toISOString() });
  const byDay = {};
  function bucket(iso) {
    const d = String(iso || "").slice(0, 10);
    if (!byDay[d]) byDay[d] = { date: d, revenue: 0, costs: 0, subscriptions: 0 };
    return byDay[d];
  }
  revenue.forEach((r) => {
    bucket(r.created_at).revenue += r.net_amount;
  });
  costs.forEach((c) => {
    bucket(c.created_at).costs += c.amount;
  });
  return Object.keys(byDay)
    .sort()
    .map((k) => byDay[k]);
}

module.exports = {
  DEFINITIONS,
  VARIABLE_COST_CATEGORIES,
  snapshot,
  mrrCents,
  periodWindow,
  revenueByProduct,
  customerContribution,
  activeSubscriptions,
  timeSeries,
  ratio,
};
