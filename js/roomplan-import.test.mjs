import test from "node:test";
import assert from "node:assert/strict";
import { parseRoomPlan } from "./roomplan-import.mjs";

const transform = (x, z, yaw = 0) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, x, 1.35, z, 1];
};

test("converts RoomPlan wall transforms into measured empty geometry", () => {
  const room = parseRoomPlan({ name: "Office scan", walls: [
    { dimensions: [6, 2.7, 0.1], transform: transform(0, -2) },
    { dimensions: [4, 2.7, 0.1], transform: transform(3, 0, Math.PI / 2) },
    { dimensions: [6, 2.7, 0.1], transform: transform(0, 2) },
    { dimensions: [4, 2.7, 0.1], transform: transform(-3, 0, Math.PI / 2) },
  ] });
  assert.equal(room.mode, "lidar");
  assert.equal(room.estimated, false);
  assert.equal(room.width, 6);
  assert.equal(room.depth, 4);
  assert.equal(room.floorPolygon.length, 4);
  assert.equal(room.objects.length, 0);
});

test("rejects scans without enough measured room geometry", () => {
  assert.throws(() => parseRoomPlan({ walls: [] }), /enough measured walls/);
});
