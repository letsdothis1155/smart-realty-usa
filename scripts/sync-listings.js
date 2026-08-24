#!/usr/bin/env node
/*
 * Reads data/listings.json (source of truth) and writes the browser globals
 * js/listings.js and js/properties.js (compatibility alias).
 *
 * Usage: node scripts/sync-listings.js
 * Re-run after editing data/listings.json. Then optionally:
 *   node scripts/generate-property-pages.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const jsonPath = path.join(ROOT, "data/listings.json");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

if (!Array.isArray(data.listings) || !data.listings.length) {
  console.error("data/listings.json is missing a listings array");
  process.exit(1);
}

const payload = JSON.stringify(
  {
    listings: data.listings,
    defaultCoords: data.defaultCoords || {},
  },
  null,
  2
);

const banner = `/* Generated from data/listings.json — do not edit. Run: node scripts/sync-listings.js */`;
const body = `${banner}
(function (w) {
  var data = ${payload};
  w.SRU_LISTINGS = data;
  w.SRU_PROPERTIES = data.listings;
  w.SRU_DEFAULT_COORDS = data.defaultCoords || {};
})(window);
`;

fs.writeFileSync(path.join(ROOT, "js/listings.js"), body);
const alias = body.replace(
  "do not edit. Run: node scripts/sync-listings.js",
  "alias of js/listings.js. Do not edit. Run: node scripts/sync-listings.js"
);
fs.writeFileSync(path.join(ROOT, "js/properties.js"), alias);
console.log("wrote js/listings.js and js/properties.js (" + data.listings.length + " listings)");
