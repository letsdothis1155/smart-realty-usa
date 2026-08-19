"use strict";

/**
 * SmartRealty profit engine — constants.
 * Live charging is disabled. Customer bank deposits are never company revenue.
 */

const REVENUE_TYPES = [
  "subscription",
  "marketplace",
  "agent",
  "business",
  "enterprise",
  "partner",
  "affiliate",
  "service",
  "other",
];

const COST_CATEGORIES = [
  "payment_processing",
  "banking_provider",
  "payroll_provider",
  "AI",
  "hosting",
  "email",
  "SMS",
  "data",
  "identity_verification",
  "fraud",
  "support",
  "marketing",
  "affiliate_payout",
  "infrastructure",
  "other",
];

const PLANS = [
  "free",
  "plus",
  "pro",
  "business",
  "enterprise",
  "agent_starter",
  "agent_pro",
  "brokerage",
];

const BILLING_PERIODS = ["monthly", "annual", "contract"];

const SUBSCRIPTION_STATUSES = [
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
];

const AFFILIATE_EVENTS = [
  "click",
  "signup",
  "qualified_lead",
  "conversion",
  "commission_pending",
  "commission_approved",
  "commission_paid",
];

const CHURN_REASONS = [
  "too_expensive",
  "not_using_it",
  "missing_features",
  "technical_problems",
  "found_another_solution",
  "other",
];

const PROFESSIONAL_CATEGORIES = [
  "agents",
  "brokers",
  "property_managers",
  "contractors",
  "inspectors",
  "movers",
  "lenders",
  "insurance",
];

const MARKETPLACE_CATEGORIES = [
  "real-estate-agents",
  "mortgage-providers",
  "home-inspectors",
  "moving-companies",
  "contractors",
  "property-managers",
  "insurance-providers",
  "title-companies",
  "home-improvement-providers",
];

const PARTNER_CATEGORIES = [
  "mortgage",
  "insurance",
  "moving",
  "internet",
  "utilities",
  "home-security",
  "property-maintenance",
  "home-improvement",
  "storage",
  "inspection",
  "title-closing",
];

const BANNED_MONETIZATION = [
  "selling_payroll_credentials",
  "selling_bank_transaction_histories",
  "selling_account_numbers",
  "secretly_selling_financial_profiles",
  "undisclosed_fees",
  "deceptive_free_trials",
  "difficult_cancellation",
  "fake_financial_products",
  "fabricated_investment_returns",
  "misleading_sponsored_recommendations",
  "unauthorized_withdrawals",
  "silent_paid_enrollment",
];

const ETHICS = {
  neverSellBankingData: true,
  neverSellPayrollCredentials: true,
  neverSellAccountNumbers: true,
  neverChargeForOrdinaryDirectDeposit: true,
  neverInventRevenue: true,
  neverAssumeInterchange: true,
  neverAssumeInterestSpread: true,
  neverAssumeDepositRevenue: true,
  neverAssumeAchFees: true,
  neverAssumeCardRevenue: true,
  cancellationMustBeStraightforward: true,
  valueFirstThenUpgrade: true,
  depositsAreNotCompanyRevenue: true,
  liveChargingDefault: false,
  rentCollectionRequiresCompliance: true,
};

module.exports = {
  REVENUE_TYPES,
  COST_CATEGORIES,
  PLANS,
  BILLING_PERIODS,
  SUBSCRIPTION_STATUSES,
  AFFILIATE_EVENTS,
  CHURN_REASONS,
  PROFESSIONAL_CATEGORIES,
  MARKETPLACE_CATEGORIES,
  PARTNER_CATEGORIES,
  BANNED_MONETIZATION,
  ETHICS,
};
