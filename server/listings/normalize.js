"use strict";

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStreetLine(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\bstreet\b/g, "st")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(lane)\b/g, "ln")
    .replace(/\b(court)\b/g, "ct")
    .replace(/\b(place)\b/g, "pl")
    .replace(/\b(boulevard)\b/g, "blvd")
    .replace(/\b(parkway)\b/g, "pkwy")
    .replace(/\b(north)\b/g, "n")
    .replace(/\b(south)\b/g, "s")
    .replace(/\b(east)\b/g, "e")
    .replace(/\b(west)\b/g, "w")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddressKey(listing) {
  const raw = [
    normalizeStreetLine(listing.address || listing.title),
    String(listing.city || "").toLowerCase(),
    String(listing.state || "").toLowerCase(),
    String(listing.postalCode || listing.zip || "").replace(/\D/g, "").slice(0, 5),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return raw;
}

function listingDedupeKey(listing) {
  const source = String(listing.source || "unknown").toLowerCase();
  const providerId = listing.providerListingId || listing.mlsNumber || listing.id;
  if (providerId) return `${source}::id::${String(providerId).toLowerCase()}`;
  return `${source}::addr::${normalizeAddressKey(listing)}`;
}

function addressDedupeKey(listing) {
  const addr = normalizeAddressKey(listing);
  if (addr) return `addr::${addr}`;
  const lat = listing.latitude;
  const lng = listing.longitude;
  if (lat != null && lng != null) {
    return `geo::${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  }
  return "";
}

function inferListingKind(raw = {}) {
  if (raw.listingKind) return raw.listingKind;
  const source = String(raw.source || "").toLowerCase();
  if (source === "court" || source === "pva" || source === "assessor") return "public_record";
  return "active_listing";
}

function emptyMonetization() {
  return {
    shopThisRoom: false,
    affiliates: false,
    mortgage: false,
    homeServices: false,
    moving: false,
    insurance: false,
    contractors: false,
    smartHome: false,
    furniture: false,
    appliances: false,
  };
}

function normalizeListing(raw = {}) {
  const address = raw.address || raw.title || "";
  const city = raw.city || "";
  const state = raw.state || "";
  const postalCode = raw.postalCode || raw.zip || "";
  const location =
    raw.location ||
    [city, state, postalCode].filter(Boolean).join(", ") ||
    address;
  const listingDate = raw.listingDate || raw.asOf || null;
  return {
    id: raw.id,
    mlsNumber: raw.mlsNumber || null,
    providerListingId: raw.providerListingId || raw.mlsNumber || raw.id || null,
    source: raw.source || "mock",
    title: raw.title || address || "Untitled listing",
    address,
    city,
    state,
    postalCode,
    location,
    county: raw.county || "",
    neighborhood: raw.neighborhood || "",
    country: raw.country || "US",
    listingKind: inferListingKind(raw),
    recordSource: raw.recordSource || "",
    yearBuilt: raw.yearBuilt != null ? numberOr(raw.yearBuilt, null) : null,
    previousPrice: raw.previousPrice != null ? numberOr(raw.previousPrice, null) : null,
    priceChange: raw.priceChange != null ? numberOr(raw.priceChange, null) : null,
    virtualTour: raw.virtualTour || raw.VirtualTourURLUnbranded || "",
    tour3dUrl: raw.tour3dUrl || "",
    monetization: { ...emptyMonetization(), ...(raw.monetization || {}) },
    latitude: raw.latitude != null ? numberOr(raw.latitude, null) : null,
    longitude: raw.longitude != null ? numberOr(raw.longitude, null) : null,
    image: raw.image || (raw.images && raw.images[0]) || "",
    images: Array.isArray(raw.images) ? raw.images.filter(Boolean) : raw.image ? [raw.image] : [],
    beds: numberOr(raw.beds, 0),
    baths: numberOr(raw.baths, 0),
    sqft: numberOr(raw.sqft, 0),
    lotSize: raw.lotSize != null ? numberOr(raw.lotSize, null) : null,
    listPrice: numberOr(raw.listPrice, 0),
    status: raw.status || "active",
    propertyType: raw.propertyType || "",
    listingDate,
    priceHistory: Array.isArray(raw.priceHistory) ? raw.priceHistory : [],
    desc: raw.desc || raw.description || "",
    listingOffice: raw.listingOffice || "",
    listingAgent: raw.listingAgent || "",
    mlsSourceName: raw.mlsSourceName || "",
    asOf: raw.asOf || listingDate,
    sourceUrl: raw.sourceUrl || "",
    lastUpdated: raw.lastUpdated || raw.asOf || new Date().toISOString(),
    providerUpdatedAt: raw.providerUpdatedAt || raw.lastUpdated || raw.asOf || null,
    firstSeenAt: raw.firstSeenAt || null,
    lastSeenAt: raw.lastSeenAt || null,
    lastSeenSyncId: raw.lastSeenSyncId || null,
    absentStreak: Number.isFinite(Number(raw.absentStreak)) ? Number(raw.absentStreak) : 0,
    offMarketAt: raw.offMarketAt || null,
    statusHistory: Array.isArray(raw.statusHistory) ? raw.statusHistory : [],
    streetView: raw.streetView && typeof raw.streetView === "object" ? raw.streetView : null,
    imageSource: raw.imageSource && raw.imageSource !== "street_view" ? raw.imageSource : raw.imageSource || "",
    hasListingPhotos: raw.hasListingPhotos,
    streetViewAvailable: raw.streetViewAvailable,
    streetViewPanoId: raw.streetViewPanoId || (raw.streetView && raw.streetView.panoId) || "",
    primaryImageSource: raw.primaryImageSource || "",
    views: Number(raw.views) || 0,
    shopClicks: Number(raw.shopClicks) || 0,
    roomPreviewClicks: Number(raw.roomPreviewClicks) || 0,
    affiliateClicks: Number(raw.affiliateClicks) || 0,
    attributedRevenue: Number(raw.attributedRevenue) || 0,
    publicRecords: Array.isArray(raw.publicRecords) ? raw.publicRecords : [],
    entityKind: raw.entityKind || null,
  };
}

function completenessHint(listing) {
  return (
    (listing.listPrice > 0 ? 2 : 0) +
    (listing.image ? 2 : 0) +
    (listing.beds ? 1 : 0) +
    (listing.sqft ? 1 : 0) +
    (listing.source === "reso" || listing.source === "idx" ? 3 : listing.source === "hud" ? 2 : 0)
  );
}

function upsertListings(existing = [], incoming = []) {
  const map = new Map();
  const byAddr = new Map();
  function rememberAddr(key, listing) {
    const addrKey = addressDedupeKey(listing);
    if (addrKey) byAddr.set(addrKey, key);
  }
  for (const row of existing) {
    const n = normalizeListing(row);
    const key = listingDedupeKey(n);
    map.set(key, n);
    rememberAddr(key, n);
  }
  for (const row of incoming) {
    const n = normalizeListing(row);
    const key = listingDedupeKey(n);
    const prev = map.get(key);
    const addrKey = addressDedupeKey(n);
    const addrOwnerKey = addrKey ? byAddr.get(addrKey) : null;
    if (addrOwnerKey && addrOwnerKey !== key && map.get(addrOwnerKey) && map.get(addrOwnerKey).source !== n.source) {
      const other = map.get(addrOwnerKey);
      if (completenessHint(n) > completenessHint(other)) {
        n.alternateSources = Array.from(new Set([...(other.alternateSources || []), other.source]));
        map.delete(addrOwnerKey);
        map.set(key, { ...n, firstSeenAt: other.firstSeenAt || n.firstSeenAt || new Date().toISOString() });
        rememberAddr(key, n);
      } else {
        other.alternateSources = Array.from(new Set([...(other.alternateSources || []), n.source]));
      }
      continue;
    }
    if (!prev) {
      map.set(key, { ...n, firstSeenAt: n.firstSeenAt || new Date().toISOString() });
      rememberAddr(key, n);
      continue;
    }
    map.set(key, {
      ...prev,
      ...n,
      id: prev.id || n.id,
      firstSeenAt: prev.firstSeenAt || n.firstSeenAt || new Date().toISOString(),
      lastSeenAt: n.lastSeenAt || prev.lastSeenAt,
      views: prev.views || 0,
      shopClicks: prev.shopClicks || 0,
      roomPreviewClicks: prev.roomPreviewClicks || 0,
      affiliateClicks: prev.affiliateClicks || 0,
      attributedRevenue: prev.attributedRevenue || 0,
      priceHistory: mergePriceHistory(prev.priceHistory, n.priceHistory, prev.listPrice, n.listPrice),
      statusHistory: mergeStatusHistory(prev.statusHistory, prev.status, n.status),
    });
    rememberAddr(key, n);
  }
  return [...map.values()];
}

function mergeStatusHistory(prevHist, prevStatus, nextStatus) {
  const hist = [...(prevHist || [])];
  if (nextStatus && prevStatus && String(prevStatus) !== String(nextStatus)) {
    hist.push({
      from: prevStatus,
      to: nextStatus,
      at: new Date().toISOString(),
    });
  }
  return hist.slice(-40);
}

function mergePriceHistory(prevHist, nextHist, prevPrice, nextPrice) {
  const hist = [...(prevHist || []), ...(nextHist || [])];
  if (prevPrice && nextPrice && Number(prevPrice) !== Number(nextPrice)) {
    hist.push({
      price: Number(nextPrice),
      at: new Date().toISOString(),
      previous: Number(prevPrice),
    });
  }
  return hist.slice(-20);
}

module.exports = {
  normalizeListing,
  upsertListings,
  listingDedupeKey,
  addressDedupeKey,
  numberOr,
  mergePriceHistory,
  mergeStatusHistory,
  inferListingKind,
  emptyMonetization,
};
