"use strict";

const { isGovernmentPrimary, isHiddenOffice, isResidentialListing } = require("./entity");
const { listingDedupeKey } = require("./normalize");

function auditListings(listings = [], now = Date.now()) {
  const issues = [];
  const seen = new Map();
  let hiddenFromSearch = 0;

  for (const listing of listings) {
    const flags = [];
    const price = Number(listing.listPrice || 0);
    const sqft = Number(listing.sqft || 0);
    const ppsf = price && sqft ? price / sqft : null;

    if (isGovernmentPrimary(listing) || isHiddenOffice(listing)) {
      flags.push({ code: "courthouse_or_office", severity: "block", message: "Looks like a government/office address, not a home." });
    }
    if (!isResidentialListing(listing) && listing.listingKind !== "public_record") {
      flags.push({ code: "non_residential", severity: "block", message: "Does not look like a residential home for sale." });
    }
    if (price <= 0 || price > 80_000_000) {
      flags.push({ code: "impossible_price", severity: "warn", message: `List price ${price} is outside a plausible published range.` });
    }
    if (ppsf && (ppsf < 15 || ppsf > 5000)) {
      flags.push({ code: "impossible_ppsf", severity: "warn", message: `$/sqft ${Math.round(ppsf)} looks implausible from published fields.` });
    }
    if (!listing.latitude || !listing.longitude) {
      flags.push({ code: "missing_coordinates", severity: "info", message: "No map coordinates." });
    }
    const photos = [].concat(listing.images || [], listing.image || []);
    if (!photos.filter((u) => u && !/NoImage|placeholder|data:/i.test(String(u))).length) {
      flags.push({ code: "missing_photos", severity: "info", message: "No usable listing photo." });
    }
    if (listing.lastSeenAt && now - Date.parse(listing.lastSeenAt) > 14 * 86400000 && listing.status === "active") {
      flags.push({ code: "stale_active", severity: "warn", message: "Marked active but last seen more than 14 days ago." });
    }
    if (listing.city && listing.location && !String(listing.location).toLowerCase().includes(String(listing.city).toLowerCase().slice(0, 4))) {
      flags.push({ code: "city_mismatch", severity: "info", message: "City and location text do not obviously match." });
    }
    const key = listingDedupeKey(listing);
    if (seen.has(key)) {
      flags.push({ code: "duplicate", severity: "warn", message: `Duplicate of ${seen.get(key)}` });
    } else {
      seen.set(key, listing.id);
    }

    listing.qualityFlags = flags;
    if (flags.some((f) => f.severity === "block")) hiddenFromSearch += 1;
  }

  return {
    checked: listings.length,
    blocked: hiddenFromSearch,
    warnings: listings.reduce((n, l) => n + (l.qualityFlags || []).filter((f) => f.severity === "warn").length, 0),
    issues: listings.flatMap((l) =>
      (l.qualityFlags || []).map((f) => ({ listingId: l.id, title: l.title, ...f })),
    ),
  };
}

module.exports = { auditListings };
