"use strict";

const { userError } = require("./constants");

function createListingsService({ store, provider }) {
  let pendingSync = null;

  async function sync() {
    const { listings } = await provider.fetchListings();
    return store.write(listings);
  }

  async function ensureSynced() {
    if (store.read().syncedAt) return;
    pendingSync = pendingSync || sync().finally(() => (pendingSync = null));
    await pendingSync;
  }

  const SORTABLE = {
    price_asc: (a, b) => a.listPrice - b.listPrice,
    price_desc: (a, b) => b.listPrice - a.listPrice,
    beds_desc: (a, b) => b.beds - a.beds,
    newest: (a, b) => new Date(b.asOf || 0) - new Date(a.asOf || 0),
  };
  const MAX_LIMIT = 100;

  async function list({ status, minBeds, maxPrice, q, sort, limit, offset } = {}) {
    await ensureSynced();
    const db = store.read();
    let listings = db.listings;
    if (status) listings = listings.filter((l) => l.status === status);
    if (minBeds) listings = listings.filter((l) => l.beds >= Number(minBeds));
    if (maxPrice) listings = listings.filter((l) => l.listPrice <= Number(maxPrice));
    if (q) {
      const needle = String(q).trim().toLowerCase();
      listings = listings.filter(
        (l) => l.location.toLowerCase().includes(needle) || l.title.toLowerCase().includes(needle)
      );
    }

    const total = listings.length;
    const comparator = SORTABLE[sort];
    if (comparator) listings = [...listings].sort(comparator);

    const safeLimit = Math.min(Number(limit) || 20, MAX_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const page = listings.slice(safeOffset, safeOffset + safeLimit);

    return { listings: page, total, limit: safeLimit, offset: safeOffset, syncedAt: db.syncedAt, provider: provider.name };
  }

  async function get(id) {
    await ensureSynced();
    const db = store.read();
    const listing = db.listings.find((l) => l.id === id);
    if (!listing) throw userError("LISTING_NOT_FOUND");
    return listing;
  }

  return { sync, list, get };
}

module.exports = { createListingsService };
