"use strict";

const { SYNC_DEFAULTS } = require("./constants");
const { entityKind, isGovernmentPrimary, isHiddenOffice, hasUsableStreetAddress } = require("./entity");

const STREET_VIEW_DEFAULTS = {
  metadataBudgetPerSync: 40,
  staticBudgetPerHour: 200,
  recheckMs: SYNC_DEFAULTS.streetViewRecheckMs,
  size: "800x500",
  fov: 80,
  pitch: 8,
};

function usableListingPhotos(listing = {}) {
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
    return /^https?:\/\//i.test(src) || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(src);
  });
}

function propertyLocationQuery(listing = {}) {
  const lat = Number(listing.latitude);
  const lng = Number(listing.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    return { kind: "coords", lat, lng, query: `${lat},${lng}` };
  }
  const address = [listing.address || listing.title, listing.city, listing.state, listing.postalCode]
    .filter(Boolean)
    .join(", ");
  if (address && hasUsableStreetAddress(listing)) {
    return { kind: "address", query: address };
  }
  return null;
}

function isEligibleForStreetView(listing = {}) {
  if (!listing) return false;
  if (isHiddenOffice(listing) || isGovernmentPrimary(listing)) return false;
  if (entityKind(listing) === "government" || entityKind(listing) === "office") return false;
  if (String(listing.listingKind || "") === "public_record" && String(listing.source || "") === "court") return false;
  if (!hasUsableStreetAddress(listing) && propertyLocationQuery(listing)?.kind !== "coords") return false;
  return true;
}

function bearingDegrees(fromLat, fromLng, toLat, toLng) {
  const φ1 = (Number(fromLat) * Math.PI) / 180;
  const φ2 = (Number(toLat) * Math.PI) / 180;
  const Δλ = ((Number(toLng) - Number(fromLng)) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

function shouldRecheckStreetView(listing, now = Date.now(), recheckMs = STREET_VIEW_DEFAULTS.recheckMs) {
  if (usableListingPhotos(listing).length) return false;
  if (!isEligibleForStreetView(listing)) return false;
  const sv = listing.streetView || {};
  if (!sv.checkedAt) return true;
  if (sv.status === "ZERO_RESULTS") {
    return now - Date.parse(sv.checkedAt) > recheckMs;
  }
  return now - Date.parse(sv.checkedAt) > recheckMs;
}

function headingTowardProperty(metaLocation, listing) {
  const panoLat = Number(metaLocation && metaLocation.lat);
  const panoLng = Number(metaLocation && metaLocation.lng);
  const propLat = Number(listing.latitude);
  const propLng = Number(listing.longitude);
  if (![panoLat, panoLng, propLat, propLng].every((n) => Number.isFinite(n))) return null;
  if (panoLat === propLat && panoLng === propLng) return null;
  return Math.round(bearingDegrees(panoLat, panoLng, propLat, propLng) * 10) / 10;
}

async function lookupStreetViewMetadata({ listing, key, fetchImpl }) {
  const loc = propertyLocationQuery(listing);
  if (!key || !loc) return { available: false, skipped: !key ? "no_key" : "no_location" };
  const fetchFn = fetchImpl || fetch;
  const url =
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(loc.query)}&key=${encodeURIComponent(key)}`;
  const res = await fetchFn(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return { available: false, error: `streetview ${res.status}`, checkedAt: new Date().toISOString() };
  const data = await res.json();
  const status = data.status || "";
  if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
    return {
      available: false,
      status,
      panoId: "",
      checkedAt: new Date().toISOString(),
    };
  }
  if (status !== "OK") {
    return { available: false, status, error: status, checkedAt: new Date().toISOString() };
  }
  const panoLat = data.location && data.location.lat;
  const panoLng = data.location && data.location.lng;
  const heading = headingTowardProperty(data.location, listing);
  return {
    available: true,
    status,
    panoId: data.pano_id || "",
    panoLat: panoLat != null ? Number(panoLat) : null,
    panoLng: panoLng != null ? Number(panoLng) : null,
    heading,
    copyright: data.copyright || "© Google",
    date: data.date || "",
    checkedAt: new Date().toISOString(),
  };
}

function buildStreetViewStaticUrl({ panoId, heading, key, size, fov, pitch, locationQuery }) {
  const params = new URLSearchParams();
  params.set("size", size || STREET_VIEW_DEFAULTS.size);
  params.set("fov", String(fov != null ? fov : STREET_VIEW_DEFAULTS.fov));
  params.set("pitch", String(pitch != null ? pitch : STREET_VIEW_DEFAULTS.pitch));
  if (panoId) params.set("pano", panoId);
  else if (locationQuery) params.set("location", locationQuery);
  if (heading != null && Number.isFinite(Number(heading))) params.set("heading", String(heading));
  params.set("key", key);
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

/**
 * Ingest-time: metadata only. Never writes a Street View image URL (or API key)
 * onto listing.image / listing.images.
 */
async function applyStreetViewFallback(listing, { key, fetchImpl, now, budget } = {}) {
  const photos = usableListingPhotos(listing);
  if (photos.length) {
    return { listing: { ...listing, streetView: listing.streetView || null }, requested: false };
  }
  if (!isEligibleForStreetView(listing)) {
    return {
      listing: {
        ...listing,
        streetView: {
          ...(listing.streetView || {}),
          available: false,
          skipped: "ineligible",
          checkedAt: new Date().toISOString(),
        },
      },
      requested: false,
    };
  }
  if (!shouldRecheckStreetView(listing, now)) {
    return { listing, requested: false };
  }
  if (!key) {
    return {
      listing: {
        ...listing,
        streetView: { ...(listing.streetView || {}), checkedAt: new Date().toISOString(), available: false, skipped: "no_key" },
      },
      requested: false,
    };
  }
  if (budget && budget.remaining <= 0) {
    return { listing, requested: false, skipped: "quota" };
  }
  const meta = await lookupStreetViewMetadata({ listing, key, fetchImpl });
  if (budget) budget.remaining -= 1;
  return {
    listing: {
      ...listing,
      streetView: meta,
    },
    requested: true,
  };
}

function imagePresentation(listing = {}) {
  const photos = usableListingPhotos(listing);
  const sv = listing.streetView || {};
  const streetViewAvailable = !!(sv.available && (sv.panoId || propertyLocationQuery(listing)));
  const streetViewPanoId = sv.panoId || "";
  if (photos.length) {
    const provider = String(listing.source || "");
    const source = provider === "hud" || provider === "reso" || provider === "idx" ? "provider" : "listing";
    return {
      hasListingPhotos: true,
      streetViewAvailable,
      streetViewPanoId,
      primaryImageSource: source,
      displayImage: {
        src: photos[0],
        source,
        label: "",
        attribution: "",
      },
    };
  }
  if (streetViewAvailable && listing.id) {
    return {
      hasListingPhotos: false,
      streetViewAvailable: true,
      streetViewPanoId,
      primaryImageSource: "street_view",
      displayImage: {
        src: `/api/listings/${encodeURIComponent(listing.id)}/street-view`,
        source: "street_view",
        label: "Street View",
        attribution: sv.copyright || "© Google",
      },
    };
  }
  return {
    hasListingPhotos: false,
    streetViewAvailable: false,
    streetViewPanoId: "",
    primaryImageSource: "placeholder",
    displayImage: {
      src: "/images/photo-unavailable.svg",
      source: "placeholder",
      label: "Photo unavailable",
      attribution: "",
    },
  };
}

function createStreetViewQuota({ staticLimit = STREET_VIEW_DEFAULTS.staticBudgetPerHour, windowMs = 60 * 60 * 1000 } = {}) {
  let used = 0;
  let started = Date.now();
  return {
    tryConsume(n = 1) {
      const now = Date.now();
      if (now - started > windowMs) {
        used = 0;
        started = now;
      }
      if (used + n > staticLimit) return false;
      used += n;
      return true;
    },
    used() {
      return used;
    },
  };
}

module.exports = {
  STREET_VIEW_DEFAULTS,
  usableListingPhotos,
  isEligibleForStreetView,
  bearingDegrees,
  headingTowardProperty,
  shouldRecheckStreetView,
  lookupStreetViewMetadata,
  buildStreetViewStaticUrl,
  applyStreetViewFallback,
  imagePresentation,
  createStreetViewQuota,
  propertyLocationQuery,
};
