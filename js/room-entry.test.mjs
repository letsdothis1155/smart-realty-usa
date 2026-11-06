import test from "node:test";
import assert from "node:assert/strict";
import { photoRoomTarget } from "./room-entry.mjs";

test("a property stays in the 3D builder, including ones with photo-matched rooms", () => {
  assert.equal(photoRoomTarget("?listing=hud-413-772606"), "");
  assert.equal(photoRoomTarget("?listing=hud-413-772606&engine=planning"), "");
  assert.equal(photoRoomTarget("?listing=hud-413-772606&room=kitchen"), "");
  const photo = "https://example.com/hhs/Master_bedroom_2_816648_472511470.jpg";
  assert.equal(photoRoomTarget("?listing=hud-413-772606&photo=" + encodeURIComponent(photo)), "");
  assert.equal(photoRoomTarget("?listing=hud-other"), "");
});
