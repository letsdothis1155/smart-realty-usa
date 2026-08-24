"use strict";

const { LISTING_STATUS, SYNC_DEFAULTS, userError } = require("./constants");
const {
  attachPublicRecords,
  canView3D,
  entityKind,
  isPrimaryHomeResult,
  isResidentialListing,
} = require("./entity");
const { matchesFilters, parseSearchQuery, rankListings, sortListings } = require("./search-query");
const { createPropertySyncJob } = require("./sync-job");
const { createLocationCatalog, slugify } = require("./locations");
const { decorateWithScore } = require("./score");
const {
  imagePresentation,
  applyStreetViewFallback,
  buildStreetViewStaticUrl,
  propertyLocationQuery,
  createStreetViewQuota,
  STREET_VIEW_DEFAULTS,
} = require("./street-view");

function decorateListing(listing) {
  const kind = entityKind(listing);
  const hist = Array.isArray(listing.priceHistory) ? listing.priceHistory : [];
  const previousPrice = listing.previousPrice || (hist.length ? hist[hist.length - 1].previous || hist[hist.length - 1].price : null);
  const priceChange =
    listing.priceChange != null
      ? listing.priceChange
      : previousPrice && listing.listPrice
        ? Number(listing.listPrice) - Number(previousPrice)
        : 0;
  const listedMs = Date.parse(listing.listingDate || listing.firstSeenAt || 0);
  const listingAgeMs = Date.now() - listedMs;
  const isNew = Number.isFinite(listingAgeMs) && listingAgeMs >= 0 && listingAgeMs <= 7 * 86400000;
  const daysOnMarket = Number.isFinite(listingAgeMs) && listingAgeMs >= 0 ? Math.floor(listingAgeMs / 86400000) : null;
  return {
    ...listing,
    entityKind: kind,
    daysOnMarket,
    listingKind: listing.listingKind || (listing.source === "court" ? "public_record" : "active_listing"),
    canView3D: canView3D(listing),
    publicRecords: Array.isArray(listing.publicRecords) ? listing.publicRecords : [],
    previousPrice: previousPrice || null,
    priceChange,
    priceReduced: priceChange < 0,
    isNew,
    citySlug: listing.city && listing.state ? slugify([listing.city, listing.state]) : "",
    ...imagePresentation(listing),
  };
}

function createListingsService({ store, provider, syncOptions = {}, catalog } = {}) {
  let pendingSync = null;
  const locations = catalog || createLocationCatalog();
  const streetViewKey = syncOptions.streetViewKey || "";
  const streetViewQuota = createStreetViewQuota({
    staticLimit: syncOptions.streetViewStaticBudget || STREET_VIEW_DEFAULTS.staticBudgetPerHour,
  });
  const job = createPropertySyncJob({
    store,
    provider,
    streetViewKey,
    fetchImpl: syncOptions.fetchImpl,
    absentStreakLimit: syncOptions.absentStreakLimit || SYNC_DEFAULTS.absentStreakLimit,
    providerTimeoutMs: syncOptions.providerTimeoutMs || SYNC_DEFAULTS.providerTimeoutMs,
    intervalMs: syncOptions.intervalMs || SYNC_DEFAULTS.intervalMs,
    streetViewMetadataBudget:
      syncOptions.streetViewMetadataBudget || SYNC_DEFAULTS.streetViewMetadataBudgetPerSync,
  });

  async function sync(opts = {}) {
    const result = await job.run({ trigger: opts.trigger || "manual" });
    if (!result.skipped && opts.onAfterSync) {
      try {
        result.alerts = await opts.onAfterSync(store.read().listings || []);
      } catch (err) {
        result.alertError = err.message;
      }
    }
    return result;
  }

  async function ensureSynced() {
    if (store.read().syncedAt) return;
    pendingSync = pendingSync || sync().finally(() => (pendingSync = null));
    await pendingSync;
  }

  const MAX_LIMIT = 40;

  async function list(query = {}) {
    await ensureSynced();
    const db = store.read();
    const parsed = parseSearchQuery(query.q || "", {
      minBeds: query.minBeds,
      minBaths: query.minBaths,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      propertyType: query.propertyType,
      minSqft: query.minSqft,
      maxSqft: query.maxSqft,
      city: query.city,
      exactCity: query.exactCity === true || query.exactCity === "1",
      sort: query.sort,
      status: query.status || LISTING_STATUS.ACTIVE,
      lat: query.lat,
      lng: query.lng,
      userLat: query.userLat,
      userLng: query.userLng,
      neighborhood: query.neighborhood,
      radiusMiles: query.radiusMiles,
      listedWithinDays: query.listedWithinDays || query.listedWithin,
      west: query.west,
      south: query.south,
      east: query.east,
      north: query.north,
      listingKind: query.listingKind || "active_listing",
    });

    const incoming = (db.listings || []).map(decorateListing);
    const homes = [];
    const records = [];
    for (const listing of incoming) {
      if (listing.entityKind === "office" || listing.entityKind === "government") continue;
      if (listing.entityKind === "public_record") {
        records.push(listing);
        continue;
      }
      if (!isResidentialListing(listing)) continue;
      homes.push(listing);
    }
    attachPublicRecords(homes, records);
    locations.indexListings(homes);
    const scored = homes.map((h) => decorateWithScore(h, homes));

    let listings = scored.filter((l) => isPrimaryHomeResult(l) && matchesFilters(l, parsed));
    if (query.deal === "any") {
      listings = listings.filter((l) => (l.deals || []).length);
    } else if (query.deal) {
      listings = listings.filter((l) => (l.deals || []).some((d) => d.id === query.deal));
    }
    listings = rankListings(listings, parsed);
    if (parsed.sort && parsed.sort !== "featured" && parsed.sort !== "relevance") {
      listings = sortListings(listings, parsed.sort);
    }

    const total = listings.length;
    const safeLimit = Math.min(Number(query.limit) || 20, MAX_LIMIT);
    const safeOffset = Math.max(Number(query.offset) || 0, 0);
    const page = listings.slice(safeOffset, safeOffset + safeLimit);

    return {
      listings: page,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + page.length < total,
      parsedQuery: parsed,
      syncedAt: db.syncedAt,
      provider: provider.name,
      counts: db.counts || null,
    };
  }

  async function deals(query = {}) {
    const data = await list({ ...query, deal: query.deal || "any", limit: query.limit || 24, status: LISTING_STATUS.ACTIVE });
    const groups = {};
    for (const listing of data.listings) {
      for (const flag of listing.deals || []) {
        if (!groups[flag.id]) groups[flag.id] = { id: flag.id, label: flag.label, listings: [] };
        if (groups[flag.id].listings.length < 8) groups[flag.id].listings.push(listing);
      }
    }
    return { ...data, groups: Object.values(groups) };
  }

  async function get(id) {
    await ensureSynced();
    const db = store.read();
    const all = (db.listings || []).map(decorateListing);
    const listing = all.find((l) => l.id === id);
    if (!listing || listing.entityKind === "office") throw userError("LISTING_NOT_FOUND");
    return decorateWithScore(listing, all);
  }

  function syncStatus() {
    return job.status();
  }

  async function coverage() {
    await ensureSynced();
    const db = store.read();
    const homes = (db.listings || [])
      .map(decorateListing)
      .filter((l) => l.entityKind === "home" && l.listingKind !== "public_record");
    const cities = {};
    const states = {};
    let withPhotos = 0;
    let with3d = 0;
    let newToday = 0;
    let updatedToday = 0;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const startMs = start.getTime();
    for (const row of homes) {
      const slug = row.citySlug || slugify([row.city, row.state]);
      if (row.city && row.state) {
        if (!cities[slug]) {
          cities[slug] = {
            slug,
            city: row.city,
            state: row.state,
            count: 0,
            active: 0,
          };
        }
        cities[slug].count += 1;
        if (row.status === LISTING_STATUS.ACTIVE) cities[slug].active += 1;
      }
      if (row.state) states[row.state] = (states[row.state] || 0) + 1;
      if (row.image || (row.images && row.images.length)) withPhotos += 1;
      if (row.canView3D) with3d += 1;
      if (Date.parse(row.firstSeenAt || 0) >= startMs) newToday += 1;
      if (Date.parse(row.lastUpdated || row.providerUpdatedAt || 0) >= startMs) updatedToday += 1;
    }
    return {
      total: homes.length,
      active: homes.filter((h) => h.status === LISTING_STATUS.ACTIVE).length,
      citiesCovered: Object.keys(cities).length,
      statesCovered: Object.keys(states).length,
      newToday,
      updatedToday,
      withPhotos,
      with3d,
      cities: Object.values(cities).sort((a, b) => b.count - a.count),
      states,
      provider: provider.name,
      syncedAt: db.syncedAt,
      providerErrors: (db.syncRuns || []).slice(-1)[0]?.metrics?.providerErrors || [],
      duplicatesRemoved: (db.syncRuns || []).slice(-1)[0]?.metrics?.duplicatesSkipped || 0,
    };
  }

  async function cityPage(slug) {
    const place = locations.getBySlug(slug);
    const q = place ? `${place.name} ${place.state}` : String(slug || "").replace(/-/g, " ");
    const data = await list({ q, status: LISTING_STATUS.ACTIVE, limit: 24, sort: "newest", exactCity: true });
    const types = {};
    const neighborhoods = {};
    let min = Infinity;
    let max = 0;
    for (const row of data.listings) {
      const t = row.propertyType || "Other";
      types[t] = (types[t] || 0) + 1;
      if (row.neighborhood) neighborhoods[row.neighborhood] = (neighborhoods[row.neighborhood] || 0) + 1;
      if (row.listPrice > 0) {
        min = Math.min(min, row.listPrice);
        max = Math.max(max, row.listPrice);
      }
    }
    return {
      place: place || { name: q, slug, state: "" },
      total: data.total,
      listings: data.listings,
      types,
      neighborhoods,
      priceMin: Number.isFinite(min) ? min : 0,
      priceMax: max,
      with3d: data.listings.filter((l) => l.canView3D).length,
      priceReduced: data.listings.filter((l) => l.priceReduced).length,
      newest: data.listings.slice(0, 8),
    };
  }

  async function streetViewImage(id) {
    const listing = await get(id);
    if (listing.hasListingPhotos) {
      const err = new Error("Listing already has a photo");
      err.status = 404;
      err.expose = true;
      throw err;
    }
    if (!isEligibleListing(listing)) {
      const err = new Error("Street View is not available for this property");
      err.status = 404;
      err.expose = true;
      throw err;
    }
    if (!streetViewKey) {
      const err = new Error("Street View is not configured");
      err.status = 503;
      err.expose = true;
      throw err;
    }
    if (!streetViewQuota.tryConsume()) {
      const err = new Error("Street View quota reached");
      err.status = 429;
      err.expose = true;
      throw err;
    }
    let sv = listing.streetView || {};
    if (!sv.available || !sv.panoId) {
      if (sv.status === "ZERO_RESULTS") {
        const err = new Error("No Street View imagery");
        err.status = 404;
        err.expose = true;
        throw err;
      }
      const applied = await applyStreetViewFallback(listing, {
        key: streetViewKey,
        fetchImpl: syncOptions.fetchImpl,
        budget: { remaining: 1 },
      });
      sv = applied.listing.streetView || {};
      if (applied.requested) {
        const db = store.read();
        const next = (db.listings || []).map((row) => (row.id === listing.id ? { ...row, streetView: sv } : row));
        store.replaceState({ ...db, listings: next });
      }
    }
    if (!sv.available) {
      const err = new Error("No Street View imagery");
      err.status = 404;
      err.expose = true;
      throw err;
    }
    const loc = propertyLocationQuery(listing);
    const url = buildStreetViewStaticUrl({
      panoId: sv.panoId,
      heading: sv.heading,
      key: streetViewKey,
      locationQuery: loc && loc.query,
    });
    const fetchFn = syncOptions.fetchImpl || fetch;
    const res = await fetchFn(url);
    if (!res.ok) {
      const err = new Error("Street View image unavailable");
      err.status = 502;
      err.expose = true;
      throw err;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      bytes,
      contentType: res.headers.get("content-type") || "image/jpeg",
      heading: sv.heading,
      panoId: sv.panoId,
      attribution: sv.copyright || "© Google",
    };
  }

  function isEligibleListing(listing) {
    return listing && listing.entityKind === "home" && listing.listingKind !== "public_record";
  }

  return { sync, list, get, deals, coverage, cityPage, locations, syncStatus, job, streetViewImage };
}

module.exports = { createListingsService, decorateListing };
