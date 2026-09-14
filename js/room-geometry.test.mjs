import test from "node:test";
import assert from "node:assert/strict";
import { boxInsidePolygon, normalizeFloorPolygon, pointInPolygon, rectanglePolygon } from "./room-geometry.mjs";

test("keeps a valid L-shaped floor polygon", () => {
  const l = [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 2 }, { x: -3, z: 2 }];
  assert.deepEqual(normalizeFloorPolygon(l, 6, 4), l);
  assert.equal(pointInPolygon({ x: 2, z: 1 }, l), false);
  assert.equal(pointInPolygon({ x: 0, z: 1 }, l), true);
});

test("rejects unsafe polygons and falls back to room bounds", () => {
  assert.deepEqual(normalizeFloorPolygon([{ x: 99, z: 99 }], 6, 4), rectanglePolygon(6, 4));
  const crossed = [{ x: -2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }, { x: 2, z: -2 }];
  assert.deepEqual(normalizeFloorPolygon(crossed, 6, 4), rectanglePolygon(6, 4));
});

test("requires every furniture footprint corner inside the room", () => {
  const l = [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 2 }, { x: -3, z: 2 }];
  assert.equal(boxInsidePolygon({ min: { x: -1, z: 0.2 }, max: { x: 0, z: 1 } }, l), true);
  assert.equal(boxInsidePolygon({ min: { x: 1.5, z: 0.2 }, max: { x: 2.5, z: 1 } }, l), false);
});
