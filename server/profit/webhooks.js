"use strict";

const { grantEntitlement, revokeEntitlement } = require("./entitlements");
const { recordRevenue } = require("./ledger");

const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
];

function revenueTypeFor(planId, catalog) {
  const plan = catalog?.plans?.[planId];
  if (plan?.audience === "agent") return "agent";
  if (plan?.audience === "business" || plan?.audience === "enterprise") return "business";
  return "subscription";
}

/**
 * Stripe webhook handler for the billing/profit engine.
 *
 * Only ever receives real events once STRIPE_WEBHOOK_SECRET is set and Stripe
 * is pointed at this endpoint — that alone does not enable live charging;
 * checkout itself still stays gated by billing.productionApproved.
 */
function createBillingWebhookHandler({ store, billingProvider, webhookSecret, stripeClient, getCatalog }) {
  function client() {
    if (stripeClient) return stripeClient;
    const Stripe = require("stripe");
    return new Stripe("sk_placeholder_webhook_only", { apiVersion: "2024-06-20" });
  }

  function verifyAndParse(req) {
    if (!webhookSecret) {
      const err = new Error("Stripe webhook secret is not configured.");
      err.status = 503;
      throw err;
    }
    const signature = req.get("stripe-signature");
    return client().webhooks.constructEvent(req.rawBody || "", signature, webhookSecret);
  }

  function alreadyProcessed(eventId) {
    return store.mutate((db) => {
      if (db.webhookReceipts.some((r) => r.providerEventId === eventId)) {
        return true;
      }
      db.webhookReceipts.push({
        providerEventId: eventId,
        provider: "stripe",
        receivedAt: store.now(),
      });
      return false;
    });
  }

  function upsertSubscription(sub, { userId, planId, billingPeriod }) {
    return store.mutate((db) => {
      let row = db.subscriptions.find((s) => s.provider_subscription_id === sub.id);
      const periodStart = sub.current_period_start
        ? new Date(sub.current_period_start * 1000).toISOString()
        : new Date().toISOString();
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;
      if (!row) {
        row = {
          id: store.id("sub"),
          user_id: userId,
          provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
          provider_subscription_id: sub.id,
          created_at: store.now(),
        };
        db.subscriptions.push(row);
      }
      row.plan = planId || row.plan;
      row.billing_period = billingPeriod || row.billing_period || "monthly";
      row.status = sub.status;
      row.amount_cents = sub.items?.data?.[0]?.price?.unit_amount ?? row.amount_cents ?? 0;
      row.currency = sub.currency || row.currency || "usd";
      row.current_period_start = periodStart;
      row.current_period_end = periodEnd;
      row.sandbox = false;
      row.updated_at = store.now();
      if (sub.status === "canceled") row.canceled_at = store.now();
      return row;
    });
  }

  async function handleCheckoutCompleted(session) {
    const userId = session.client_reference_id || session.metadata?.smartrealty_user_id;
    const planId = session.metadata?.plan_id;
    const billingPeriod = session.metadata?.billing_period || "monthly";
    if (!userId || !planId || session.mode !== "subscription" || !session.subscription) return;

    if (billingProvider?._linkCustomer && session.customer) {
      billingProvider._linkCustomer(userId, session.customer);
    }

    const sub = await client().subscriptions.retrieve(session.subscription);
    const row = upsertSubscription(sub, { userId, planId, billingPeriod });

    grantEntitlement(store, {
      userId,
      plan: planId,
      source: "stripe_checkout",
      subscriptionId: row.id,
    });

    recordRevenue(store, {
      userId,
      revenueType: revenueTypeFor(planId, getCatalog ? getCatalog() : null),
      source: planId,
      grossAmountCents: row.amount_cents || 0,
      feesCents: 0,
      currency: row.currency || "usd",
      sandbox: false,
      externalReference: row.id,
    });
  }

  async function handleSubscriptionUpdated(sub) {
    const row = store.read().subscriptions.find((s) => s.provider_subscription_id === sub.id);
    if (!row) return; // unknown subscription (e.g. created outside our checkout flow)
    upsertSubscription(sub, { userId: row.user_id, planId: row.plan, billingPeriod: row.billing_period });
    if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired") {
      revokeEntitlement(store, row.user_id, sub.status);
    }
  }

  async function apply(event) {
    if (!HANDLED_EVENTS.includes(event.type)) {
      return { ok: true, handled: false };
    }
    if (alreadyProcessed(event.id)) {
      return { ok: true, duplicate: true };
    }
    const obj = event.data.object;
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(obj);
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await handleSubscriptionUpdated(obj);
    }
    // invoice.paid: recurring renewals: subscription.updated already keeps the
    // period/status in sync; recurring revenue recognition is a P2 (ledger
    // entry per renewal) — not required for the first live charge to work.
    return { ok: true, handled: true };
  }

  return { verifyAndParse, apply };
}

module.exports = { createBillingWebhookHandler };
