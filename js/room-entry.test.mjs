import test from "node:test";
import assert from "node:assert/strict";
import { photoRoomTarget } from "./room-entry.mjs";

test("supported listings open their photo-derived room without loading the planning engine", () => {
  assert.equal(photoRoomTarget("?listing=hud-413-772606"),
    "/room-builder/reviewed/hud-413-772606-living.html");
});

test("the selected photo opens its own room and camera view", () => {
  const photo = "https://example.com/hhs/Master_bedroom_2_816648_472511470.jpg";
  assert.equal(photoRoomTarget("?listing=hud-413-772606&photo=" + encodeURIComponent(photo)),
    "/room-builder/photo-rooms/hud-413-772606-primary-bedroom.html?view=1");
});

test("planning mode, unknown rooms, and other listings keep their normal builder", () => {
  assert.equal(photoRoomTarget("?listing=hud-413-772606&engine=planning"), "");
  assert.equal(photoRoomTarget("?listing=hud-413-772606&room=custom-room"), "");
  assert.equal(photoRoomTarget("?listing=hud-other"), "");
});

test("an explicit room choice stays within the property registry", () => {
  assert.equal(photoRoomTarget("?listing=hud-413-772606&room=kitchen"),
    "/room-builder/photo-rooms/hud-413-772606-kitchen.html");
});
