"use strict";

const crypto = require("node:crypto");
const {
  EXPLICIT_INACTIVE_STATUSES,
  LISTING_STATUS,
  SYNC_DEFAULTS,
} = require("./constants");
const {
  listingDedupeKey,
  mergePriceHistory,
  mergeStatusHistory,
  normalizeListing,
  upsertListings,
} = require("./normalize");
const { applyStreetViewFallback } = require("./street-view");
const { auditListings } = require("./quality-audit");
const { isGovernmentPrimary, isHiddenOffice, isResidentialListing } = require("./entity");

function isInactiveStatus(status) {
  return EXPLICIT_INACTIVE_STATUSES.has(String(status || "").toLowerCase());
}

function computeCounts(listings) {
  const cities = {};
  const states = {};
  const zips = {};
  let active = 0;
  for (const row of listings) {
    if (String(row.status || "") === LISTING_STATUS.ACTIVE) {
      active += 1;
      const city = String(row.city || "").trim();
      const state = String(row.state || "").trim();
      const zip = String(row.postalCode || "").trim();
      if (city) cities[city] = (cities[city] || 0) + 1;
      if (state) states[state] = (states[state] || 0) + 1;
      if (zip) zips[zip] = (zips[zip] || 0) + 1;
    }
  }
  return { cities, states, zips, active, total: listings.length };
}

function withTimeout(promise, ms, label) {
  if (!ms) return promise;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label || "provider"} timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function emptyMetrics() {
  return {
    recordsReceived: 0,
    rejectedNonResidential: 0,
    propertiesAdded: 0,
    propertiesUpdated: 0,
    propertiesDeactivated: 0,
    duplicatesSkipped: 0,
    priceChanges: 0,
    streetViewChecked: 0,
    providersChecked: [],
    providerErrors: [],
  };
}

function createPropertySyncJob({
  store,
  provider,
  streetViewKey = "",
  fetchImpl,
  streetViewMetadataBudget = SYNC_DEFAULTS.streetViewMetadataBudgetPerSync,
  absentStreakLimit = SYNC_DEFAULTS.absentStreakLimit,
  providerTimeoutMs = SYNC_DEFAULTS.providerTimeoutMs,
  intervalMs = SYNC_DEFAULTS.intervalMs,
} = {}) {
  async function fetchBatches(opts) {
    if (typeof provider.fetchBatches === "function") {
      return withTimeout(provider.fetchBatches(opts), providerTimeoutMs, provider.name);
    }
    const result = await withTimeout(provider.fetchListings(opts), providerTimeoutMs, provider.name);
    return [
      {
        provider: provider.name || "provider",
        ok: true,
        complete: result.complete !== false,
        listings: result.listings || [],
      },
    ];
  }

  async function run({ trigger = "hourly" } = {}) {
    if (!store.tryLock()) {
      return { skipped: true, reason: "locked", trigger };
    }
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const syncId = crypto.randomUUID();
    const metrics = emptyMetrics();
    const db = store.read();
    const byKey = new Map();
    for (const row of db.listings || []) {
      const n = normalizeListing(row);
      byKey.set(listingDedupeKey(n), n);
    }

    try {
      const batches = await fetchBatches({
        modifiedSince: (db.providerCursors && db.providerCursors[provider.name || "default"]?.lastSuccessfulSyncAt) || null,
      });
      const successful = new Set();
      const incomingByProvider = new Map();

      for (const batch of batches) {
        metrics.providersChecked.push(batch.provider);
        if (!batch.ok) {
          metrics.providerErrors.push({ provider: batch.provider, error: batch.error || "failed" });
          continue;
        }
        successful.add(batch.provider);
        const rows = [];
        const seenKeys = new Set();
        for (const raw of batch.listings || []) {
          metrics.recordsReceived += 1;
          const n = normalizeListing(raw);
          n.source = n.source || batch.provider;
          if (isHiddenOffice(n) || isGovernmentPrimary(n) || !isResidentialListing(n)) {
            metrics.rejectedNonResidential += 1;
            continue;
          }
          const key = listingDedupeKey(n);
          if (seenKeys.has(key)) {
            metrics.duplicatesSkipped += 1;
            continue;
          }
          seenKeys.add(key);
          rows.push({ key, listing: n });
        }
        incomingByProvider.set(batch.provider, { rows, complete: batch.complete !== false });
      }

      for (const [prov, pack] of incomingByProvider) {
        const rows = pack.rows;
        const incomingKeys = new Set();
        for (const { key, listing } of rows) {
          incomingKeys.add(key);
          const prev = byKey.get(key);
          const nowIso = new Date().toISOString();
          if (!prev) {
            byKey.set(key, {
              ...listing,
              firstSeenAt: listing.firstSeenAt || nowIso,
              lastSeenAt: nowIso,
              lastSeenSyncId: syncId,
              absentStreak: 0,
              statusHistory: listing.status
                ? [{ from: null, to: listing.status, at: nowIso }]
                : [],
            });
            metrics.propertiesAdded += 1;
            continue;
          }
          const nextStatus = isInactiveStatus(listing.status) ? listing.status : listing.status || prev.status;
          const changed =
            Number(prev.listPrice) !== Number(listing.listPrice) ||
            prev.status !== nextStatus ||
            prev.beds !== listing.beds ||
            prev.baths !== listing.baths ||
            prev.sqft !== listing.sqft ||
            prev.desc !== listing.desc ||
            JSON.stringify(prev.images || []) !== JSON.stringify(listing.images || []);
          if (Number(prev.listPrice) !== Number(listing.listPrice) && listing.listPrice) {
            metrics.priceChanges += 1;
          }
          if (changed) metrics.propertiesUpdated += 1;
          const deactivated = !isInactiveStatus(prev.status) && isInactiveStatus(nextStatus);
          byKey.set(key, {
            ...prev,
            ...listing,
            id: prev.id || listing.id,
            status: nextStatus,
            firstSeenAt: prev.firstSeenAt || nowIso,
            lastSeenAt: nowIso,
            lastSeenSyncId: syncId,
            absentStreak: 0,
            offMarketAt: deactivated ? nowIso : prev.offMarketAt,
            views: prev.views || 0,
            shopClicks: prev.shopClicks || 0,
            roomPreviewClicks: prev.roomPreviewClicks || 0,
            affiliateClicks: prev.affiliateClicks || 0,
            attributedRevenue: prev.attributedRevenue || 0,
            priceHistory: mergePriceHistory(prev.priceHistory, listing.priceHistory, prev.listPrice, listing.listPrice),
            statusHistory: mergeStatusHistory(prev.statusHistory, prev.status, nextStatus),
          });
          if (deactivated) metrics.propertiesDeactivated += 1;
        }

        if (!pack.complete) continue;
        for (const [key, prev] of byKey) {
          if ((prev.source || provider.name) !== prov) continue;
          if (incomingKeys.has(key)) continue;
          if (isInactiveStatus(prev.status)) continue;
          const streak = (prev.absentStreak || 0) + 1;
          const nowIso = new Date().toISOString();
          if (streak >= absentStreakLimit) {
            byKey.set(key, {
              ...prev,
              status: LISTING_STATUS.REMOVED,
              absentStreak: streak,
              offMarketAt: nowIso,
              lastUpdated: nowIso,
              statusHistory: mergeStatusHistory(prev.statusHistory, prev.status, LISTING_STATUS.REMOVED),
            });
            metrics.propertiesDeactivated += 1;
          } else {
            byKey.set(key, { ...prev, absentStreak: streak });
          }
        }
      }

      const beforeCrossProviderDedupe = byKey.size;
      let listings = upsertListings([], [...byKey.values()]);
      const crossProviderDuplicates = Math.max(0, beforeCrossProviderDedupe - listings.length);
      metrics.duplicatesSkipped += crossProviderDuplicates;
      metrics.propertiesAdded = Math.max(0, metrics.propertiesAdded - crossProviderDuplicates);
      const svBudget = { remaining: Number(streetViewMetadataBudget) || 0 };
      for (let i = 0; i < listings.length; i++) {
        const row = listings[i];
        if (String(row.status) !== LISTING_STATUS.ACTIVE) continue;
        const applied = await applyStreetViewFallback(row, {
          key: streetViewKey,
          fetchImpl,
          budget: svBudget,
        });
        if (applied.requested) metrics.streetViewChecked += 1;
        listings[i] = applied.listing;
      }

      const audit = auditListings(listings);
      const finishedAt = new Date().toISOString();
      const counts = computeCounts(listings);
      const cursors = { ...(db.providerCursors || {}) };
      for (const name of successful) {
        cursors[name] = {
          lastSuccessfulSyncAt: finishedAt,
          lastError: null,
        };
      }
      for (const err of metrics.providerErrors) {
        cursors[err.provider] = {
          ...(cursors[err.provider] || {}),
          lastError: err.error,
        };
      }
      const run = {
        id: syncId,
        startedAt,
        finishedAt,
        status: metrics.providerErrors.length && successful.size === 0 ? "error" : metrics.providerErrors.length ? "partial" : "ok",
        trigger,
        durationMs: Date.now() - started,
        providersChecked: metrics.providersChecked,
        recordsReceived: metrics.recordsReceived,
        propertiesAdded: metrics.propertiesAdded,
        propertiesUpdated: metrics.propertiesUpdated,
        propertiesDeactivated: metrics.propertiesDeactivated,
        duplicatesSkipped: metrics.duplicatesSkipped,
        priceChanges: metrics.priceChanges,
        streetViewChecked: metrics.streetViewChecked,
        quality: { checked: audit.checked, blocked: audit.blocked, warnings: audit.warnings },
        errors: metrics.providerErrors,
      };
      const runs = [run, ...(db.syncRuns || [])].slice(0, SYNC_DEFAULTS.maxRunLog);
      store.replaceState({
        listings,
        syncedAt: successful.size ? finishedAt : db.syncedAt,
        nextSyncAt: new Date(Date.now() + intervalMs).toISOString(),
        counts,
        providerCursors: cursors,
        syncRuns: runs,
        lock: null,
      });
      return { skipped: false, ...run, counts };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const run = {
        id: syncId,
        startedAt,
        finishedAt,
        status: "error",
        trigger,
        durationMs: Date.now() - started,
        providersChecked: metrics.providersChecked,
        recordsReceived: metrics.recordsReceived,
        propertiesAdded: 0,
        propertiesUpdated: 0,
        propertiesDeactivated: 0,
        duplicatesSkipped: metrics.duplicatesSkipped,
        errors: [{ provider: provider.name || "sync", error: error.message }],
      };
      const dbNow = store.read();
      store.replaceState({
        ...dbNow,
        lock: null,
        nextSyncAt: new Date(Date.now() + intervalMs).toISOString(),
        syncRuns: [run, ...(dbNow.syncRuns || [])].slice(0, SYNC_DEFAULTS.maxRunLog),
      });
      return { skipped: false, ...run };
    } finally {
      try {
        store.unlock();
      } catch {
        /* ignore */
      }
    }
  }

  function status() {
    const db = store.read();
    const last = (db.syncRuns || [])[0] || null;
    return {
      lastSuccessfulSyncAt: db.syncedAt,
      nextScheduledSyncAt: db.nextSyncAt,
      locked: !!(db.lock && db.lock.until > Date.now()),
      lastRun: last,
      counts: db.counts || computeCounts(db.listings || []),
      intervalMs,
    };
  }

  return { run, status, name: "PropertySyncJob" };
}

module.exports = { createPropertySyncJob, computeCounts, isInactiveStatus };
