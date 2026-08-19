"use strict";

/**
 * Conservative scenario forecasts. Never present as guaranteed results.
 *
 * Visitors × Signup Conversion × Paid Conversion × Average Revenue × Retention
 * = Projected Revenue
 *
 * Projected Revenue − Variable Costs − Fixed Costs = Projected Operating Result
 */

function clamp01(n, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(1, Math.max(0, x));
}

function scenario(input, label) {
  const visitors = Math.max(0, Math.round(Number(input.visitors) || 0));
  const signupConversion = clamp01(input.signupConversion, 0);
  const paidConversion = clamp01(input.paidConversion, 0);
  const averageRevenueCents = Math.max(0, Math.round(Number(input.averageRevenueCents) || 0));
  const retention = clamp01(input.retention, 0);
  const variableCostRate = clamp01(input.variableCostRate, 0);
  const fixedCostsCents = Math.max(0, Math.round(Number(input.fixedCostsCents) || 0));

  const signups = visitors * signupConversion;
  const paying = signups * paidConversion;
  const projectedRevenue = Math.round(paying * averageRevenueCents * retention);
  const variableCosts = Math.round(projectedRevenue * variableCostRate);
  const operatingResult = projectedRevenue - variableCosts - fixedCostsCents;

  return {
    label,
    visitors,
    signups: round2(signups),
    paying: round2(paying),
    projectedRevenueCents: projectedRevenue,
    variableCostsCents: variableCosts,
    fixedCostsCents,
    projectedOperatingResultCents: operatingResult,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function forecast(input = {}) {
  const low = {
    visitors: input.visitors,
    signupConversion: Number(input.signupConversion || 0) * 0.5,
    paidConversion: Number(input.paidConversion || 0) * 0.5,
    averageRevenueCents: input.averageRevenueCents,
    retention: Math.min(1, Number(input.retention || 0) * 0.7),
    variableCostRate: Math.min(1, Number(input.variableCostRate || 0) * 1.2),
    fixedCostsCents: input.fixedCostsCents,
    ...(input.low || {}),
  };
  const base = { ...input };
  const high = {
    visitors: input.visitors,
    signupConversion: Math.min(1, Number(input.signupConversion || 0) * 1.25),
    paidConversion: Math.min(1, Number(input.paidConversion || 0) * 1.25),
    averageRevenueCents: input.averageRevenueCents,
    retention: Math.min(1, Number(input.retention || 0) * 1.1),
    variableCostRate: Number(input.variableCostRate || 0) * 0.9,
    fixedCostsCents: input.fixedCostsCents,
    ...(input.high || {}),
  };

  return {
    ok: true,
    guarantee: false,
    projection: true,
    formula:
      "Visitors × Signup Conversion × Paid Conversion × Average Revenue × Retention = Projected Revenue; then minus variable and fixed costs.",
    notice: "LOW / BASE / HIGH are scenarios, not promised results. Do not use these figures in lender or public claims.",
    low: scenario(low, "LOW"),
    base: scenario(base, "BASE"),
    high: scenario(high, "HIGH"),
  };
}

module.exports = { forecast, scenario };
