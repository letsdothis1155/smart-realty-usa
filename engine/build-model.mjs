import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyRoomPhoto } from "../js/room-pipeline.js";
import { buildHouseGlb } from "./glb-write.mjs";
import { planListing } from "./plan.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const LICENSE = "Copyright 2026 Andrew Iredale Jr / SMART REALTY.US LLC. All rights reserved.";
export const ENGINE_VERSION = 2;

function jpgUrl(url) {
  return String(url).replace("f_auto", "f_jpg");
}

function rank(url) {
  const name = url.toLowerCase();
  return (/other|copy|edit/.test(name) ? 2 : 0) + Math.min(name.length, 200) / 1000;
}

async function download(url, dest) {
  const source = new URL(url, "https://smartrealty.us");
  if (source.protocol !== "https:" || source.username || source.password) throw new Error("Unsupported photo URL");
  const response = await fetch(jpgUrl(source.href), {
    headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!response.ok) throw new Error(`photo ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(dest, bytes);
  const jpeg = dest.replace(/\.bin$/, ".jpg");
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "55", "-Z", "640", dest, "--out", jpeg], { stdio: "pipe" });
  return jpeg;
}

function imageSize(jpeg) {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", jpeg], { encoding: "utf8" });
  return [
    Number(out.match(/pixelWidth:\s+(\d+)/)[1]),
    Number(out.match(/pixelHeight:\s+(\d+)/)[1]),
  ];
}

function averageColor(jpeg) {
  const bmp = jpeg.replace(/\.jpg$/, ".bmp");
  execFileSync("sips", ["-s", "format", "bmp", "-z", "1", "1", jpeg, "--out", bmp], { stdio: "pipe" });
  const buf = readFileSync(bmp);
  const offset = buf.readUInt32LE(10);
  return [buf[offset + 2] / 255, buf[offset + 1] / 255, buf[offset] / 255];
}

function pickPhotos(images) {
  const groups = new Map();
  for (const url of images || []) {
    const found = classifyRoomPhoto(url);
    if (!found) continue;
    if (!groups.has(found.id)) groups.set(found.id, []);
    groups.get(found.id).push(url);
  }
  const chosen = {};
  for (const [id, urls] of groups) {
    urls.sort((a, b) => rank(a) - rank(b));
    chosen[id] = urls[0];
  }
  return chosen;
}

export async function buildListing(listing, { output, textures = false } = {}) {
  const id = String(listing?.id || "");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid listing ID.");
  const plan = planListing(listing);
  if (!plan.fitsListing) throw new Error("Room dimensions do not reconcile with the listing area.");
  const work = textures ? mkdtempSync(path.join(tmpdir(), "sru-room-")) : null;
  try {
    return await writeModel(listing, plan, output, work);
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
  }
}

async function writeModel(listing, plan, output, work) {
  const id = plan.listingId;
  const chosen = pickPhotos([...new Set([...(listing.images || []), ...(listing.galleryImages || [])])]);
  const photos = {};
  const surfaces = {};
  const used = {};
  const failedPhotos = [];
  for (const room of [...plan.rooms, plan.hall]) {
    const url = chosen[room.id];
    surfaces[room.id] = { color: [0.75, 0.73, 0.68] };
    used[room.id] = url || "";
    if (!url || !work) continue;
    try {
      const jpeg = await download(url, path.join(work, `${room.id}.bin`));
      const photoSize = imageSize(jpeg);
      surfaces[room.id] = { color: averageColor(jpeg), photo: room.id, photoSize };
      photos[room.id] = readFileSync(jpeg);
    } catch { failedPhotos.push(room.id); }
  }
  const glb = buildHouseGlb(plan, surfaces, photos);
  const outDir = path.join(output, id);
  mkdirSync(outDir, { recursive: true });
  const glbName = "house-" + createHash("sha256").update(glb).digest("hex").slice(0, 16) + ".glb";
  writeFileSync(path.join(outDir, glbName), glb);
  const rooms = plan.rooms.map((room) => ({
    ...room,
    furniture: "not detected",
    cabinets: "not detected",
    windows: "not detected",
    photo: used[room.id] || "",
    color: surfaces[room.id]?.color || null,
  }));
  const hall = {
    ...plan.hall,
    widthFt: plan.hall.w / 0.3048,
    depthFt: plan.hall.d / 0.3048,
    photoWall: used.hall ? "minX" : "",
    furniture: "not detected",
    cabinets: "not detected",
    windows: "not detected",
    photo: used.hall || "",
  };
  const pack = {
    listingId: id,
    smartRealtyId: id,
    sqft: plan.sqft,
    engineVersion: ENGINE_VERSION,
    estimated: plan.estimated,
    fitsListing: plan.fitsListing,
    totalSqft: Math.round(plan.totalSqft * 10) / 10,
    note: "Layout is inferred from listing data. Room dimensions without a listing measurement are estimates.",
    failedPhotos,
    license: LICENSE,
    glb: `/models/${id}/${glbName}`,
    access: "sample",
    start: plan.start,
    rooms,
    hall,
    walls: plan.walls,
    rects: plan.rects,
    references: plan.references,
  };
  const manifest = path.join(outDir, "rooms.json");
  const temporary = manifest + "." + process.pid + ".tmp";
  writeFileSync(temporary, JSON.stringify(pack, null, 2) + "\n");
  renameSync(temporary, manifest);
  return pack;
}
