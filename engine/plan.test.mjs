import assert from "node:assert/strict";
import test from "node:test";
import {
  COUNTER_HEIGHT_M,
  DOOR_HEIGHT_M,
  DOOR_WIDTH_M,
  insidePlan,
  moveBlocked,
  planListing,
} from "./plan.mjs";

const RADIUS = 0.2;

test("Blain square footage is split across a walkable plan", () => {
  const plan = planListing({ id: "hud-413-772606", sqft: 1456, beds: 3, baths: 2 });
  assert.equal(plan.fitsListing, true);
  assert.ok(Math.abs(plan.totalSqft - 1456) / 1456 < 0.03, `total ${plan.totalSqft}`);
  assert.equal(plan.rooms.length, 9);
  assert.ok(plan.rooms.every((room) => room.estimated && room.sizeSource === "estimated"));
  assert.equal(plan.hall.estimated, true);
  assert.equal(plan.start.yaw, 0);
  assert.equal(plan.start.id, "living");
  assert.ok(Math.abs(DOOR_HEIGHT_M - 80 * 0.0254) < 1e-9);
  assert.ok(Math.abs(COUNTER_HEIGHT_M - 36 * 0.0254) < 1e-9);
  assert.equal(plan.references.counterHeightM, COUNTER_HEIGHT_M);
});

test("the living door opens and the photo wall does not", () => {
  const plan = planListing({ id: "hud-413-772606", sqft: 1456, beds: 3, baths: 2 });
  const living = plan.rooms.find((room) => room.id === "living");
  const kitchen = plan.rooms.find((room) => room.id === "kitchen");
  const bed = plan.rooms.find((room) => room.id === "primary-bedroom");
  assert.equal(
    moveBlocked(living.doorX, -0.35, living.doorX, plan.hall.d / 2, plan.walls, RADIUS),
    false,
  );
  assert.equal(insidePlan(living.doorX, plan.hall.d / 2, plan.rects), true);
  assert.equal(
    moveBlocked(living.doorX, living.z + 0.35, living.doorX, living.z - 0.35, plan.walls, RADIUS),
    true,
  );
  assert.equal(insidePlan(living.doorX, living.z - 0.35, plan.rects), false);
  const beside = living.doorX + living.doorW / 2 + 0.35;
  assert.equal(moveBlocked(beside, -0.35, beside, 0.35, plan.walls, RADIUS), true);
  const wallX = living.x + living.w;
  const midZ = living.z + living.d / 2;
  assert.equal(moveBlocked(wallX - 0.35, midZ, wallX + 0.35, midZ, plan.walls, RADIUS), true);
  assert.equal(
    moveBlocked(bed.doorX, plan.hall.d / 2, bed.doorX, bed.z + 0.45, plan.walls, RADIUS),
    false,
  );
  assert.ok(kitchen.x > living.x);
  assert.ok(Math.abs(DOOR_WIDTH_M - living.doorW) < 1e-9);
});

test("a listed 12 by 14 room is not resized", () => {
  const plan = planListing({
    id: "sized",
    sqft: 2000,
    beds: 3,
    baths: 2,
    roomSizes: ["Bedroom 1: 12x14"],
  });
  const bed = plan.rooms.find((room) => room.id === "bedroom-1");
  assert.equal(bed.estimated, false);
  assert.equal(bed.sizeSource, "listed");
  assert.ok(Math.abs(bed.widthFt - 12) < 0.02);
  assert.ok(Math.abs(bed.depthFt - 14) < 0.02);
  assert.ok(plan.rooms.filter((room) => room.id !== "bedroom-1").every((room) => room.estimated));
  assert.equal(plan.fitsListing, true);
  assert.ok(Math.abs(plan.totalSqft - 2000) / 2000 < 0.03, `total ${plan.totalSqft}`);
});

test("listed rooms that already exceed the total are not shrunk", () => {
  const plan = planListing({
    id: "over",
    sqft: 100,
    beds: 1,
    baths: 1,
    roomSizes: [
      { id: "living", widthFt: 20, lengthFt: 20 },
      { id: "primary-bedroom", widthFt: 12, lengthFt: 14 },
    ],
  });
  const living = plan.rooms.find((room) => room.id === "living");
  const bed = plan.rooms.find((room) => room.id === "primary-bedroom");
  assert.ok(Math.abs(living.widthFt - 20) < 0.02);
  assert.ok(Math.abs(living.depthFt - 20) < 0.02);
  assert.ok(Math.abs(bed.widthFt - 12) < 0.02);
  assert.ok(Math.abs(bed.depthFt - 14) < 0.02);
  assert.equal(plan.fitsListing, false);
  assert.ok(plan.totalSqft > 100);
});
