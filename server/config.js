"use strict";

function readConfig(env = process.env) {
  const jwtSecret = String(env.JWT_SECRET || "");
  const demoPassword = String(env.DEMO_PASSWORD || "");
  const publishedDemoPassword = ["Smart", "Realty2026"].join("");
  const issues = [];

  if (jwtSecret.length < 32 || /change[-_ ]?me|example|paste/i.test(jwtSecret)) {
    issues.push("jwt_secret_missing_or_weak");
  }
  if (
    demoPassword &&
    (demoPassword.length < 12 ||
      demoPassword === publishedDemoPassword ||
      /change[-_ ]?me|example|paste/i.test(demoPassword))
  ) {
    issues.push("demo_password_weak");
  }

  return {
    port: Number(env.AUTH_PORT || env.PORT || 8787),
    jwtSecret,
    jwtDays: Number(env.JWT_DAYS || 14),
    demoPassword,
    corsOrigin: env.CORS_ORIGIN || true,
    issues,
    serveStatic: env.SERVE_STATIC === "1",
    adminPassword: String(env.ADMIN_PASSWORD || env.SRU_ADMIN_PASSWORD || ""),
    directDeposit: readDirectDepositConfig(env),
    billing: readBillingConfig(env),
  };
}

function readDirectDepositConfig(env = process.env) {
  const requested = String(env.DIRECT_DEPOSIT_MODE || "mock").toLowerCase();
  return {
    mode: requested === "provider" ? "provider" : "mock",
    webhookSecret: String(env.DIRECT_DEPOSIT_WEBHOOK_SECRET || ""),
    pinwheelApiSecret: String(env.PINWHEEL_API_SECRET || ""),
    pinwheelApiUrl: String(env.PINWHEEL_API_URL || "https://sandbox.getpinwheel.com"),
    sandboxAccountDetails: env.DIRECT_DEPOSIT_SANDBOX_ACCOUNT_DETAILS === "1",
    productionApproved: false,
    productionFinancialActivity: false,
  };
}

function readBillingConfig(env = process.env) {
  const requested = String(env.BILLING_MODE || "mock").toLowerCase();
  const port = Number(env.AUTH_PORT || env.PORT || 8787);
  return {
    mode: requested === "stripe" ? "stripe" : "mock",
    stripeSecretKey: String(env.STRIPE_SECRET_KEY || ""),
    stripeWebhookSecret: String(env.STRIPE_WEBHOOK_SECRET || ""),
    stripePublishableKey: String(env.STRIPE_PUBLISHABLE_KEY || ""),
    appBaseUrl: String(env.APP_BASE_URL || `http://127.0.0.1:${port}`),
    // Price IDs from the admin's Stripe dashboard (test or live mode, matching
    // whichever STRIPE_SECRET_KEY is set). Checkout fails clearly if a plan
    // has no price configured rather than silently falling back.
    priceIds: {
      plus: {
        monthly: String(env.STRIPE_PRICE_PLUS_MONTHLY || ""),
        annual: String(env.STRIPE_PRICE_PLUS_ANNUAL || ""),
      },
      pro: {
        monthly: String(env.STRIPE_PRICE_PRO_MONTHLY || ""),
        annual: String(env.STRIPE_PRICE_PRO_ANNUAL || ""),
      },
      business: {
        monthly: String(env.STRIPE_PRICE_BUSINESS_MONTHLY || ""),
        annual: String(env.STRIPE_PRICE_BUSINESS_ANNUAL || ""),
      },
      agent_starter: {
        monthly: String(env.STRIPE_PRICE_AGENT_STARTER_MONTHLY || ""),
        annual: String(env.STRIPE_PRICE_AGENT_STARTER_ANNUAL || ""),
      },
      agent_pro: {
        monthly: String(env.STRIPE_PRICE_AGENT_PRO_MONTHLY || ""),
        annual: String(env.STRIPE_PRICE_AGENT_PRO_ANNUAL || ""),
      },
      brokerage: {
        monthly: String(env.STRIPE_PRICE_BROKERAGE_MONTHLY || ""),
        annual: String(env.STRIPE_PRICE_BROKERAGE_ANNUAL || ""),
      },
    },
    productionApproved: false,
    liveCharging: false,
  };
}

function assertRequiredConfig(config) {
  if (config.issues.includes("jwt_secret_missing_or_weak")) {
    throw new Error("JWT_SECRET must be a non-placeholder secret of at least 32 characters.");
  }
}

module.exports = { readConfig, readDirectDepositConfig, readBillingConfig, assertRequiredConfig };
