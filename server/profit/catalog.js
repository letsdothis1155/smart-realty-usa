"use strict";

/**
 * Configurable plan catalog. Default dollar amounts are starting values for
 * the admin system — they are not live billed prices.
 *
 * Live charging stays off until a payment processor is configured AND
 * compliance review is complete. Admin can change amounts without a deploy.
 */

const { PLANS } = require("./constants");

const FEATURES = {
  account: {
    id: "account",
    label: "SmartRealty account",
    legallyRequired: false,
    alwaysFree: true,
  },
  basic_dashboard: {
    id: "basic_dashboard",
    label: "Basic dashboard",
    alwaysFree: true,
  },
  direct_deposit_setup: {
    id: "direct_deposit_setup",
    label: "Direct deposit setup",
    alwaysFree: true,
    notes: "Direct deposit is a retention feature, not a paid product.",
  },
  limited_property_goals: {
    id: "limited_property_goals",
    label: "One property goal",
    alwaysFree: true,
  },
  unlimited_property_goals: {
    id: "unlimited_property_goals",
    label: "Unlimited property goals",
  },
  basic_income_organization: {
    id: "basic_income_organization",
    label: "Basic income organization",
    alwaysFree: true,
  },
  basic_property_search: {
    id: "basic_property_search",
    label: "Basic property search",
    alwaysFree: true,
  },
  standard_education: {
    id: "standard_education",
    label: "Standard educational content",
    alwaysFree: true,
  },
  limited_smartsplit: {
    id: "limited_smartsplit",
    label: "Limited SmartSplit rules",
    alwaysFree: true,
  },
  advanced_smartsplit: {
    id: "advanced_smartsplit",
    label: "Advanced SmartSplit rules",
  },
  custom_paycheck_allocations: {
    id: "custom_paycheck_allocations",
    label: "Custom paycheck allocations",
  },
  basic_notifications: {
    id: "basic_notifications",
    label: "Basic notifications",
    alwaysFree: true,
  },
  advanced_budgeting: {
    id: "advanced_budgeting",
    label: "Advanced budgeting",
  },
  home_buying_prep: {
    id: "home_buying_prep",
    label: "Home-buying preparation dashboard",
  },
  rent_planning: {
    id: "rent_planning",
    label: "Rent planning",
  },
  moving_planner: {
    id: "moving_planner",
    label: "Moving planner",
  },
  closing_cost_planner: {
    id: "closing_cost_planner",
    label: "Closing-cost planner",
  },
  property_expense_tracking: {
    id: "property_expense_tracking",
    label: "Property expense tracking",
  },
  advanced_alerts: {
    id: "advanced_alerts",
    label: "Advanced alerts",
  },
  personalized_property_insights: {
    id: "personalized_property_insights",
    label: "Personalized property insights",
  },
  enhanced_reports: {
    id: "enhanced_reports",
    label: "Enhanced reports",
  },
  financial_progress_history: {
    id: "financial_progress_history",
    label: "Financial progress history",
  },
  family_shared_goals: {
    id: "family_shared_goals",
    label: "Family / shared goal features",
  },
  legally_required_financial_info: {
    id: "legally_required_financial_info",
    label: "Legally required financial information",
    legallyRequired: true,
    alwaysFree: true,
    notes: "Never lock required disclosures or account statements behind a paywall.",
  },
  ai_property_analysis: {
    id: "ai_property_analysis",
    label: "AI Property Intelligence",
    estimateDisclaimer:
      "Estimates only. Not a guaranteed investment return, appraisal, or offer.",
  },
  portfolio_dashboard: {
    id: "portfolio_dashboard",
    label: "Property portfolio dashboard",
  },
  lead_management: { id: "lead_management", label: "Lead management" },
  client_pipeline: { id: "client_pipeline", label: "Client pipeline" },
  property_income_tracking: {
    id: "property_income_tracking",
    label: "Property income tracking",
  },
  document_organization: {
    id: "document_organization",
    label: "Document organization",
  },
  automated_follow_ups: {
    id: "automated_follow_ups",
    label: "Automated follow-ups",
  },
  crm: { id: "crm", label: "CRM" },
  marketing_tools: { id: "marketing_tools", label: "Marketing tools" },
  listing_analytics: { id: "listing_analytics", label: "Listing analytics" },
  team_features: { id: "team_features", label: "Team features" },
  agent_profile: { id: "agent_profile", label: "Agent profile" },
  lead_inbox: { id: "lead_inbox", label: "Lead inbox" },
  client_goals: { id: "client_goals", label: "Client goals" },
  follow_up_automation: {
    id: "follow_up_automation",
    label: "Follow-up automation",
  },
  ai_marketing_assistant: {
    id: "ai_marketing_assistant",
    label: "AI marketing assistant",
  },
  listing_pages: { id: "listing_pages", label: "Listing pages" },
  referral_tracking: { id: "referral_tracking", label: "Referral tracking" },
  document_management: {
    id: "document_management",
    label: "Document management",
  },
  rent_tracking: {
    id: "rent_tracking",
    label: "Rent tracking",
    notes: "Tracking only. Rent collection / custody of funds is not enabled.",
  },
  tenant_portal: { id: "tenant_portal", label: "Tenant portal" },
  maintenance_requests: {
    id: "maintenance_requests",
    label: "Maintenance requests",
  },
  lease_reminders: { id: "lease_reminders", label: "Lease reminders" },
  portfolio_analytics: {
    id: "portfolio_analytics",
    label: "Portfolio analytics",
  },
  vendor_management: { id: "vendor_management", label: "Vendor management" },
  team_accounts: { id: "team_accounts", label: "Team accounts" },
  multiple_properties: {
    id: "multiple_properties",
    label: "Multiple properties",
  },
  permissions: { id: "permissions", label: "Permissions" },
  reports: { id: "reports", label: "Reports" },
  ai_automation: { id: "ai_automation", label: "AI automation" },
  client_management: { id: "client_management", label: "Client management" },
  document_storage: { id: "document_storage", label: "Document storage" },
  lead_tracking: { id: "lead_tracking", label: "Lead tracking" },
  custom_branding: { id: "custom_branding", label: "Custom branding" },
  team_management: { id: "team_management", label: "Team management" },
  role_permissions: { id: "role_permissions", label: "Role permissions" },
  api_access: { id: "api_access", label: "API access" },
  advanced_analytics: { id: "advanced_analytics", label: "Advanced analytics" },
  bulk_user_management: {
    id: "bulk_user_management",
    label: "Bulk user management",
  },
  dedicated_support: { id: "dedicated_support", label: "Dedicated support" },
  custom_integrations: {
    id: "custom_integrations",
    label: "Custom integrations",
  },
  contract_billing: { id: "contract_billing", label: "Contract billing" },
  employer_program: { id: "employer_program", label: "Workplace program" },
  verified_business: {
    id: "verified_business",
    label: "SmartRealty Verified Business",
  },
  pro_profile: { id: "pro_profile", label: "SmartRealty Pro Profile" },
};

const FREE_FEATURES = [
  "account",
  "basic_dashboard",
  "direct_deposit_setup",
  "limited_property_goals",
  "basic_income_organization",
  "basic_property_search",
  "standard_education",
  "limited_smartsplit",
  "basic_notifications",
  "legally_required_financial_info",
];

const PLUS_FEATURES = [
  ...FREE_FEATURES,
  "unlimited_property_goals",
  "advanced_smartsplit",
  "custom_paycheck_allocations",
  "advanced_budgeting",
  "home_buying_prep",
  "rent_planning",
  "moving_planner",
  "closing_cost_planner",
  "property_expense_tracking",
  "advanced_alerts",
  "personalized_property_insights",
  "enhanced_reports",
  "financial_progress_history",
  "family_shared_goals",
  "ai_property_analysis",
];

const PRO_FEATURES = [
  ...PLUS_FEATURES,
  "portfolio_dashboard",
  "lead_management",
  "client_pipeline",
  "property_income_tracking",
  "document_organization",
  "automated_follow_ups",
  "crm",
  "marketing_tools",
  "listing_analytics",
  "team_features",
  "rent_tracking",
  "tenant_portal",
  "maintenance_requests",
  "lease_reminders",
  "portfolio_analytics",
  "vendor_management",
];

const BUSINESS_FEATURES = [
  ...PRO_FEATURES,
  "team_accounts",
  "multiple_properties",
  "permissions",
  "reports",
  "ai_automation",
  "client_management",
  "document_storage",
  "lead_tracking",
];

const ENTERPRISE_FEATURES = [
  ...BUSINESS_FEATURES,
  "custom_branding",
  "team_management",
  "role_permissions",
  "api_access",
  "advanced_analytics",
  "bulk_user_management",
  "dedicated_support",
  "custom_integrations",
  "contract_billing",
  "employer_program",
];

const AGENT_STARTER_FEATURES = [
  "account",
  "agent_profile",
  "lead_inbox",
  "client_goals",
  "basic_property_search",
  "listing_pages",
  "standard_education",
  "legally_required_financial_info",
];

const AGENT_PRO_FEATURES = [
  ...AGENT_STARTER_FEATURES,
  "crm",
  "follow_up_automation",
  "ai_marketing_assistant",
  "listing_analytics",
  "referral_tracking",
  "document_management",
  "lead_management",
  "client_pipeline",
  "enhanced_reports",
];

const BROKERAGE_FEATURES = [
  ...AGENT_PRO_FEATURES,
  "team_features",
  "team_accounts",
  "permissions",
  "role_permissions",
  "advanced_analytics",
  "custom_branding",
  "bulk_user_management",
];

function annualSavingsPercent(monthlyCents, annualCents) {
  const yearAtMonthly = monthlyCents * 12;
  if (!yearAtMonthly || annualCents >= yearAtMonthly) return 0;
  return Math.round(((yearAtMonthly - annualCents) / yearAtMonthly) * 1000) / 10;
}

function defaultPlans() {
  const plusMonthly = 999;
  const plusAnnual = 9990;
  const proMonthly = 2999;
  const proAnnual = 29990;
  const businessMonthly = 7900;
  const businessAnnual = 79000;
  const agentStarterMonthly = 4900;
  const agentStarterAnnual = 49000;
  const agentProMonthly = 9900;
  const agentProAnnual = 99000;
  const brokerageMonthly = 29900;
  const brokerageAnnual = 299000;

  return {
    free: {
      id: "free",
      name: "SmartRealty Free",
      audience: "consumer",
      tagline: "Organize a paycheck around a real property goal.",
      priceMonthlyCents: 0,
      priceAnnualCents: 0,
      currency: "usd",
      features: FREE_FEATURES,
      limits: { propertyGoals: 1, smartsplitRules: 2 },
      live: true,
      comingSoon: false,
    },
    plus: {
      id: "plus",
      name: "SmartRealty Plus",
      audience: "consumer",
      tagline: "Turn every paycheck into a smarter property plan.",
      priceMonthlyCents: plusMonthly,
      priceAnnualCents: plusAnnual,
      annualSavingsPercent: annualSavingsPercent(plusMonthly, plusAnnual),
      currency: "usd",
      features: PLUS_FEATURES,
      limits: { propertyGoals: null, smartsplitRules: null },
      live: false,
      comingSoon: true,
    },
    pro: {
      id: "pro",
      name: "SmartRealty Pro",
      audience: "professional",
      tagline: "Portfolio, pipeline, and property operations in one place.",
      priceMonthlyCents: proMonthly,
      priceAnnualCents: proAnnual,
      annualSavingsPercent: annualSavingsPercent(proMonthly, proAnnual),
      currency: "usd",
      features: PRO_FEATURES,
      limits: { propertyGoals: null, smartsplitRules: null },
      live: false,
      comingSoon: true,
    },
    business: {
      id: "business",
      name: "SmartRealty Business",
      audience: "business",
      tagline: "Team tools for agents, landlords, and small real-estate companies.",
      priceMonthlyCents: businessMonthly,
      priceAnnualCents: businessAnnual,
      annualSavingsPercent: annualSavingsPercent(businessMonthly, businessAnnual),
      currency: "usd",
      features: BUSINESS_FEATURES,
      limits: {},
      live: false,
      comingSoon: true,
    },
    enterprise: {
      id: "enterprise",
      name: "SmartRealty Enterprise",
      audience: "enterprise",
      tagline: "Contract billing, branding, and bulk administration.",
      priceMonthlyCents: null,
      priceAnnualCents: null,
      currency: "usd",
      features: ENTERPRISE_FEATURES,
      limits: {},
      live: false,
      comingSoon: true,
      contractBilling: true,
    },
    agent_starter: {
      id: "agent_starter",
      name: "Agent Starter",
      audience: "agent",
      tagline: "A professional profile and a lead inbox.",
      priceMonthlyCents: agentStarterMonthly,
      priceAnnualCents: agentStarterAnnual,
      annualSavingsPercent: annualSavingsPercent(agentStarterMonthly, agentStarterAnnual),
      currency: "usd",
      features: AGENT_STARTER_FEATURES,
      limits: {},
      live: false,
      comingSoon: true,
    },
    agent_pro: {
      id: "agent_pro",
      name: "Agent Pro",
      audience: "agent",
      tagline: "CRM, automation, and listing analytics for working agents.",
      priceMonthlyCents: agentProMonthly,
      priceAnnualCents: agentProAnnual,
      annualSavingsPercent: annualSavingsPercent(agentProMonthly, agentProAnnual),
      currency: "usd",
      features: AGENT_PRO_FEATURES,
      limits: {},
      live: false,
      comingSoon: true,
    },
    brokerage: {
      id: "brokerage",
      name: "Brokerage",
      audience: "agent",
      tagline: "Team seats, permissions, and brokerage analytics.",
      priceMonthlyCents: brokerageMonthly,
      priceAnnualCents: brokerageAnnual,
      annualSavingsPercent: annualSavingsPercent(brokerageMonthly, brokerageAnnual),
      currency: "usd",
      features: BROKERAGE_FEATURES,
      limits: {},
      live: false,
      comingSoon: true,
    },
  };
}

function defaultCatalog() {
  return {
    version: 1,
    liveCharging: false,
    productionComplianceReview: "required",
    currency: "usd",
    trialDays: 0,
    trialCopy: "No trial is running. You will not be charged.",
    positioning: {
      plus: "Turn every paycheck into a smarter property plan.",
      freeValue: "Free must stay useful. Direct deposit and one property goal stay free.",
    },
    phases: {
      current: 1,
      labels: {
        1: "Subscription infrastructure, Free/Plus architecture, entitlements, revenue and cost analytics",
        2: "Plus product, AI Property Intelligence, Home Goal premium, annual plans",
        3: "Agents, professional profiles, B2B subscriptions, marketplace",
        4: "Partnerships, referral revenue, SmartRealty Business",
        5: "Enterprise, employer programs, advanced marketplace economics",
      },
    },
    plans: defaultPlans(),
    features: FEATURES,
    updatedAt: null,
  };
}

function cloneCatalog(src) {
  return JSON.parse(JSON.stringify(src || defaultCatalog()));
}

function normalizePlan(plan, fallback) {
  const base = fallback || {};
  const next = { ...base, ...plan };
  if (next.id && !PLANS.includes(next.id) && !String(next.id).startsWith("custom_")) {
    // Custom plan ids are allowed so packages can change later.
  }
  if (typeof next.priceMonthlyCents === "number" && typeof next.priceAnnualCents === "number") {
    next.annualSavingsPercent = annualSavingsPercent(next.priceMonthlyCents, next.priceAnnualCents);
  }
  if (!Array.isArray(next.features)) next.features = base.features || [];
  if (!next.limits || typeof next.limits !== "object") next.limits = base.limits || {};
  next.currency = next.currency || "usd";
  return next;
}

function mergeCatalog(stored) {
  const defaults = defaultCatalog();
  if (!stored || typeof stored !== "object") return defaults;
  const plans = { ...defaults.plans };
  const incoming = stored.plans || {};
  for (const [id, plan] of Object.entries(incoming)) {
    plans[id] = normalizePlan(plan, plans[id] || { id, features: [], limits: {} });
  }
  return {
    ...defaults,
    ...stored,
    liveCharging: false,
    productionComplianceReview: stored.productionComplianceReview || "required",
    plans,
    features: { ...defaults.features, ...(stored.features || {}) },
  };
}

function publicCatalog(catalog) {
  const c = mergeCatalog(catalog);
  const plans = {};
  for (const [id, plan] of Object.entries(c.plans)) {
    plans[id] = {
      id: plan.id,
      name: plan.name,
      audience: plan.audience,
      tagline: plan.tagline,
      priceMonthlyCents: plan.priceMonthlyCents,
      priceAnnualCents: plan.priceAnnualCents,
      annualSavingsPercent: plan.annualSavingsPercent || 0,
      currency: plan.currency || "usd",
      features: plan.features,
      limits: plan.limits || {},
      live: !!plan.live,
      comingSoon: plan.comingSoon !== false && !plan.live && id !== "free",
      contractBilling: !!plan.contractBilling,
    };
  }
  return {
    liveCharging: false,
    productionComplianceReview: c.productionComplianceReview,
    currency: c.currency,
    trialDays: c.trialDays || 0,
    trialCopy: c.trialCopy,
    positioning: c.positioning,
    phases: c.phases,
    plans,
    features: Object.fromEntries(
      Object.entries(c.features).map(([id, f]) => [
        id,
        {
          id,
          label: f.label,
          legallyRequired: !!f.legallyRequired,
          alwaysFree: !!f.alwaysFree,
          estimateDisclaimer: f.estimateDisclaimer || null,
          notes: f.notes || null,
        },
      ])
    ),
    notice:
      "Default prices are catalog values for the admin system. Live charging is disabled. No card data is stored by SmartRealty.",
  };
}

function planHasFeature(plan, featureId) {
  if (!plan) return false;
  if (FEATURES[featureId]?.alwaysFree || FEATURES[featureId]?.legallyRequired) return true;
  return Array.isArray(plan.features) && plan.features.includes(featureId);
}

function featureLimit(plan, limitKey) {
  if (!plan || !plan.limits) return null;
  const v = plan.limits[limitKey];
  return v == null ? null : v;
}

module.exports = {
  FEATURES,
  FREE_FEATURES,
  PLUS_FEATURES,
  PRO_FEATURES,
  BUSINESS_FEATURES,
  ENTERPRISE_FEATURES,
  defaultCatalog,
  defaultPlans,
  cloneCatalog,
  mergeCatalog,
  publicCatalog,
  planHasFeature,
  featureLimit,
  annualSavingsPercent,
  normalizePlan,
};
