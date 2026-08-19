"use strict";

/**
 * Break-even subscribers = Monthly Fixed Costs / Average Contribution Per Subscriber
 *
 * Inputs are administrator-supplied scenario values, not invented performance.
 * Missing or zero contribution → not computable.
 */

function breakEven(input = {}) {
  const fixed = Math.round(Number(input.monthlyFixedCostsCents ?? input.monthlyFixedCosts ?? 0));
  const price = Math.round(Number(input.averageSubscriptionPriceCents ?? input.averageSubscriptionPrice ?? 0));
  const grossMargin = Number(input.grossMargin);
  const conversionRate = Number(input.conversionRate);
  const cac = Math.round(Number(input.averageAcquisitionCostCents ?? input.averageAcquisitionCost ?? 0));
  const activeUsers = Math.round(Number(input.activeUsers ?? 0));

  if (!Number.isFinite(fixed) || fixed < 0) return fail("Monthly fixed costs must be a non-negative cent amount.");
  if (!Number.isFinite(price) || price < 0) return fail("Average subscription price must be a non-negative cent amount.");
  if (!Number.isFinite(grossMargin) || grossMargin < 0 || grossMargin > 1) {
    return fail("Gross margin must be a fraction between 0 and 1 (example: 0.8 = 80%).");
  }

  const contributionPerSubscriber = Math.round(price * grossMargin);
  const subscribersNeeded =
    contributionPerSubscriber <= 0 ? null : Math.ceil(fixed / contributionPerSubscriber);

  let payingFromUsers = null;
  if (Number.isFinite(conversionRate) && conversionRate >= 0 && conversionRate <= 1 && activeUsers >= 0) {
    payingFromUsers = Math.round(activeUsers * conversionRate);
  }

  const gap = subscribersNeeded == null || payingFromUsers == null ? null : subscribersNeeded - payingFromUsers;
  const paybackMonths =
    contributionPerSubscriber > 0 && cac >= 0 ? round4(cac / contributionPerSubscriber) : null;

  return {
    ok: true,
    formula: "Break-Even Subscribers = Monthly Fixed Costs / Average Contribution Per Subscriber",
    contributionFormula: "Average Contribution Per Subscriber = Average Subscription Price × Gross Margin",
    inputs: {
      monthlyFixedCostsCents: fixed,
      averageSubscriptionPriceCents: price,
      grossMargin,
      conversionRate: Number.isFinite(conversionRate) ? conversionRate : null,
      averageAcquisitionCostCents: Number.isFinite(cac) ? cac : null,
      activeUsers: Number.isFinite(activeUsers) ? activeUsers : null,
    },
    averageContributionPerSubscriberCents: contributionPerSubscriber,
    breakEvenSubscribers: subscribersNeeded,
    impliedPayingFromActiveUsers: payingFromUsers,
    subscribersStillNeeded: gap,
    paybackMonths,
    projection: false,
    guarantee: false,
    notice:
      subscribersNeeded == null
        ? "Not computable: contribution per subscriber is zero. Raising price or margin is required before a subscriber count can break even."
        : "Scenario only. Not a forecast of actual results.",
  };
}

function fail(message) {
  return { ok: false, error: message, breakEvenSubscribers: null, projection: false, guarantee: false };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = { breakEven };
