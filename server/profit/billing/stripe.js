"use strict";

/**
 * Stripe adapter. Cards stay on Stripe. SmartRealty never stores PAN/CVV.
 *
 * Production charging is hard-disabled until:
 *   1. STRIPE_SECRET_KEY is present
 *   2. catalog.productionComplianceReview === "completed"
 *   3. config.productionApproved === true  (hard-coded false in config.js)
 *
 * This file does not call Stripe until those gates pass. No SDK dependency yet.
 */

function createStripeBillingProvider(config = {}) {
  const secret = String(config.stripeSecretKey || "");
  const configured = secret.length > 20 && !/change[-_ ]?me|example|sk_test_placeholder/i.test(secret);
  const productionApproved = config.productionApproved === true;

  function blocked(action) {
    const err = new Error(
      productionApproved && configured
        ? "Stripe live charging is still gated by productionApproved=false in config."
        : `Stripe is not live. ${action} stays in sandbox until keys and compliance review exist.`
    );
    err.status = 503;
    err.expose = true;
    err.code = "BILLING_NOT_LIVE";
    err.sandbox = true;
    return err;
  }

  return {
    name: "stripe",
    live: false,
    configured,
    productionApproved: false,

    async createCustomer() {
      throw blocked("createCustomer");
    },
    async createCheckoutSession() {
      throw blocked("createCheckoutSession");
    },
    async getSubscription() {
      throw blocked("getSubscription");
    },
    async cancelSubscription() {
      throw blocked("cancelSubscription");
    },
    async createBillingPortal() {
      throw blocked("createBillingPortal");
    },
  };
}

module.exports = { createStripeBillingProvider };
