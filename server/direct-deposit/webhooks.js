"use strict";

const { verifyWebhookSignature } = require("../lib/hmac");
const { SWITCH_STATUS, WEBHOOK_EVENTS } = require("./constants");

const EVENT_STATUS = {
  "switch.created": SWITCH_STATUS.PENDING,
  "switch.pending": SWITCH_STATUS.PENDING,
  "switch.active": SWITCH_STATUS.ACTIVE,
  "switch.failed": SWITCH_STATUS.FAILED,
  "switch.cancelled": SWITCH_STATUS.DISABLED,
  "connection.created": null,
  "connection.updated": null,
};

function createWebhookHandler({ store, audit, webhookSecret }) {
  function verify(req) {
    return verifyWebhookSignature({
      secret: webhookSecret,
      timestamp: req.get("x-sr-webhook-timestamp") || req.get("x-webhook-timestamp"),
      rawBody: req.rawBody || JSON.stringify(req.body || {}),
      signature: req.get("x-sr-webhook-signature") || req.get("x-webhook-signature"),
    });
  }

  function apply(body) {
    const eventType = String(body.type || body.event_type || "");
    const providerEventId = String(body.id || body.provider_event_id || "");
    if (!WEBHOOK_EVENTS.includes(eventType) || !providerEventId) {
      return { ok: false, status: 400, error: "Unsupported or incomplete event." };
    }

    const receipt = store.addWebhookReceipt(providerEventId, eventType);
    if (receipt.duplicate) {
      audit.log("dd.webhook.duplicate", { code: eventType, sandbox: true });
      return { ok: true, duplicate: true, status: 200 };
    }

    const providerSwitchId = body.switch_id || body.data?.switch_id || null;
    const providerConnectionId = body.connection_id || body.data?.connection_id || null;
    const nextStatus = EVENT_STATUS[eventType];

    let switchRow = providerSwitchId ? store.findSwitchByProviderId(providerSwitchId) : null;
    if (!switchRow && body.smartrealty_switch_id) {
      switchRow = store.getSwitch(body.smartrealty_switch_id);
    }

    if (switchRow && nextStatus) {
      store.updateSwitch(switchRow.id, { status: nextStatus });
      store.addEvent({
        userId: switchRow.user_id,
        switchId: switchRow.id,
        eventType,
        providerEventId,
        metadata: { sandbox: true, source: "webhook", fundsMoved: false },
      });
      audit.log("dd.webhook.applied", {
        userId: switchRow.user_id,
        switchId: switchRow.id,
        status: nextStatus,
        code: eventType,
        sandbox: true,
      });
    } else if (providerConnectionId && eventType.startsWith("connection.")) {
      const conn = store.findConnectionByProviderId(providerConnectionId);
      if (conn) {
        store.updateConnection(conn.id, { status: body.data?.status || conn.status });
      }
      audit.log("dd.webhook.connection", { code: eventType, sandbox: true });
    } else {
      audit.log("dd.webhook.unmatched", { code: eventType, sandbox: true });
    }

    return { ok: true, duplicate: false, status: 200 };
  }

  return { verify, apply };
}

module.exports = { createWebhookHandler, EVENT_STATUS };
