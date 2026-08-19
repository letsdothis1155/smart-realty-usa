"use strict";

const { id } = require("../../lib/ids");

/**
 * Stripe adapter. Cards stay on Stripe (Checkout + Billing Portal) —
 * SmartRealty never sees or stores PAN/CVV.
 *
 * Production charging is hard-disabled until:
 *   1. STRIPE_SECRET_KEY is present and looks real
 *   2. config.productionApproved === true  (hard-coded false in config.js —
 *      not settable from the environment; changing it is a deliberate code
 *      edit, meant to happen only after the items in COMPLIANCE-PROFIT.md
 *      are actually resolved)
 *
 * Every money-moving method re-checks `live` itself rather than trusting the
 * caller, so this file is safe even if something upstream forgets the gate.
 */

function createStripeBillingProvider(config = {}, { store, stripeClient } = {}) {
  const secret = String(config.stripeSecretKey || "");
  const configured = secret.length > 20 && !/change[-_ ]?me|example|sk_test_placeholder/i.test(secret);
  const productionApproved = config.productionApproved === true;
  const live = configured && productionApproved;

  let cachedClient = stripeClient || null;
  function client() {
    if (!cachedClient) {
      const Stripe = require("stripe");
      cachedClient = new Stripe(secret, { apiVersion: "2024-06-20" });
    }
    return cachedClient;
  }

  function blocked(action) {
    const err = new Error(
      `Stripe is not live. ${action} stays in sandbox until keys and compliance review exist.`
    );
    err.status = 503;
    err.expose = true;
    err.code = "BILLING_NOT_LIVE";
    err.sandbox = true;
    return err;
  }

  function priceIdFor(planId, billingPeriod) {
    const plan = config.priceIds?.[planId];
    const priceId = plan?.[billingPeriod === "annual" ? "annual" : "monthly"];
    if (!priceId) {
      const err = new Error(`No Stripe price configured for "${planId}" (${billingPeriod}).`);
      err.status = 400;
      err.expose = true;
      err.code = "PRICE_NOT_CONFIGURED";
      throw err;
    }
    return priceId;
  }

  function findLocalCustomer(userId) {
    return store?.read().customers.find((c) => c.userId === userId && c.provider === "stripe") || null;
  }

  function upsertLocalCustomer(userId, providerCustomerId) {
    return store.mutate((db) => {
      let row = db.customers.find((c) => c.userId === userId && c.provider === "stripe");
      if (row) {
        row.providerCustomerId = providerCustomerId;
        return row;
      }
      row = {
        id: id("cus"),
        userId,
        provider: "stripe",
        providerCustomerId,
        createdAt: new Date().toISOString(),
      };
      db.customers.push(row);
      return row;
    });
  }

  return {
    name: "stripe",
    live,
    configured,
    productionApproved: false,

    // Lookup-only: does not create a Stripe customer. Checkout Sessions create
    // the Stripe customer themselves; the webhook links it back to this user.
    async createCustomer(userId) {
      const existing = findLocalCustomer(userId);
      if (existing) return existing;
      const err = new Error("No billing customer yet — complete checkout first.");
      err.status = 404;
      err.expose = true;
      err.code = "NO_CUSTOMER";
      throw err;
    },

    async createCheckoutSession(input) {
      if (!live) throw blocked("createCheckoutSession");
      const priceId = priceIdFor(input.planId, input.billingPeriod);
      const existing = findLocalCustomer(input.userId);
      const session = await client().checkout.sessions.create({
        mode: "subscription",
        customer: existing ? existing.providerCustomerId : undefined,
        customer_email: existing ? undefined : input.email || undefined,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: input.successUrl || `${config.appBaseUrl}/pricing/?checkout=success`,
        cancel_url: input.cancelUrl || `${config.appBaseUrl}/pricing/?checkout=canceled`,
        client_reference_id: input.userId,
        metadata: {
          smartrealty_user_id: input.userId,
          plan_id: input.planId,
          billing_period: input.billingPeriod,
        },
        subscription_data: {
          metadata: {
            smartrealty_user_id: input.userId,
            plan_id: input.planId,
            billing_period: input.billingPeriod,
          },
        },
        allow_promotion_codes: true,
      });
      return {
        id: session.id,
        url: session.url,
        sandbox: false,
        liveCharging: true,
      };
    },

    async getSubscription(userId) {
      if (!live) return { user_id: userId, plan: "free", status: "none", sandbox: false };
      const customer = findLocalCustomer(userId);
      if (!customer) return { user_id: userId, plan: "free", status: "none", sandbox: false };
      const subs = await client().subscriptions.list({
        customer: customer.providerCustomerId,
        status: "all",
        limit: 1,
      });
      return subs.data[0] || { user_id: userId, plan: "free", status: "none", sandbox: false };
    },

    async cancelSubscription(subscriptionId) {
      if (!live) throw blocked("cancelSubscription");
      const db = store.read();
      const row = db.subscriptions.find(
        (s) => s.id === subscriptionId || s.provider_subscription_id === subscriptionId
      );
      if (!row || !row.provider_subscription_id) {
        const err = new Error("Subscription not found.");
        err.status = 404;
        err.expose = true;
        err.code = "NOT_FOUND";
        throw err;
      }
      const canceled = await client().subscriptions.cancel(row.provider_subscription_id);
      return { ok: true, id: row.id, status: canceled.status, canceledImmediately: true };
    },

    async createBillingPortal(userId) {
      if (!live) throw blocked("createBillingPortal");
      const customer = findLocalCustomer(userId);
      if (!customer) throw blocked("createBillingPortal");
      const portal = await client().billingPortal.sessions.create({
        customer: customer.providerCustomerId,
        return_url: `${config.appBaseUrl}/account.html#billing`,
      });
      return portal.url;
    },

    // Used only by the webhook handler to link a completed Checkout Session's
    // Stripe customer back to our internal user id.
    _linkCustomer(userId, providerCustomerId) {
      return upsertLocalCustomer(userId, providerCustomerId);
    },
  };
}

module.exports = { createStripeBillingProvider };
