import assert from "node:assert/strict";
import test from "node:test";
import { signToken, verifyToken } from "./sign.mjs";

const secret = "test-secret-not-used-on-the-site";

test("a token round-trips until it expires", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const token = signToken("hud-413-772606", secret, 600, now);
  assert.deepEqual(verifyToken(token, secret, now + 1000), {
    ok: true,
    listingId: "hud-413-772606",
    exp: Math.floor(now / 1000) + 600,
  });
  assert.equal(verifyToken(token, secret, now + 601000).reason, "expired");
  assert.equal(verifyToken(`${token}x`, secret, now).reason, "bad-signature");
  assert.equal(verifyToken("nope", secret, now).reason, "malformed");
});
