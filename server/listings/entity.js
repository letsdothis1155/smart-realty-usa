"use strict";

/**
 * Decide whether a record is a real home / listing, or a government /
 * filing / office entity that must never appear as a property result.
 *
 * A HUD or MLS home is still a home even if county/court data exists for it.
 * Government words in a description ("bid at the courthouse") do not make
 * the property a courthouse.
 */

const GOV_PRIMARY_RE = /\b(county\s+)?courthouse\b|\bclerk of (the )?court\b|\bclerk'?s? office\b|\brecorder('?s)? (office|building)\b|\bassessor('?s)? (office|building)\b|\btax (office|collector|assessor|building)\b|\bsheriff('?s)? (office|department|hq)\b|\bcounty administration\b|\bgovernment (office|building|center|complex)\b|\bmunicipal (building|office|center|hall)\b|\brecords department\b|\bhall of (justice|records)\b|\bjudicial center\b|\bcircuit court\b|\bmaster commissioner\b/i;

const GOV_KNOWN_STREETS = [
  "600 w jefferson",
  "600 west jefferson",
  "514 w liberty",
  "514 west liberty",
  "527 w jefferson",
  "531 court pl",
  "531 court place",
  "700 w jefferson",
  "jefferson county judicial",
  "jefferson circuit court",
];

const HIDDEN_OFFICE_RE = /\b2611\s+harmony(\s+rd|\s+road)?\b/i;

const COMMERCIAL_TYPE_RE = /\b(commercial|industrial|retail|office(?:\s+building)?|warehouse|self[- ]storage|mixed use|gas station|hotel|motel|church|parking lot)\b/i;
const VACANT_PARCEL_RE = /\b(vacant (land|lot)|unimproved|parcel (no|id|#)|tax id only)\b/i;
const RESIDENTIAL_TYPE_RE = /\b(single family|single-family|sfh|residential|house|home|condo|condominium|townhome|townhouse|multi[- ]?family|duplex|apartment)\b/i;

function listingText(listing = {}, fields) {
  return fields
    .map((key) => {
      const value = listing[key];
      if (Array.isArray(value)) return value.join(" ");
      return value == null ? "" : String(value);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStreet(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(street|str)\b/g, "st")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(lane)\b/g, "ln")
    .replace(/\b(court)\b/g, "ct")
    .replace(/\b(place)\b/g, "pl")
    .replace(/\b(west)\b/g, "w")
    .replace(/\b(east)\b/g, "e")
    .replace(/\b(north)\b/g, "n")
    .replace(/\b(south)\b/g, "s")
    .replace(/\s+/g, " ")
    .trim();
}

function houseNumber(raw) {
  return normalizeStreet(raw).match(/^(\d+)/)?.[1] || "";
}

function addressKey(listing = {}) {
  return normalizeStreet(listing.address || listing.title || "");
}

function isHiddenOffice(listing = {}) {
  const blob = listingText(listing, ["address", "title", "location", "desc", "description"]);
  return HIDDEN_OFFICE_RE.test(blob);
}

function isGovernmentPrimary(listing = {}) {
  if (isHiddenOffice(listing)) return false;
  const primary = listingText(listing, ["address", "title", "location", "propertyType"]);
  const street = addressKey(listing);
  if (GOV_KNOWN_STREETS.some((s) => street.includes(s) || primary.toLowerCase().includes(s))) {
    return true;
  }
  if (GOV_PRIMARY_RE.test(primary)) return true;
  return false;
}

function hasUsableStreetAddress(listing = {}) {
  const addr = listing.address || listing.title || "";
  if (!houseNumber(addr)) return false;
  if (/\bparcel\s*(no|id|#)?\b/i.test(addr) && !houseNumber(addr)) return false;
  if (/^jefferson county parcel$/i.test(String(listing.title || "").trim())) return false;
  return true;
}

function usablePhotos(listing = {}) {
  const images = Array.isArray(listing.images) ? listing.images.slice() : [];
  if (listing.image && !images.includes(listing.image)) images.unshift(listing.image);
  return images.filter((src) => {
    if (!src || typeof src !== "string") return false;
    if (src.startsWith("data:")) return false;
    const last = src.split("?")[0].split("/").pop() || "";
    if (/^NoImage/i.test(last) || /placeholder|photo-unavailable/i.test(src)) return false;
    if (/maps\.googleapis\.com\/maps\/api\/streetview/i.test(src)) return false;
    if (/courthouse|circuit.?court|master.?commissioner/i.test(src)) return false;
    if (listing.imageSource === "street_view" && src === listing.image) return false;
    return true;
  });
}

function isCourtSource(listing = {}) {
  return String(listing.source || "").toLowerCase() === "court";
}

function entityKind(listing = {}) {
  if (isHiddenOffice(listing)) return "office";
  if (isGovernmentPrimary(listing)) return "government";
  const source = String(listing.source || "").toLowerCase();
  if ((source === "court" || source === "hud") && !hasUsableStreetAddress(listing)) return "public_record";
  return "home";
}

function isResidentialListing(listing = {}) {
  if (isHiddenOffice(listing) || isGovernmentPrimary(listing)) return false;
  if (entityKind(listing) !== "home") return false;
  if (!hasUsableStreetAddress(listing)) return false;
  const type = String(listing.propertyType || "");
  const blob = listingText(listing, ["address", "title", "propertyType", "desc", "description"]);
  if (VACANT_PARCEL_RE.test(blob) && !RESIDENTIAL_TYPE_RE.test(type)) return false;
  if (type && COMMERCIAL_TYPE_RE.test(type) && !RESIDENTIAL_TYPE_RE.test(type)) return false;
  if (COMMERCIAL_TYPE_RE.test(blob) && !RESIDENTIAL_TYPE_RE.test(type || blob) && !hasUsableStreetAddress(listing)) {
    return false;
  }
  return true;
}

function isPrimaryHomeResult(listing = {}) {
  const kind = entityKind(listing);
  if (kind !== "home") return false;
  if (!isResidentialListing(listing)) return false;
  if ((listing.qualityFlags || []).some((f) => f.severity === "block")) return false;
  return true;
}

function canView3D(listing = {}) {
  if (!isPrimaryHomeResult(listing)) return false;
  if (isCourtSource(listing)) return false;
  return usablePhotos(listing).length > 0;
}

function attachPublicRecords(homes, records) {
  const byKey = new Map();
  for (const home of homes) {
    const key = addressKey(home);
    if (key) byKey.set(key, home);
  }
  const leftover = [];
  for (const rec of records) {
    const key = addressKey(rec);
    const home = key ? byKey.get(key) : null;
    const payload = {
      kind: rec.kind || rec.source || "public_record",
      address: rec.address || rec.title || "",
      caseNumber: rec.caseNumber || "",
      saleDate: rec.saleDate || "",
      amount: rec.amount ?? rec.listPrice ?? null,
      source: rec.source || "court",
      sourceUrl: rec.sourceUrl || "",
      status: rec.status || "",
    };
    if (home) {
      home.publicRecords = [...(home.publicRecords || []), payload];
    } else {
      leftover.push(rec);
    }
  }
  return leftover;
}

module.exports = {
  GOV_PRIMARY_RE,
  HIDDEN_OFFICE_RE,
  addressKey,
  attachPublicRecords,
  canView3D,
  entityKind,
  hasUsableStreetAddress,
  houseNumber,
  isGovernmentPrimary,
  isHiddenOffice,
  isPrimaryHomeResult,
  isResidentialListing,
  normalizeStreet,
  usablePhotos,
};
