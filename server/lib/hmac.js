"use strict";

const crypto = require("node:crypto");

function signPayload(secret, timestamp, rawBody) {
  const data = `${timestamp}.${rawBody}`;
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function timingSafeEqualHex(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return false;
  const bufA = Buffer.from(left, "utf8");
  const bufB = Buffer.from(right, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyWebhookSignature({ secret, timestamp, rawBody, signature, now = Date.now(), maxAgeMs = 5 * 60 * 1000 }) {
  if (!secret) {
    return { ok: false, error: "webhook_secret_missing" };
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, error: "timestamp_invalid" };
  }
  const tsMs = ts < 1e12 ? ts * 1000 : ts;
  if (Math.abs(now - tsMs) > maxAgeMs) {
    return { ok: false, error: "replay_window" };
  }
  const expected = signPayload(secret, String(timestamp), rawBody || "");
  const provided = String(signature || "").replace(/^sha256=/i, "");
  if (!timingSafeEqualHex(expected, provided)) {
    return { ok: false, error: "signature_invalid" };
  }
  return { ok: true };
}

module.exports = { signPayload, timingSafeEqualHex, verifyWebhookSignature };
