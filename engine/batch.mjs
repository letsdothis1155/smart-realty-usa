import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildListing, ENGINE_VERSION } from "./build-model.mjs";

const { values } = parseArgs({ options: {
  output: { type: "string", default: "models" },
  input: { type: "string" },
  "with-textures": { type: "boolean", default: false },
  "stale-only": { type: "boolean", default: false },
} });

if (values["with-textures"] && process.env.SRU_MLS_DERIVATIVE_OK !== "1") {
  console.error("Confirm derivative photo rights before enabling --with-textures.");
  process.exit(2);
}

async function fetchData(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Listing service returned " + response.status);
  return response.json();
}

async function* listings() {
  if (values.input) {
    const data = JSON.parse(readFileSync(values.input, "utf8"));
    yield* (Array.isArray(data) ? data : data.listings || [data.listing || data]);
    return;
  }
  const seen = new Set();
  for (let offset = 0; ;) {
    const page = await fetchData("https://smartrealty.us/api/listings?limit=50&offset=" + offset);
    const rows = page.listings || [];
    if (!rows.length) return;
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      yield row;
    }
    if (!page.hasMore) return;
    offset += rows.length;
  }
}

mkdirSync(values.output, { recursive: true });
const report = [];
for await (const listing of listings()) {
  const id = String(listing?.id || "");
  try {
    if (values["stale-only"] && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      let previous;
      try { previous = JSON.parse(readFileSync(path.join(values.output, id, "rooms.json"), "utf8")); } catch {}
      if (previous?.engineVersion === ENGINE_VERSION) {
        report.push({ id, status: "current", engineVersion: ENGINE_VERSION });
        continue;
      }
    }
    const pack = await buildListing(listing, { output: values.output, textures: values["with-textures"] });
    report.push({ id, status: "built", engineVersion: pack.engineVersion, failedPhotos: pack.failedPhotos });
  } catch (error) {
    report.push({ id, status: "unavailable", reason: error.message });
  }
}
writeFileSync(path.join(values.output, "rebuild-report.json"), JSON.stringify({ engineVersion: ENGINE_VERSION, listings: report }, null, 2) + "\n");
const built = report.filter(row => row.status === "built").length;
const unavailable = report.filter(row => row.status === "unavailable").length;
console.log(`${built} built, ${unavailable} unavailable, ${report.length - built - unavailable} current (engine ${ENGINE_VERSION})`);
if (unavailable) process.exitCode = 1;
