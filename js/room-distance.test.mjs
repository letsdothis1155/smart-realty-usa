import { test } from 'node:test';
import assert from 'node:assert/strict';
import { footprintDistance, feetAndInches } from './room-distance.mjs';
const box = (x, z, rotation = 0) => ({ x, z, width: 2, depth: 2, rotation });
test('edge gaps account for furniture size and diagonal separation', () => {
  assert.equal(footprintDistance(box(0, 0), box(5, 0)), 3);
  assert.ok(Math.abs(footprintDistance(box(0, 0), box(5, 6)) - 5) < 1e-9);
});
test('touching and overlapping footprints have no gap', () => {
  assert.equal(footprintDistance(box(0, 0), box(2, 0)), 0);
  assert.equal(footprintDistance(box(0, 0), box(0.5, 0.5, Math.PI / 4)), 0);
});
test('rotated corners yield the actual rectangular footprint gap', () => {
  const a = box(0, 0), b = box(5, 0, Math.PI / 4);
  assert.ok(Math.abs(footprintDistance(a, b) - (4 - Math.SQRT2)) < 1e-9);
  assert.equal(footprintDistance(a, b), footprintDistance(b, a));
});
test('feet and inches round through a foot boundary', () => {
  assert.equal(feetAndInches(0.3048), '1 ft 0 in');
  assert.equal(feetAndInches(11.8 * 0.0254), '1 ft 0 in');
});
