import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const viewer = fs.readFileSync(new URL("../js/sr-3d-viewer.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../new-listings/index.html", import.meta.url), "utf8");

test("the listing page embeds the viewer and the viewer does not import the engine", () => {
  assert.doesNotMatch(viewer, /engine\//);
  assert.match(viewer, /Dimensions estimated/);
  assert.match(viewer, /smartrealty\.us/);
  assert.match(viewer, /Andrew Iredale Jr/);
  assert.match(page, /id="sr-3d-viewer"/);
  assert.match(page, /data-listing-id=/);
  assert.match(page, /\/js\/sr-engine\.js/);
  assert.doesNotMatch(page, /engine\/plan/);
  const forbidden = ["plan.mjs", "glb-write.mjs", "build-sample.mjs"].filter((name) => viewer.includes(name));
  assert.deepEqual(forbidden, []);
});

test("schema remains private and batch textures require authorization", () => {
  const schema = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  const batch = fs.readFileSync(new URL("./batch.mjs", import.meta.url), "utf8");
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /YOUR_PROJECT_REF|Do not apply/i);
  assert.match(batch, /SRU_MLS_DERIVATIVE_OK/);
  assert.match(batch, /await buildListing/);
  assert.equal(fs.existsSync(new URL("../workers/signup/src/index.ts", import.meta.url)), true);
});
