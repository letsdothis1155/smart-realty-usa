/**
 * Local / GitHub Actions entry. Exits 0 without secrets and writes nothing.
 * Live output goes to prices.live.json, which is gitignored. Do not commit it:
 * an eBay copy in git would be an archive the API license does not allow.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { missingSecrets, shouldRun } from "./lib.mjs";
import worker from "./worker.mjs";

if (!shouldRun(process.env)) {
  console.log("Turnover price refresh is disabled. Missing secrets: " + missingSecrets(process.env).join(", "));
  console.log("No prices were fetched or written.");
  process.exit(0);
}

const response = await worker.fetch(new Request("https://refresh.internal/"), process.env);
const text = await response.text();
if (!response.ok) {
  console.error(text);
  process.exit(1);
}
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "prices.live.json");
writeFileSync(dest, text + "\n");
console.log("Wrote short-lived prices to " + dest + ". Do not commit that file.");
