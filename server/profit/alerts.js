"use strict";

/**
 * Operating alerts. Compared against admin-configured thresholds.
 * Empty / zero actuals do not invent a "healthy" story — they report insufficient data.
 */

const DEFAULT_THRESHOLDS = {
  cacCents: 5000,
  churnRate: 0.08,
  refundRate: 0.05,
  paymentFailureRate: 0.05,
  grossMarginFloor: 0.5,
  conversionFloor: 0.01,
  apiCostSpikeMultiplier: 2,
  aiCostSpikeMultiplier: 2,
};

function evaluateAlerts(metrics, prior = null, thresholds = DEFAULT_THRESHOLDS) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const alerts = [];
  const unit = metrics.unit || {};
  const costs = metrics.costs?.byCategory || {};

  function add(code, severity, message) {
    alerts.push({ code, severity, message, at: new Date().toISOString() });
  }

  if (unit.CAC != null && unit.CAC > t.cacCents) {
    add("cac_exceeds_target", "warning", `CAC ${unit.CAC} cents exceeds target ${t.cacCents}.`);
  }
  if (unit.Churn != null && unit.Churn > t.churnRate) {
    add("churn_spike", "warning", `Churn ${(unit.Churn * 100).toFixed(1)}% exceeds ${(t.churnRate * 100).toFixed(0)}% target.`);
  }
  if (unit.GrossMargin != null && unit.GrossMargin < t.grossMarginFloor) {
    add("gross_margin_falls", "warning", `Gross margin ${(unit.GrossMargin * 100).toFixed(1)}% is below ${(t.grossMarginFloor * 100).toFixed(0)}%.`);
  }
  if (unit.ConversionRate != null && unit.ConversionRate < t.conversionFloor) {
    add("conversion_falls", "info", `Paid conversion ${(unit.ConversionRate * 100).toFixed(2)}% is below floor.`);
  }
  if (metrics.refundRate != null && metrics.refundRate > t.refundRate) {
    add("refund_rate_rises", "warning", "Refund rate is above the configured ceiling.");
  }
  if (metrics.paymentFailureRate != null && metrics.paymentFailureRate > t.paymentFailureRate) {
    add("subscription_failures_rise", "warning", "Subscription payment failures are above the ceiling.");
  }
  if (prior && prior.costs?.byCategory) {
    const prevApi = prior.costs.byCategory.data || 0;
    const prevAi = prior.costs.byCategory.AI || 0;
    if (prevApi > 0 && (costs.data || 0) > prevApi * t.apiCostSpikeMultiplier) {
      add("api_cost_spike", "warning", "Data/API costs more than doubled versus the prior window.");
    }
    if (prevAi > 0 && (costs.AI || 0) > prevAi * t.aiCostSpikeMultiplier) {
      add("ai_cost_spike", "warning", "AI costs more than doubled versus the prior window.");
    }
  }
  if (metrics.partnerRevenueDelta && Math.abs(metrics.partnerRevenueDelta) > 0) {
    add("partner_revenue_changes", "info", "Partner revenue changed versus the prior window.");
  }
  if (metrics.users?.payingUsers === 0 && metrics.revenue?.netRevenue === 0) {
    add("no_live_revenue", "info", "No production revenue recorded. Live charging is disabled. This is expected at $0.");
  }

  return alerts;
}

module.exports = { evaluateAlerts, DEFAULT_THRESHOLDS };
