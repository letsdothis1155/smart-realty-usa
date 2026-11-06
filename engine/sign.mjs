import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC token: listingId.exp.sig. The secret stays off the site and out of git. */

export function signToken(listingId, secret, ttlSec = 600, now = Date.now()) {
  if (!listingId || !secret) throw new Error("listing id and secret are required");
  const exp = Math.floor(now / 1000) + ttlSec;
  const body = `${listingId}.${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token, secret, now = Date.now()) {
  const parts = String(token || "").split(".");
  if (parts.length < 3 || !secret) return { ok: false, reason: "malformed" };
  const sig = parts.pop();
  const expStr = parts.pop();
  const listingId = parts.join(".");
  const exp = Number(expStr);
  if (!listingId || !Number.isFinite(exp)) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", secret).update(`${listingId}.${expStr}`).digest("base64url");
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, reason: "bad-signature" };
  }
  if (exp * 1000 <= now) return { ok: false, reason: "expired" };
  return { ok: true, listingId, exp };
}
