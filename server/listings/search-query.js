"use strict";

const { createLocationCatalog } = require("./locations");

const defaultCatalog = createLocationCatalog();

const STATE_RE = /\b(AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b/i;

const STATE_NAMES = [
  ["indiana", "IN"],
  ["kentucky", "KY"],
  ["north carolina", "NC"],
  ["south carolina", "SC"],
  ["tennessee", "TN"],
  ["georgia", "GA"],
  ["ohio", "OH"],
  ["illinois", "IL"],
  ["florida", "FL"],
  ["texas", "TX"],
  ["california", "CA"],
  ["nevada", "NV"],
  ["colorado", "CO"],
  ["virginia", "VA"],
];

const DEFAULT_CITY_RADIUS_MILES = 30;
const TYPE_MAP = [
  { re: /\b(townhome|townhomes|townhouse|townhouses)\b/i, type: "townhouse" },
  { re: /\b(condo|condos|condominium)\b/i, type: "condo" },
  { re: /\b(apartment|apartments|apt)\b/i, type: "apartment" },
  { re: /\b(multi[- ]?family|duplex)\b/i, type: "multi_family" },
  { re: /\b(land|lot|lots)\b/i, type: "land" },
  { re: /\b(house|houses|home|homes|single family|sfh)\b/i, type: "house" },
];

function emptyFilters() {
  return {
    raw: "",
    text: "",
    city: "",
    state: "",
    county: "",
    postalCode: "",
    street: "",
    minPrice: 0,
    maxPrice: 0,
    beds: 0,
    baths: 0,
    propertyType: "",
    nearMe: false,
    lat: null,
    lng: null,
    sort: "",
    status: "",
    neighborhood: "",
    radiusMiles: 0,
    listedWithinDays: 0,
    minSqft: 0,
    maxSqft: 0,
    west: null,
    south: null,
    east: null,
    north: null,
    listingKind: "active_listing",
  };
}

function parseMoneyToken(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/[$,]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m)?$/i);
  if (!m) return 0;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  if ((m[2] || "").toLowerCase() === "m") n *= 1_000_000;
  else if ((m[2] || "").toLowerCase() === "k") n *= 1_000;
  return Math.round(n);
}

function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i++) dp[i][0] = i;
  for (let j = 0; j <= t.length; j++) dp[0][j] = j;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[s.length][t.length];
}

function matchCity(token, catalog = defaultCatalog) {
  const hit = catalog.resolve(token);
  if (!hit) return null;
  return { name: hit.name, state: hit.state, lat: hit.lat, lng: hit.lng, county: hit.county, slug: hit.slug, zips: hit.zips };
}

function parseSearchQuery(raw, extras = {}) {
  const filters = emptyFilters();
  filters.raw = String(raw || "").trim();
  let q = filters.raw;
  if (!q && !extras.q) {
    if (extras.minBeds) filters.beds = Number(extras.minBeds) || 0;
    if (extras.minBaths) filters.baths = Number(extras.minBaths) || 0;
    if (extras.minPrice) filters.minPrice = Number(extras.minPrice) || 0;
    if (extras.maxPrice) filters.maxPrice = Number(extras.maxPrice) || 0;
    if (extras.minSqft) filters.minSqft = Number(extras.minSqft) || 0;
    if (extras.maxSqft) filters.maxSqft = Number(extras.maxSqft) || 0;
    if (extras.propertyType) filters.propertyType = String(extras.propertyType);
    if (extras.sort) filters.sort = String(extras.sort);
    if (extras.status) filters.status = String(extras.status);
    if (extras.lat != null) filters.lat = Number(extras.lat);
    if (extras.lng != null) filters.lng = Number(extras.lng);
    return filters;
  }

  q = q.replace(/\s+/g, " ").trim();

  for (const [name, abbr] of STATE_NAMES) {
    const re = new RegExp(`\\b${name}\\b`, "i");
    if (re.test(q)) {
      filters.state = abbr;
      q = q.replace(re, " ");
    }
  }

  const zip = q.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zip) {
    filters.postalCode = zip[1];
    q = q.replace(zip[0], " ");
  }

  const under = q.match(/\b(?:under|below|less than|<)\s*\$?\s*(\d+(?:\.\d+)?\s*[km]?)\b/i);
  if (under) {
    filters.maxPrice = parseMoneyToken(under[1]);
    q = q.replace(under[0], " ");
  }
  const over = q.match(/\b(?:over|above|at least|>)\s*\$?\s*(\d+(?:\.\d+)?\s*[km]?)\b/i);
  if (over) {
    filters.minPrice = parseMoneyToken(over[1]);
    q = q.replace(over[0], " ");
  }
  const range = q.match(/\b\$?\s*(\d+(?:\.\d+)?\s*[km]?)\s*(?:-|to|–)\s*\$?\s*(\d+(?:\.\d+)?\s*[km]?)\b/i);
  if (range) {
    filters.minPrice = parseMoneyToken(range[1]);
    filters.maxPrice = parseMoneyToken(range[2]);
    q = q.replace(range[0], " ");
  }

  const beds = q.match(/\b(\d+)\s*(?:br|bd|bed|beds|bedroom|bedrooms)\b/i);
  if (beds) {
    filters.beds = Number(beds[1]);
    q = q.replace(beds[0], " ");
  }
  const baths = q.match(/\b(\d+(?:\.\d+)?)\s*(?:ba|bath|baths|bathroom|bathrooms)\b/i);
  if (baths) {
    filters.baths = Number(baths[1]);
    q = q.replace(baths[0], " ");
  }
  const minSqft = q.match(/\b(?:over|at least|more than)\s+(\d{3,5})\s*(?:sq\.?\s*ft|sqft|square feet)\b/i);
  if (minSqft) {
    filters.minSqft = Number(minSqft[1]);
    q = q.replace(minSqft[0], " ");
  }
  const maxSqft = q.match(/\b(?:under|below|less than)\s+(\d{3,5})\s*(?:sq\.?\s*ft|sqft|square feet)\b/i);
  if (maxSqft) {
    filters.maxSqft = Number(maxSqft[1]);
    q = q.replace(maxSqft[0], " ");
  }

  for (const row of TYPE_MAP) {
    if (row.re.test(q)) {
      filters.propertyType = row.type;
      q = q.replace(row.re, " ");
      break;
    }
  }

  if (/\bnear me\b|\bnearby\b|\baround me\b|\bclose to me\b/i.test(q)) {
    filters.nearMe = true;
    q = q.replace(/\b(near me|nearby|around me|close to me)\b/gi, " ");
  }

  const radius = q.match(/\bwithin\s+(\d+)\s*(?:miles?|mi)\b/i);
  if (radius) {
    filters.radiusMiles = Number(radius[1]);
    q = q.replace(radius[0], " ");
  }

  if (/\b(today|new homes?|new houses?|new listings?)\b/i.test(q)) {
    filters.listedWithinDays = filters.listedWithinDays || 7;
    filters.sort = filters.sort || "newest";
    q = q.replace(/\b(today|new homes?|new houses?|new listings?)\b/gi, " ");
  }

  const county = q.match(/\b([a-z][a-z .'-]+)\s+county\b/i);
  if (county) {
    filters.county = county[1].trim();
    q = q.replace(county[0], " ");
  }

  const nearCity = q.match(/\b(?:near|around|in)\s+([a-z][a-z .'-]{2,})/i);
  if (nearCity) {
    const hit = matchCity(nearCity[1]);
    if (hit) {
      filters.city = hit.name;
      filters.state = hit.state;
      filters.lat = hit.lat;
      filters.lng = hit.lng;
      q = q.replace(nearCity[0], " ");
    }
  }

  const inCity = q.match(/\b(?:in|at)\s+([a-z][a-z .'-]{2,})$/i);
  if (inCity) {
    const hit = matchCity(inCity[1]);
    if (hit) {
      filters.city = hit.name;
      filters.state = hit.state;
      filters.lat = hit.lat;
      filters.lng = hit.lng;
      q = q.replace(inCity[0], " ");
    }
  }

  const state = q.match(STATE_RE);
  if (state) {
    filters.state = state[1].toUpperCase();
    q = q.replace(state[0], " ");
  }

  q = q.replace(/\b(homes?|houses?|properties|property|listings?|for sale|for rent|search)\b/gi, " ");
  q = q.replace(/\s+/g, " ").trim();

  if (!filters.city && q) {
    const hit = matchCity(q) || matchCity(q.split(" ").slice(-2).join(" ")) || matchCity(q.split(" ")[0]);
    if (hit) {
      filters.city = hit.name;
      if (!filters.state) filters.state = hit.state;
      if (filters.lat == null) {
        filters.lat = hit.lat;
        filters.lng = hit.lng;
      }
      const nameRe = new RegExp(hit.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
      q = q.replace(nameRe, " ").replace(/\s+/g, " ").trim();
    }
  }

  if (/^\d+\s+\S+/.test(q)) filters.street = q;

  filters.text = q;

  if (extras.minBeds) filters.beds = Math.max(filters.beds, Number(extras.minBeds) || 0);
  if (extras.minBaths) filters.baths = Math.max(filters.baths, Number(extras.minBaths) || 0);
  if (extras.minPrice) filters.minPrice = Math.max(filters.minPrice, Number(extras.minPrice) || 0);
  if (extras.maxPrice && !filters.maxPrice) filters.maxPrice = Number(extras.maxPrice) || 0;
  if (extras.maxPrice && filters.maxPrice) filters.maxPrice = Math.min(filters.maxPrice, Number(extras.maxPrice));
  if (extras.minSqft) filters.minSqft = Math.max(filters.minSqft, Number(extras.minSqft) || 0);
  if (extras.maxSqft && !filters.maxSqft) filters.maxSqft = Number(extras.maxSqft) || 0;
  if (extras.maxSqft && filters.maxSqft) filters.maxSqft = Math.min(filters.maxSqft, Number(extras.maxSqft));
  if (extras.propertyType && !filters.propertyType) filters.propertyType = String(extras.propertyType);
  if (extras.sort) filters.sort = String(extras.sort);
  if (extras.status) filters.status = String(extras.status);
  if (extras.lat != null && extras.lng != null) {
    filters.lat = Number(extras.lat);
    filters.lng = Number(extras.lng);
  }
  if (filters.nearMe && filters.lat == null) {
    filters.lat = extras.userLat != null ? Number(extras.userLat) : 38.2527;
    filters.lng = extras.userLng != null ? Number(extras.userLng) : -85.7585;
    if (!filters.radiusMiles) filters.radiusMiles = 20;
    if (!filters.city) filters.city = "Louisville";
  }
  if (extras.neighborhood) filters.neighborhood = String(extras.neighborhood);
  if (extras.radiusMiles) filters.radiusMiles = Number(extras.radiusMiles) || filters.radiusMiles;
  if (extras.listedWithinDays) filters.listedWithinDays = Number(extras.listedWithinDays) || filters.listedWithinDays;
  if (extras.west != null) {
    filters.west = Number(extras.west);
    filters.south = Number(extras.south);
    filters.east = Number(extras.east);
    filters.north = Number(extras.north);
  }
  if (extras.listingKind) filters.listingKind = String(extras.listingKind);
  if (filters.city && filters.lat != null && !filters.radiusMiles && /\baround\b/i.test(filters.raw)) {
    filters.radiusMiles = 25;
  }
  if (filters.city && filters.lat != null && !filters.radiusMiles && extras.exactCity !== true) {
    filters.radiusMiles = DEFAULT_CITY_RADIUS_MILES;
  }
  if (extras.city && !filters.city) {
    const hit = matchCity(extras.city);
    if (hit) {
      filters.city = hit.name;
      if (!filters.state) filters.state = hit.state;
      if (filters.lat == null) {
        filters.lat = hit.lat;
        filters.lng = hit.lng;
      }
    } else {
      filters.city = String(extras.city);
    }
  }

  return filters;
}

function haversineMiles(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function listingHaystack(listing) {
  return [
    listing.title,
    listing.address,
    listing.city,
    listing.state,
    listing.postalCode,
    listing.location,
    listing.county,
    listing.neighborhood,
    listing.propertyType,
    listing.desc,
    listing.description,
    listing.listingAgent,
    listing.listingOffice,
    listing.mlsNumber,
    listing.providerListingId,
    ...(listing.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function textScore(listing, filters) {
  const hay = listingHaystack(listing);
  let score = 0;
  const tokens = [filters.text, filters.street, filters.city, filters.county, filters.postalCode, filters.state]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (!tokens.length) return 1;
  for (const token of tokens) {
    if (hay.includes(token)) score += token.length >= 5 ? 2 : 1;
    else if (token.length >= 5) {
      const words = hay.split(/[^a-z0-9]+/);
      if (words.some((w) => w.length >= 5 && levenshtein(w, token) <= 1)) score += 0.6;
    }
  }
  if (filters.street && String(listing.address || listing.title || "").toLowerCase().includes(filters.street.toLowerCase())) {
    score += 6;
  }
  if (filters.postalCode && String(listing.postalCode || listing.location || "").includes(filters.postalCode)) {
    score += 4;
  }
  if (filters.city && new RegExp(`\\b${filters.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay)) {
    score += 3;
  }
  return score;
}

function matchesFilters(listing, filters) {
  if (filters.status && filters.status !== "all") {
    if (String(listing.status || "").toLowerCase() !== String(filters.status).toLowerCase()) {
      return false;
    }
  }
  if (filters.beds && Number(listing.beds || 0) < filters.beds) return false;
  if (filters.baths && Number(listing.baths || 0) < filters.baths) return false;
  const price = Number(listing.listPrice || listing.offer || 0);
  if (filters.minPrice && price && price < filters.minPrice) return false;
  if (filters.maxPrice && price && price > filters.maxPrice) return false;
  if (filters.maxPrice && !price && String(listing.source || "") === "court") return false;
  const sqft = Number(listing.sqft || 0);
  if (filters.minSqft && sqft && sqft < filters.minSqft) return false;
  if (filters.maxSqft && sqft && sqft > filters.maxSqft) return false;
  if (filters.propertyType) {
    const pt = String(listing.propertyType || "").toLowerCase();
    const want = filters.propertyType;
    const ok =
      pt.includes(want) ||
      (want === "house" && /single|residential|home|house/.test(pt || "house")) ||
      (want === "condo" && /condo/.test(pt)) ||
      (want === "townhouse" && /town/.test(pt));
    if (pt && !ok && want !== "house") return false;
  }
  if (filters.postalCode) {
    const zipHay = `${listing.postalCode || ""} ${listing.location || ""} ${listing.address || ""}`;
    if (!zipHay.includes(filters.postalCode)) return false;
  }
  if (filters.state && !(filters.radiusMiles && filters.lat != null)) {
    const st = String(listing.state || listing.location || "");
    if (st && !new RegExp(`\\b${filters.state}\\b`, "i").test(st)) return false;
  }
  if (filters.listingKind && filters.listingKind !== "all") {
    const kind = listing.listingKind || (listing.source === "court" ? "public_record" : "active_listing");
    if (kind !== filters.listingKind) return false;
  }
  if (filters.neighborhood) {
    const hay = listingHaystack(listing);
    if (!hay.includes(String(filters.neighborhood).toLowerCase())) return false;
  }
  if (filters.city) {
    const hay = listingHaystack(listing);
    const city = filters.city.toLowerCase();
    const inCity = hay.includes(city);
    if (!inCity) {
      if (filters.radiusMiles && filters.lat != null && listing.latitude != null && listing.longitude != null) {
        if (haversineMiles(filters.lat, filters.lng, listing.latitude, listing.longitude) > filters.radiusMiles) return false;
      } else {
        return false;
      }
    }
  }
  if (filters.radiusMiles && filters.lat != null && listing.latitude != null && listing.longitude != null) {
    if (haversineMiles(filters.lat, filters.lng, listing.latitude, listing.longitude) > filters.radiusMiles) return false;
  }
  if (filters.west != null && filters.east != null && listing.longitude != null && listing.latitude != null) {
    const lng = Number(listing.longitude);
    const lat = Number(listing.latitude);
    if (lng < filters.west || lng > filters.east || lat < filters.south || lat > filters.north) return false;
  }
  if (filters.listedWithinDays) {
    const ts = Date.parse(listing.listingDate || listing.firstSeenAt || listing.asOf || 0);
    if (!ts) return false;
    if (Date.now() - ts > filters.listedWithinDays * 86400000) return false;
  }
  if (filters.street) {
    const addr = `${listing.address || ""} ${listing.title || ""}`.toLowerCase();
    const parts = filters.street.toLowerCase().split(/\s+/).filter(Boolean);
    if (!parts.every((p) => addr.includes(p) || levenshtein(addr, p) <= 2)) {
      const joined = parts.join(" ");
      if (!addr.includes(joined) && !parts.slice(1).every((p) => addr.includes(p))) return false;
    }
  }
  if (filters.text) {
    if (textScore(listing, { ...filters, city: "", postalCode: "", street: "" }) <= 0) {
      const hay = listingHaystack(listing);
      const tokens = filters.text.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      if (tokens.length && !tokens.some((t) => hay.includes(t))) return false;
    }
  }
  return true;
}

function completenessScore(listing) {
  let n = 0;
  if (listing.address || listing.title) n += 1;
  if (listing.city || listing.location) n += 1;
  if (Number(listing.listPrice || 0) > 0) n += 1;
  if (Number(listing.beds || 0) > 0) n += 1;
  if (Number(listing.baths || 0) > 0) n += 1;
  if (Number(listing.sqft || 0) > 0) n += 1;
  if (listing.propertyType) n += 1;
  if (listing.status) n += 1;
  if (listing.listingDate || listing.asOf) n += 1;
  if (listing.latitude != null && listing.longitude != null) n += 1;
  if (listing.providerListingId || listing.mlsNumber) n += 1;
  if (listing.sourceUrl) n += 1;
  if (listing.listingAgent || listing.listingOffice) n += 1;
  if (listing.desc || listing.description) n += 1;
  return n;
}

function listingMatchWeight(listing) {
  const source = String(listing.source || "").toLowerCase();
  const status = String(listing.status || "").toLowerCase();
  const active = !status || status === "active" || /sale|auction|hud/i.test(status);
  if (source === "court") return active ? 1 : 0;
  if (source === "hud" || source === "reso" || source === "mock") return active ? 3 : 2;
  return active ? 2 : 1;
}

function rankListings(listings, filters, extras = {}) {
  const originLat = filters.lat != null ? filters.lat : extras.lat;
  const originLng = filters.lng != null ? filters.lng : extras.lng;
  const now = Date.now();

  return listings
    .map((listing) => {
      const photos = Array.isArray(listing.images) ? listing.images.length : listing.image ? 1 : 0;
      const geo =
        originLat != null && listing.latitude != null && listing.longitude != null
          ? Math.max(0, 80 - haversineMiles(originLat, originLng, listing.latitude, listing.longitude))
          : filters.city
            ? listingHaystack(listing).includes(String(filters.city).toLowerCase())
              ? 40
              : 0
            : 10;
      const freshness = listing.listingDate || listing.asOf || listing.firstSeenAt || listing.lastUpdated;
      const ageDays = freshness ? Math.max(0, (now - new Date(freshness).getTime()) / 86400000) : 365;
      const fresh = Math.max(0, 60 - ageDays);
      const text = textScore(listing, filters);
      const complete = completenessScore(listing);
      const match = listingMatchWeight(listing);
      const score = match * 1_000_000 + geo * 10_000 + text * 1_000 + fresh * 100 + complete * 10 + Math.min(photos, 8) * 5;
      const miles =
        originLat != null && listing.latitude != null && listing.longitude != null
          ? haversineMiles(originLat, originLng, listing.latitude, listing.longitude)
          : null;
      return { listing: { ...listing, _score: score, _miles: miles }, score, miles };
    })
    .sort((a, b) => b.score - a.score)
    .map((row) => row.listing);
}

function sortListings(listings, sort) {
  const copy = listings.slice();
  const key = String(sort || "");
  const by = {
    newest: (a, b) => new Date(b.listingDate || b.asOf || 0) - new Date(a.listingDate || a.asOf || 0),
    recently_added: (a, b) => new Date(b.firstSeenAt || 0) - new Date(a.firstSeenAt || 0),
    price_asc: (a, b) => Number(a.listPrice || 0) - Number(b.listPrice || 0),
    "price-asc": (a, b) => Number(a.listPrice || a.offer || 0) - Number(b.listPrice || b.offer || 0),
    price_desc: (a, b) => Number(b.listPrice || 0) - Number(a.listPrice || 0),
    "price-desc": (a, b) => Number(b.listPrice || b.offer || 0) - Number(a.listPrice || a.offer || 0),
    beds: (a, b) => Number(b.beds || 0) - Number(a.beds || 0),
    beds_desc: (a, b) => Number(b.beds || 0) - Number(a.beds || 0),
    baths: (a, b) => Number(b.baths || 0) - Number(a.baths || 0),
    sqft: (a, b) => Number(b.sqft || 0) - Number(a.sqft || 0),
    sqft_asc: (a, b) => Number(a.sqft || 0) - Number(b.sqft || 0),
    distance: (a, b) => (a._miles ?? 1e9) - (b._miles ?? 1e9),
    city: (a, b) => String(a.city || "").localeCompare(String(b.city || "")),
    property_type: (a, b) => String(a.propertyType || "").localeCompare(String(b.propertyType || "")),
  };
  if (by[key]) copy.sort(by[key]);
  return copy;
}

module.exports = {
  defaultCatalog,
  haversineMiles,
  matchCity,
  matchesFilters,
  parseMoneyToken,
  parseSearchQuery,
  rankListings,
  sortListings,
  textScore,
  DEFAULT_CITY_RADIUS_MILES,
};
