"use strict";

const { LISTING_STATUS } = require("../constants");
const { normalizeListing } = require("../normalize");
const { HUD_COVERAGE_STATES, HUD_FOCUS_REGIONS } = require("../locations");

const HUD_CLOUDINARY =
  "https://res.cloudinary.com/yardi/image/upload/q_auto,f_auto,c_limit/d_hhs:themes:common:images:NoImage.jpg/hhs/";

/**
 * Public HUD Home Store listings (government inventory).
 * Not MLS. Not a brokerage feed. Attribution required.
 */
const HUD_SAMPLE = [
  {
    id: "hud-201-671721",
    providerListingId: "201-671721",
    mlsNumber: "201-671721",
    address: "329 Holmes St",
    city: "Frankfort",
    state: "KY",
    postalCode: "40601",
    title: "329 Holmes St",
    listPrice: 212000,
    beds: 4,
    baths: 2.1,
    sqft: 2049,
    listingDate: "2026-08-19T00:00:00Z",
    asOf: "2026-08-19T00:00:00Z",
    status: "demo",
    propertyType: "Single Family Home",
    latitude: 38.2009,
    longitude: -84.8733,
    desc: "Sample HUD-shaped record for development only. This is not current inventory.",
    sourceUrl: "https://www.hudhomestore.gov/searchresult?citystate=Frankfort%2C%20KY",
    listingOffice: "HUD Home Store",
    listingAgent: "",
    mlsSourceName: "HUD sample fallback",
    source: "hud_sample",
    listingKind: "demo_listing",
    image: "https://res.cloudinary.com/yardi/image/upload/q_auto,f_auto,c_limit/d_hhs:themes:common:images:NoImage.jpg/hhs/FRONT.jpg",
    images: [],
  },
];

function parseAvailableProp(html) {
  const m = String(html || "").match(/id=["']available_prop["'][^>]*value=["']([^"']*)["']/i);
  if (!m) return [];
  let raw = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&");
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function parseHudDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const iso = `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}T00:00:00Z`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? iso : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function hudImageUrls(row) {
  const images = [];
  const thumb = String(row.propertyThumb || "").trim();
  if (thumb.startsWith("http") && !/NoImage/i.test(thumb)) images.push(thumb);
  const raw = String(row.galleryImages || "");
  const names = [...raw.matchAll(/([A-Za-z0-9._-]+\.(?:jpe?g|png))/gi)].map((m) => m[1]);
  for (const name of names) {
    const url = `${HUD_CLOUDINARY}${name}`;
    if (!images.includes(url)) images.push(url);
  }
  return images;
}

function mapHudRow(row) {
  const caseNumber = String(row.propertyCaseNumber || "").trim();
  const addr = String(row.propertyAddress || "").replace(/\s+/g, " ").trim();
  const price = Number(String(row.listPrice || "").replace(/[^0-9.]/g, ""));
  if (!caseNumber || !addr || !(price > 0)) return null;
  const city = String(row.propertyCity || "").trim();
  const state = String(row.propertyState || "KY").trim();
  const zip = String(row.propertyZip || "").trim();
  let lng = Number(row.longitude);
  const lat = Number(row.latitude);
  if (lat > 24 && lat < 50 && lng > 0 && lng < 130) lng = -lng;
  const images = hudImageUrls(row);
  const listed = parseHudDate(row.listDate);
  return normalizeListing({
    id: `hud-${caseNumber}`,
    providerListingId: caseNumber,
    mlsNumber: caseNumber,
    address: addr,
    title: addr,
    city,
    state,
    postalCode: zip,
    county: String(row.propertyCounty || "").trim(),
    listPrice: Math.round(price),
    beds: Number(row.bedrooms) || 0,
    baths: Number(row.bathroomsdecimal || row.bathrooms) || 0,
    sqft: Number(row.squareFootage) || 0,
    yearBuilt: Number(row.yearBuilt) || null,
    listingDate: listed,
    status: LISTING_STATUS.ACTIVE,
    propertyType: row.propertyType || "Single Family Home",
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    desc: `Public HUD Home Store listing ${caseNumber}. SMART REALTY.US LLC did not list this home.`,
    sourceUrl: `https://www.hudhomestore.gov/searchresult?citystate=${encodeURIComponent(`${city}, ${state}`)}`,
    listingOffice: "HUD Home Store",
    mlsSourceName: "HUD Home Store",
    source: "hud",
    image: images[0] || "",
    images,
    imageSource: images.length ? "listing" : "",
    primaryImageSource: images.length ? "listing" : "",
    hasListingPhotos: images.length > 0,
    providerUpdatedAt: listed,
  });
}

function createHudListingsProvider(config = {}) {
  const base = (config.regions || HUD_COVERAGE_STATES).map((r) => String(r).trim()).filter(Boolean);
  const extra = (config.extraRegions || HUD_FOCUS_REGIONS).map((r) => String(r).trim()).filter(Boolean);
  const seenRegion = new Set();
  const regions = [];
  for (const r of [...base, ...extra]) {
    const key = r.toLowerCase();
    if (seenRegion.has(key)) continue;
    seenRegion.add(key);
    regions.push(r);
  }
  const fetchImpl = config.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const allowSampleFallback = config.allowSampleFallback === true;

  return {
    name: "hud",
    sandbox: false,
    configured: true,
    regions,
    async fetchListings() {
      if (!fetchImpl) {
        if (allowSampleFallback) {
          return { listings: HUD_SAMPLE.map((row) => normalizeListing(row)), complete: false, syncedAt: new Date().toISOString() };
        }
        throw new Error("HUD fetch is unavailable");
      }
      const listings = [];
      const seen = new Set();
      const warnings = [];
      for (const region of regions) {
        try {
          const url = `https://www.hudhomestore.gov/searchresult?citystate=${encodeURIComponent(region)}`;
          const res = await fetchImpl(url, {
            headers: {
              Accept: "text/html",
              "User-Agent": "Mozilla/5.0 (compatible; SMART-REALTY.US-LLC/1.0; +https://smartrealty.us)",
            },
          });
          if (!res.ok) throw new Error(`HUD ${region} HTTP ${res.status}`);
          const html = await res.text();
          for (const row of parseAvailableProp(html)) {
            const mapped = mapHudRow(row);
            if (!mapped || seen.has(mapped.id)) continue;
            seen.add(mapped.id);
            listings.push(mapped);
          }
        } catch (error) {
          warnings.push(`${region}: ${error.message}`);
        }
      }
      if (!listings.length) {
        if (!allowSampleFallback) throw new Error(warnings.join("; ") || "HUD returned no homes");
        return {
          listings: HUD_SAMPLE.map((row) => normalizeListing(row)),
          complete: false,
          incremental: false,
          warning: warnings.join("; "),
          syncedAt: new Date().toISOString(),
        };
      }
      return {
        listings,
        complete: warnings.length === 0,
        incremental: false,
        warning: warnings.length ? warnings.join("; ") : undefined,
        syncedAt: new Date().toISOString(),
      };
    },
  };
}

module.exports = { createHudListingsProvider, parseAvailableProp, mapHudRow, hudImageUrls, parseHudDate };
