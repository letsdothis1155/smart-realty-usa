import assert from "node:assert/strict";
import test from "node:test";
import { buildHouseGlb, readGlb, triNormal } from "./glb-write.mjs";
import { planListing } from "./plan.mjs";

function accessorArray(json, bin, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const start = view.byteOffset || 0;
  const slice = bin.subarray(start, start + view.byteLength);
  if (accessor.componentType === 5126) return new Float32Array(slice.buffer, slice.byteOffset, slice.byteLength / 4);
  if (accessor.componentType === 5123) return new Uint16Array(slice.buffer, slice.byteOffset, slice.byteLength / 2);
  throw new Error(`unsupported component ${accessor.componentType}`);
}

test("the sample shell faces into the rooms and carries the license", () => {
  const plan = planListing({ id: "hud-413-772606", sqft: 1456, beds: 3, baths: 2 });
  const jpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=",
    "base64",
  );
  const glb = buildHouseGlb(plan, {
    living: { color: [0.7, 0.65, 0.55], photo: "living" },
  }, { living: jpeg });
  const { json, bin } = readGlb(glb);
  assert.equal(json.asset.extras.smartRealtyId, "hud-413-772606");
  assert.match(json.asset.extras.license, /Andrew Iredale Jr/);
  assert.equal(json.asset.extras.dimensions, "estimated");
  assert.equal(json.images[0].mimeType, "image/jpeg");
  assert.ok(json.images[0].bufferView >= 0);

  const primitives = json.meshes.flatMap((mesh) => mesh.primitives);
  const floor = primitives.find((primitive) => primitive.extras.kind === "floor" && primitive.extras.roomId === "living");
  const photo = primitives.find((primitive) => primitive.extras.kind === "photo" && primitive.extras.roomId === "living");
  const shell = primitives.find((primitive) => primitive.extras.kind === "shell" && primitive.extras.roomId === "primary-bedroom");
  assert.ok(floor && photo && shell);
  assert.ok(json.materials[photo.material].extensions.KHR_materials_unlit);
  assert.equal(json.materials[floor.material].pbrMetallicRoughness.metallicFactor, 0);

  const positions = accessorArray(json, bin, floor.attributes.POSITION);
  const indices = accessorArray(json, bin, floor.indices);
  const a = [positions[indices[0] * 3], positions[indices[0] * 3 + 1], positions[indices[0] * 3 + 2]];
  const b = [positions[indices[1] * 3], positions[indices[1] * 3 + 1], positions[indices[1] * 3 + 2]];
  const c = [positions[indices[2] * 3], positions[indices[2] * 3 + 1], positions[indices[2] * 3 + 2]];
  const normal = triNormal(a, b, c);
  assert.ok(normal[1] > 0, `floor normal ${normal}`);

  const photoPos = accessorArray(json, bin, photo.attributes.POSITION);
  const photoIndex = accessorArray(json, bin, photo.indices);
  const pa = [photoPos[photoIndex[0] * 3], photoPos[photoIndex[0] * 3 + 1], photoPos[photoIndex[0] * 3 + 2]];
  const pb = [photoPos[photoIndex[1] * 3], photoPos[photoIndex[1] * 3 + 1], photoPos[photoIndex[1] * 3 + 2]];
  const pc = [photoPos[photoIndex[2] * 3], photoPos[photoIndex[2] * 3 + 1], photoPos[photoIndex[2] * 3 + 2]];
  const photoNormal = triNormal(pa, pb, pc);
  assert.ok(photoNormal[2] > 0, `south photo normal ${photoNormal}`);

  const shellPos = accessorArray(json, bin, shell.attributes.POSITION);
  let sawCeiling = false;
  const shellIndex = accessorArray(json, bin, shell.indices);
  for (let i = 0; i < shellIndex.length; i += 3) {
    const verts = [0, 1, 2].map((offset) => {
      const vertex = shellIndex[i + offset];
      return [shellPos[vertex * 3], shellPos[vertex * 3 + 1], shellPos[vertex * 3 + 2]];
    });
    if (verts.every((vertex) => Math.abs(vertex[1] - plan.heightM) < 1e-4)) {
      const ceiling = triNormal(verts[0], verts[1], verts[2]);
      assert.ok(ceiling[1] < 0, `ceiling normal ${ceiling}`);
      sawCeiling = true;
      break;
    }
  }
  assert.equal(sawCeiling, true);
});
