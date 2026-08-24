"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DATA_FILE = path.join(__dirname, "data", "locations.json");

function slugify(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadSeed() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  return raw;
}

function createLocationCatalog(seed) {
  const data = seed || loadSeed();
  const states = { ...(data.states || {}) };
  const bySlug = new Map();
  const byZip = new Map();
  const byAlias = new Map();

  function indexPlace(place) {
    const slug = place.slug || slugify([place.name, place.state]);
    const row = {
      country: "US",
      name: place.name,
      state: String(place.state || "").toUpperCase(),
      stateName: states[String(place.state || "").toUpperCase()] || "",
      county: place.county || "",
      lat: Number(place.lat) || null,
      lng: Number(place.lng) || null,
      zips: Array.isArray(place.zips) ? place.zips.map(String) : [],
      neighborhoods: Array.isArray(place.neighborhoods) ? place.neighborhoods.slice() : [],
      aliases: Array.isArray(place.aliases) ? place.aliases.slice() : [],
      slug,
      dynamic: !!place.dynamic,
    };
    bySlug.set(slug, row);
    for (const zip of row.zips) byZip.set(zip, row);
    const names = [row.name, `${row.name} ${row.state}`, `${row.name}, ${row.state}`, ...row.aliases];
    for (const n of names) byAlias.set(n.toLowerCase().replace(/[.,]/g, "").trim(), row);
    return row;
  }

  for (const place of data.places || []) indexPlace(place);

  function addFromListing(listing) {
    const city = String(listing.city || "").trim();
    const state = String(listing.state || "").trim().toUpperCase();
    if (!city || !state) return null;
    const slug = slugify([city, state]);
    if (bySlug.has(slug)) {
      const existing = bySlug.get(slug);
      const zip = String(listing.postalCode || "").trim();
      if (zip && !existing.zips.includes(zip)) existing.zips.push(zip);
      if (listing.neighborhood && !existing.neighborhoods.includes(listing.neighborhood)) {
        existing.neighborhoods.push(listing.neighborhood);
      }
      return existing;
    }
    return indexPlace({
      name: city,
      state,
      county: listing.county || "",
      lat: listing.latitude,
      lng: listing.longitude,
      zips: listing.postalCode ? [String(listing.postalCode)] : [],
      neighborhoods: listing.neighborhood ? [listing.neighborhood] : [],
      aliases: [],
      dynamic: true,
    });
  }

  function indexListings(listings) {
    for (const listing of listings || []) addFromListing(listing);
  }

  function levenshtein(a, b) {
    const s = String(a);
    const t = String(b);
    const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
    for (let i = 0; i <= s.length; i++) dp[i][0] = i;
    for (let j = 0; j <= t.length; j++) dp[0][j] = j;
    for (let i = 1; i <= s.length; i++) {
      for (let j = 1; j <= t.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
      }
    }
    return dp[s.length][t.length];
  }

  function resolve(raw) {
    const q = String(raw || "")
      .toLowerCase()
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!q) return null;
    const zip = q.match(/\b(\d{5})\b/);
    if (zip && byZip.has(zip[1])) return { ...byZip.get(zip[1]), match: "zip", zip: zip[1] };
    if (byAlias.has(q)) return { ...byAlias.get(q), match: "exact" };
    let best = null;
    for (const [alias, place] of byAlias) {
      if (alias === q || alias.startsWith(q) || q.startsWith(alias)) {
        if (!best || alias.length < (best._len || 99)) best = { ...place, match: "prefix", _len: alias.length };
      } else if (q.length >= 5 && levenshtein(q, alias) <= 2) {
        if (!best) best = { ...place, match: "fuzzy" };
      }
    }
    if (best) {
      delete best._len;
      return best;
    }
    return null;
  }

  function getBySlug(slug) {
    return bySlug.get(String(slug || "").toLowerCase()) || null;
  }

  function allPlaces() {
    return [...bySlug.values()];
  }

  function neighborhoodSlug(citySlug, neighborhood) {
    return `${citySlug}/${slugify([neighborhood])}`;
  }

  return {
    country: data.country,
    states,
    slugify,
    resolve,
    getBySlug,
    addFromListing,
    indexListings,
    allPlaces,
    neighborhoodSlug,
  };
}

const HUD_COVERAGE_STATES = [
  "KY",
  "IN",
  "NC",
  "GA",
  "SC",
  "TN",
  "VA",
  "DC",
  "MD",
  "PA",
  "NY",
  "MA",
  "FL",
  "TX",
  "AZ",
  "NV",
  "CO",
  "WA",
  "OR",
  "CA",
];

/** Extra HUD Home Store city queries so Southern Indiana shows up as soon as HUD lists a home. */
const HUD_FOCUS_REGIONS = [
  "Jeffersonville, IN",
  "New Albany, IN",
  "Utica, IN",
  "Clarksville, IN",
  "Sellersburg, IN",
  "Charlestown, IN",
];

const SOUTHERN_INDIANA_BBOX = { west: -86.05, south: 38.12, east: -85.48, north: 38.48 };

module.exports = {
  createLocationCatalog,
  slugify,
  HUD_COVERAGE_STATES,
  HUD_FOCUS_REGIONS,
  SOUTHERN_INDIANA_BBOX,
  DATA_FILE,
};
