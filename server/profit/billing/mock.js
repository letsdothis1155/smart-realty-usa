"use strict";

const { id } = require("../../lib/ids");

/**
 * Sandbox billing provider. Never stores card numbers.
 * Checkout completes only through an explicit sandbox confirm — no silent enroll.
 */

function createMockBillingProvider({ store } = {}) {
  return {
    name: "mock",
    live: false,
    configured: true,

    async createCustomer(userId) {
      const existing = store.read().customers.find((c) => c.userId === userId && c.provider === "mock");
      if (existing) return existing;
      return store.mutate((db) => {
        const row = {
          id: id("cus"),
          userId,
          provider: "mock",
          providerCustomerId: id("mockcus"),
          createdAt: new Date().toISOString(),
        };
        db.customers.push(row);
        return row;
      });
    },

    async createCheckoutSession(input) {
      const customer = await this.createCustomer(input.userId);
      return store.mutate((db) => {
        const session = {
          id: id("cs"),
          userId: input.userId,
          customerId: customer.id,
          provider: "mock",
          providerSessionId: id("mockcs"),
          planId: input.planId,
          billingPeriod: input.billingPeriod || "monthly",
          status: "open",
          sandbox: true,
          liveCharging: false,
          amountCents: input.amountCents || 0,
          currency: input.currency || "usd",
          successUrl: input.successUrl || "/pricing/?checkout=sandbox",
          cancelUrl: input.cancelUrl || "/pricing/?checkout=canceled",
          createdAt: new Date().toISOString(),
        };
        db.checkoutSessions.push(session);
        return {
          id: session.id,
          url: `/billing/sandbox?session=${encodeURIComponent(session.id)}`,
          sandbox: true,
          liveCharging: false,
          message: "Sandbox checkout. No card is collected. Live charging is disabled.",
        };
      });
    },

    async getSubscription(userId) {
      const rows = store.read().subscriptions.filter((s) => s.user_id === userId);
      const active = rows.find((s) => s.status === "active" || s.status === "trialing");
      return active || rows[rows.length - 1] || { user_id: userId, plan: "free", status: "none", sandbox: true };
    },

    async cancelSubscription(subscriptionId) {
      return store.mutate((db) => {
        const row = db.subscriptions.find((s) => s.id === subscriptionId || s.provider_subscription_id === subscriptionId);
        if (!row) {
          const err = new Error("Subscription not found.");
          err.status = 404;
          err.expose = true;
          err.code = "NOT_FOUND";
          throw err;
        }
        row.status = "canceled";
        row.canceled_at = new Date().toISOString();
        row.updated_at = row.canceled_at;
        return { ok: true, id: row.id, status: "canceled", canceledImmediately: true };
      });
    },

    async createBillingPortal(userId) {
      const customer = await this.createCustomer(userId);
      return `/account.html#billing?customer=${encodeURIComponent(customer.id)}`;
    },
  };
}

module.exports = { createMockBillingProvider };
