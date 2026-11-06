/**
 * Hand-built GLB. No three.js and no sharp.
 * Walls face into the room (FrontSide). Photo walls use KHR_materials_unlit.
 */

import { DOOR_HEIGHT_M } from "./plan.mjs";

const INSET = 0.015;
const LICENSE = "Copyright 2026 Andrew Iredale Jr / SMART REALTY.US LLC. All rights reserved.";

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function triNormal(a, b, c) {
  return cross(sub(b, a), sub(c, a));
}

function emptyBucket() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function pushQuad(bucket, corners, uvs, inward) {
  const n = triNormal(corners[0], corners[1], corners[2]);
  const facing = dot(n, inward);
  const order = facing >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
  const normal = normalize(facing >= 0 ? n : [-n[0], -n[1], -n[2]]);
  const base = bucket.positions.length / 3;
  for (const index of order) {
    bucket.positions.push(...corners[index]);
    bucket.normals.push(...normal);
    bucket.uvs.push(...uvs[index]);
  }
  bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
// glTF texture v=0 is the top of the image. Photo quads put v=1 on the floor.
const UV_PHOTO = [[0, 1], [1, 1], [1, 0], [0, 0]];

function floorQuad(bucket, x, z, w, d) {
  const y = 0;
  pushQuad(
    bucket,
    [[x, y, z], [x, y, z + d], [x + w, y, z + d], [x + w, y, z]],
    UV,
    [0, 1, 0],
  );
}

function ceilingQuad(bucket, x, z, w, d, h) {
  pushQuad(
    bucket,
    [[x, h, z], [x + w, h, z], [x + w, h, z + d], [x, h, z + d]],
    UV,
    [0, -1, 0],
  );
}

function vertical(bucket, x0, z0, x1, z1, y0, y1, inward, uvs = UV) {
  pushQuad(
    bucket,
    [[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]],
    uvs,
    inward,
  );
}

function fitDraw(wallLen, wallH, imgW, imgH) {
  if (!(imgW > 0) || !(imgH > 0)) return { pad: 0, drawLen: wallLen, y0: 0, y1: wallH };
  const imgAspect = imgW / imgH;
  const wallAspect = wallLen / wallH;
  let drawLen = wallLen;
  let drawH = wallH;
  if (imgAspect > wallAspect) drawH = wallLen / imgAspect;
  else drawLen = wallH * imgAspect;
  return {
    pad: (wallLen - drawLen) / 2,
    drawLen,
    y0: (wallH - drawH) / 2,
    y1: (wallH - drawH) / 2 + drawH,
  };
}

function addRoomSurfaces(parts, room, color, photoName, photoSize) {
  const x = room.x;
  const z = room.z;
  const w = room.w;
  const d = room.d;
  const h = room.heightM;
  const paint = emptyBucket();
  const floor = emptyBucket();
  floorQuad(floor, x, z, w, d);
  ceilingQuad(paint, x, z, w, d, h);
  const south = room.row === "south";
  const photoZ = south ? z + INSET : z + d - INSET;
  const doorZ = south ? z + d - INSET : z + INSET;
  const photoIn = south ? [0, 0, 1] : [0, 0, -1];
  const doorIn = south ? [0, 0, -1] : [0, 0, 1];
  const photo = photoName ? emptyBucket() : null;
  const wallX0 = x + INSET;
  const wallX1 = x + w - INSET;
  vertical(paint, wallX0, photoZ, wallX1, photoZ, 0, h, photoIn);
  if (photo) {
    const fit = fitDraw(wallX1 - wallX0, h, photoSize?.[0], photoSize?.[1]);
    const lift = south ? 0.004 : -0.004;
    const left = wallX0 + fit.pad;
    const right = left + fit.drawLen;
    if (south) vertical(photo, left, photoZ + lift, right, photoZ + lift, fit.y0, fit.y1, photoIn, UV_PHOTO);
    else vertical(photo, right, photoZ + lift, left, photoZ + lift, fit.y0, fit.y1, photoIn, UV_PHOTO);
  }
  const gap0 = room.doorX - room.doorW / 2;
  const gap1 = room.doorX + room.doorW / 2;
  const doorH = Math.min(room.doorH || DOOR_HEIGHT_M, h - 0.05);
  vertical(paint, x + INSET, doorZ, Math.max(x + INSET, gap0), doorZ, 0, h, doorIn);
  vertical(paint, Math.min(x + w - INSET, gap1), doorZ, x + w - INSET, doorZ, 0, h, doorIn);
  vertical(paint, gap0, doorZ, gap1, doorZ, doorH, h, doorIn);
  vertical(paint, x + INSET, z + INSET, x + INSET, z + d - INSET, 0, h, [1, 0, 0]);
  vertical(paint, x + w - INSET, z + d - INSET, x + w - INSET, z + INSET, 0, h, [-1, 0, 0]);
  parts.push({ name: `${room.id}-floor`, kind: "floor", roomId: room.id, color: scaleColor(color, 0.55), bucket: floor });
  parts.push({ name: `${room.id}-shell`, kind: "shell", roomId: room.id, color, bucket: paint });
  if (photo) {
    parts.push({ name: `${room.id}-photo`, kind: "photo", roomId: room.id, photo: photoName, bucket: photo });
  }
}

function scaleColor(color, factor) {
  const src = color || [0.75, 0.73, 0.68];
  return src.map((channel) => Math.max(0, Math.min(1, channel * factor)));
}

function addDoorSide(bucket, room, z, inward, h) {
  const gap0 = room.doorX - room.doorW / 2;
  const gap1 = room.doorX + room.doorW / 2;
  const doorH = Math.min(room.doorH || DOOR_HEIGHT_M, h - 0.05);
  vertical(bucket, room.x, z, gap0, z, 0, h, inward);
  vertical(bucket, gap1, z, room.x + room.w, z, 0, h, inward);
  vertical(bucket, gap0, z, gap1, z, doorH, h, inward);
}

function addHall(parts, plan, color, photoName, photoSize) {
  const hall = plan.hall;
  const paint = emptyBucket();
  const floor = emptyBucket();
  floorQuad(floor, hall.x, hall.z, hall.w, hall.d);
  ceilingQuad(paint, hall.x, hall.z, hall.w, hall.d, hall.heightM);
  const h = hall.heightM;
  vertical(paint, hall.x + hall.w - INSET, hall.z + INSET, hall.x + hall.w - INSET, hall.z + hall.d - INSET, 0, h, [-1, 0, 0]);
  const xWest = hall.x + INSET;
  const zHi = hall.z + hall.d - INSET;
  const zLo = hall.z + INSET;
  vertical(paint, xWest, zHi, xWest, zLo, 0, h, [1, 0, 0]);
  const west = photoName ? emptyBucket() : null;
  if (west) {
    const fit = fitDraw(zHi - zLo, h, photoSize?.[0], photoSize?.[1]);
    const z0 = zHi - fit.pad;
    vertical(west, xWest + 0.004, z0, xWest + 0.004, z0 - fit.drawLen, fit.y0, fit.y1, [1, 0, 0], UV_PHOTO);
  }
  let southEnd = 0;
  let northEnd = 0;
  for (const room of plan.rooms) {
    if (room.row === "south") {
      addDoorSide(paint, room, INSET, [0, 0, 1], h);
      southEnd = Math.max(southEnd, room.x + room.w);
    } else {
      addDoorSide(paint, room, hall.d - INSET, [0, 0, -1], h);
      northEnd = Math.max(northEnd, room.x + room.w);
    }
  }
  if (southEnd < hall.w - 1e-4) {
    vertical(paint, southEnd, INSET, hall.w - INSET, INSET, 0, h, [0, 0, 1]);
  }
  if (northEnd < hall.w - 1e-4) {
    vertical(paint, northEnd, hall.d - INSET, hall.w - INSET, hall.d - INSET, 0, h, [0, 0, -1]);
  }
  parts.push({ name: "hall-floor", kind: "floor", roomId: "hall", color: scaleColor(color, 0.55), bucket: floor });
  parts.push({ name: "hall-shell", kind: "shell", roomId: "hall", color, bucket: paint });
  if (photoName) {
    parts.push({ name: "hall-photo", kind: "photo", roomId: "hall", photo: photoName, bucket: west });
  }
}

export function buildHouseParts(plan, surfaces = {}) {
  const parts = [];
  for (const room of plan.rooms) {
    const surface = surfaces[room.id] || {};
    addRoomSurfaces(parts, room, surface.color || [0.75, 0.73, 0.68], surface.photo || "", surface.photoSize);
  }
  const hallSurface = surfaces.hall || {};
  const hallColor = hallSurface.color || [0.62, 0.6, 0.56];
  addHall(parts, plan, hallColor, hallSurface.photo || "", hallSurface.photoSize);
  return parts;
}

function pad4(buffer, fill) {
  const extra = (4 - (buffer.length % 4)) % 4;
  if (!extra) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(extra, fill)]);
}

export function encodeGlb(json, bin) {
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = pad4(bin, 0);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let offset = 12;
  out.writeUInt32LE(jsonChunk.length, offset);
  offset += 4;
  out.writeUInt32LE(0x4e4f534a, offset);
  offset += 4;
  jsonChunk.copy(out, offset);
  offset += jsonChunk.length;
  out.writeUInt32LE(binChunk.length, offset);
  offset += 4;
  out.writeUInt32LE(0x004e4942, offset);
  offset += 4;
  binChunk.copy(out, offset);
  return out;
}

function bounds(values, stride) {
  const min = Array(stride).fill(Infinity);
  const max = Array(stride).fill(-Infinity);
  for (let i = 0; i < values.length; i += stride) {
    for (let k = 0; k < stride; k += 1) {
      min[k] = Math.min(min[k], values[i + k]);
      max[k] = Math.max(max[k], values[i + k]);
    }
  }
  return { min, max };
}

export function buildHouseGlb(plan, surfaces = {}, photos = {}) {
  const parts = buildHouseParts(plan, surfaces);
  const binParts = [];
  let cursor = 0;
  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const textures = [];
  const images = [];
  const photoView = new Map();

  function align() {
    const pad = (4 - (cursor % 4)) % 4;
    if (pad) {
      binParts.push(Buffer.alloc(pad));
      cursor += pad;
    }
  }

  function pushBytes(buffer) {
    align();
    const byteOffset = cursor;
    binParts.push(buffer);
    cursor += buffer.length;
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length });
    return view;
  }

  function pushArray(array, componentType, type, stride) {
    const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const view = pushBytes(buffer);
    const count = array.length / stride;
    const accessor = { bufferView: view, componentType, count, type };
    if (type === "VEC3" || type === "VEC2") {
      const box = bounds(array, stride);
      accessor.min = box.min;
      accessor.max = box.max;
    }
    const index = accessors.length;
    accessors.push(accessor);
    return index;
  }

  for (const [name, bytes] of Object.entries(photos)) {
    if (!bytes || !bytes.length) continue;
    const view = pushBytes(Buffer.from(bytes));
    const image = images.length;
    images.push({ bufferView: view, mimeType: "image/jpeg" });
    photoView.set(name, textures.length);
    textures.push({ sampler: 0, source: image });
  }

  const meshes = [];
  const nodes = [];
  for (const part of parts) {
    if (!part.bucket.indices.length) continue;
    const indices = Uint16Array.from(part.bucket.indices);
    const positions = Float32Array.from(part.bucket.positions);
    const normals = Float32Array.from(part.bucket.normals);
    const uvs = Float32Array.from(part.bucket.uvs);
    if (indices.length > 65535) throw new Error(`too many indices for ${part.name}`);
    const material = {
      name: part.name,
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: [...(part.color || [1, 1, 1]), 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    };
    if (part.kind === "photo" && photoView.has(part.photo)) {
      material.pbrMetallicRoughness.baseColorTexture = { index: photoView.get(part.photo) };
      material.extensions = { KHR_materials_unlit: {} };
    }
    const materialIndex = materials.length;
    materials.push(material);
    const primitive = {
      attributes: {
        POSITION: pushArray(positions, 5126, "VEC3", 3),
        NORMAL: pushArray(normals, 5126, "VEC3", 3),
        TEXCOORD_0: pushArray(uvs, 5126, "VEC2", 2),
      },
      indices: pushArray(indices, 5123, "SCALAR", 1),
      material: materialIndex,
      extras: { kind: part.kind, roomId: part.roomId },
    };
    const mesh = meshes.length;
    meshes.push({ name: part.name, primitives: [primitive] });
    nodes.push({ name: `sru-${plan.listingId || "listing"}-${part.name}`, mesh });
  }

  const json = {
    asset: {
      version: "2.0",
      generator: "smartrealty-listing-model",
      extras: {
        license: LICENSE,
        smartRealtyId: plan.listingId || "",
        dimensions: plan.estimated ? "estimated" : "listed",
      },
    },
    extensionsUsed: textures.length ? ["KHR_materials_unlit"] : [],
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: cursor }],
  };
  if (textures.length) {
    json.textures = textures;
    json.images = images;
    json.samplers = [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }];
  } else {
    delete json.extensionsUsed;
  }
  return encodeGlb(json, Buffer.concat(binParts));
}

export function readGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("bad glb magic");
  if (buffer.readUInt32LE(4) !== 2) throw new Error("bad glb version");
  const length = buffer.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + chunkLength);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    if (type === 0x004e4942) bin = data;
    offset += 8 + chunkLength;
  }
  return { json, bin };
}
