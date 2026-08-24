"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { upsertListings } = require("./normalize");
const { SYNC_DEFAULTS } = require("./constants");

function emptyDb() {
  return {
    listings: [],
    syncedAt: null,
    nextSyncAt: null,
    lock: null,
    providerCursors: {},
    counts: { cities: {}, states: {}, zips: {}, active: 0, total: 0 },
    syncRuns: [],
  };
}

function createStore({ dataDir, memory = false } = {}) {
  const file = dataDir ? path.join(dataDir, "listings-cache.json") : null;
  let cache = emptyDb();

  function ensure() {
    if (memory || !file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(emptyDb(), null, 2));
    }
  }

  function persist(next) {
    cache = next;
    if (memory || !file) return next;
    ensure();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, file);
    return next;
  }

  function read() {
    if (memory || !file) return cache;
    ensure();
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      cache = {
        ...emptyDb(),
        ...data,
        listings: data.listings || [],
        providerCursors: data.providerCursors || {},
        counts: data.counts || emptyDb().counts,
        syncRuns: data.syncRuns || [],
      };
      return cache;
    } catch {
      cache = emptyDb();
      return cache;
    }
  }

  function write(listings, extra = {}) {
    const prev = read();
    const merged = upsertListings(prev.listings, listings);
    return persist({
      ...prev,
      listings: merged,
      syncedAt: extra.syncedAt || new Date().toISOString(),
      nextSyncAt: extra.nextSyncAt || prev.nextSyncAt,
      counts: extra.counts || prev.counts,
      providerCursors: extra.providerCursors || prev.providerCursors,
      lock: extra.lock !== undefined ? extra.lock : prev.lock,
      syncRuns: extra.syncRuns || prev.syncRuns,
    });
  }

  function replaceState(patch) {
    const prev = read();
    return persist({ ...prev, ...patch });
  }

  function tryLock(now = Date.now(), ttlMs = SYNC_DEFAULTS.lockTtlMs) {
    const db = read();
    if (db.lock && db.lock.until > now) return false;
    persist({
      ...db,
      lock: { until: now + ttlMs, at: new Date(now).toISOString() },
    });
    return true;
  }

  function unlock() {
    const db = read();
    persist({ ...db, lock: null });
  }

  return { read, write, replaceState, tryLock, unlock };
}

module.exports = { createStore, emptyDb };
