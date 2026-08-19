"use strict";

const { createMockBillingProvider } = require("./mock");
const { createStripeBillingProvider } = require("./stripe");

/**
 * BillingProvider:
 *   createCustomer(userId)
 *   createCheckoutSession(input)
 *   getSubscription(userId)
 *   cancelSubscription(subscriptionId)
 *   createBillingPortal(userId)
 *
 * Never store raw card information in SmartRealty.
 */

function createBillingProvider(config = {}, { store } = {}) {
  const requested = String(config.mode || "mock").toLowerCase();
  const stripe = createStripeBillingProvider(config);
  const mock = createMockBillingProvider({ store });

  if (requested === "stripe") {
    if (stripe.configured && config.productionApproved === true) {
      // Hard gate: productionApproved is false in config.js.
      return stripe;
    }
    mock.forcedFromProvider = true;
    mock.providerReason = stripe.configured ? "compliance_not_approved" : "missing_processor_credentials";
    mock.requestedProvider = "stripe";
    return mock;
  }

  return mock;
}

module.exports = { createBillingProvider };
