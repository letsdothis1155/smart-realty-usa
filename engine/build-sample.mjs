/**
 * Build the one sample model: hud-413-772606.
 * Depth Anything and MiDaS are not installed. OpenAI is not called.
 * Other listing ids are refused here. The batch script also refuses.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyRoomPhoto } from "../js/room-pipeline.js";
import { buildHouseGlb } from "./glb-write.mjs";
import { planListing } from "./plan.mjs";

const SAMPLE_ID = "hud-413-772606";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const LICENSE = "Copyright 2026 Andrew Iredale Jr / SMART REALTY.US LLC. All rights reserved.";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WORK = path.join(tmpdir(), "sru-sample-photos");

function jpgUrl(url) {
  return String(url).replace("f_auto", "f_jpg");
}

function rank(url) {
  const name = url.toLowerCase();
  return (/other|copy|edit/.test(name) ? 2 : 0) + Math.min(name.length, 200) / 1000;
}

async function loadListing() {
  const local = process.env.SRU_LISTING_JSON || "/tmp/blain.json";
  if (existsSync(local)) {
    const data = JSON.parse(readFileSync(local, "utf8"));
    return data.listing || data;
  }
  const response = await fetch(`https://smartrealty.us/api/listings/${SAMPLE_ID}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  const data = await response.json();
  if (!data.listing) throw new Error("The listing request did not return a house.");
  return data.listing;
}

async function download(url, dest) {
  const response = await fetch(jpgUrl(url), { headers: { "User-Agent": UA } });
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

async function main() {
  const listing = await loadListing();
  if (listing.id !== SAMPLE_ID) {
    throw new Error(`This script only builds ${SAMPLE_ID}. The batch is not turned on.`);
  }
  const plan = planListing(listing);
  if (!plan.fitsListing) throw new Error(`Sample area ${plan.totalSqft} does not match ${listing.sqft}.`);
  mkdirSync(WORK, { recursive: true });
  const chosen = pickPhotos(listing.images || []);
  const photos = {};
  const surfaces = {};
  const used = {};
  for (const room of [...plan.rooms, plan.hall]) {
    const url = chosen[room.id];
    if (!url) {
      surfaces[room.id] = { color: [0.75, 0.73, 0.68] };
      used[room.id] = null;
      continue;
    }
    const raw = path.join(WORK, `${room.id}.bin`);
    const jpeg = await download(url, raw);
    const bytes = readFileSync(jpeg);
    photos[room.id] = bytes;
    surfaces[room.id] = { color: averageColor(jpeg), photo: room.id, photoSize: imageSize(jpeg) };
    used[room.id] = url;
  }
  const glb = buildHouseGlb(plan, surfaces, photos);
  const outDir = path.join(ROOT, "models", SAMPLE_ID);
  mkdirSync(outDir, { recursive: true });
  const glbName = "house.glb";
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
    listingId: SAMPLE_ID,
    smartRealtyId: SAMPLE_ID,
    sqft: plan.sqft,
    estimated: true,
    fitsListing: plan.fitsListing,
    totalSqft: Math.round(plan.totalSqft * 10) / 10,
    note: "Sizes are a split of the listed 1,456 sqft. This listing has no per-room dimensions. Depth Anything and MiDaS were not run. The 80 in door and 36 in counter were not measured in the photos. Wall and floor colors are the average of each room photo. Furniture, cabinets, and windows were not detected. This is not a measured scan.",
    license: LICENSE,
    glb: `/models/${SAMPLE_ID}/${glbName}`,
    access: "sample",
    start: plan.start,
    rooms,
    hall,
    walls: plan.walls,
    rects: plan.rects,
    references: plan.references,
  };
  writeFileSync(path.join(outDir, "rooms.json"), JSON.stringify(pack, null, 2));
  console.log(JSON.stringify({
    id: SAMPLE_ID,
    totalSqft: plan.totalSqft,
    glbBytes: glb.length,
    rooms: rooms.map((room) => ({
      id: room.id,
      ft: `${Math.round(room.widthFt)}x${Math.round(room.depthFt)}`,
      estimated: room.estimated,
      photo: Boolean(room.photo),
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
