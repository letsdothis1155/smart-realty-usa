"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore } = require("../listings/store");
const { createPropertySyncJob } = require("../listings/sync-job");
const { createListingsService } = require("../listings/service");
const { LISTING_STATUS } = require("../listings/constants");
const { shouldRecheckStreetView, applyStreetViewFallback } = require("../listings/street-view");

function listing(partial) {
  return {
    id: "p1",
    source: "mock",
    providerListingId: "p1",
    mlsNumber: "p1",
    address: "100 Main St",
    title: "100 Main St",
    city: "Greensboro",
    state: "NC",
    postalCode: "27407",
    listPrice: 200000,
    beds: 3,
    baths: 2,
    sqft: 1400,
    status: LISTING_STATUS.ACTIVE,
    propertyType: "Single Family",
    images: ["https://example.test/a.jpg"],
    image: "https://example.test/a.jpg",
    latitude: 36.07,
    longitude: -79.79,
    ...partial,
  };
}

function providerFrom(rows, extras = {}) {
  return {
    name: extras.name || "mock",
    async fetchListings() {
      if (extras.fail) throw new Error("provider down");
      return { listings: typeof rows === "function" ? rows() : rows, complete: extras.complete !== false };
    },
  };
}

test("new listing from provider appears in active search", async () => {
  const store = createStore({ memory: true });
  const job = createPropertySyncJob({ store, provider: providerFrom([listing()]) });
  const result = await job.run({ trigger: "test" });
  assert.equal(result.propertiesAdded, 1);
  const service = createListingsService({ store, provider: providerFrom([listing()]) });
  const { listings } = await service.list();
  assert.equal(listings.length, 1);
  assert.equal(listings[0].title, "100 Main St");
});

test("price change updates the same record and writes priceHistory", async () => {
  const store = createStore({ memory: true });
  let price = 200000;
  const provider = providerFrom(() => [listing({ listPrice: price })]);
  const job = createPropertySyncJob({ store, provider });
  await job.run();
  price = 185000;
  const second = await job.run();
  assert.equal(second.propertiesAdded, 0);
  assert.ok(second.propertiesUpdated >= 1);
  assert.equal(second.priceChanges, 1);
  const row = store.read().listings[0];
  assert.equal(row.listPrice, 185000);
  assert.ok(row.priceHistory.some((h) => h.price === 185000));
  assert.equal(store.read().listings.length, 1);
});

test("explicit sold is removed from active search but kept historically", async () => {
  const store = createStore({ memory: true });
  let status = LISTING_STATUS.ACTIVE;
  const job = createPropertySyncJob({
    store,
    provider: providerFrom(() => [listing({ status })]),
  });
  await job.run();
  status = LISTING_STATUS.SOLD;
  const sold = await job.run();
  assert.equal(sold.propertiesDeactivated, 1);
  const service = createListingsService({
    store,
    provider: providerFrom(() => [listing({ status: LISTING_STATUS.SOLD })]),
  });
  const { listings: active } = await service.list();
  assert.equal(active.length, 0);
  const { listings: all } = await service.list({ status: "all" });
  assert.equal(all.length, 1);
  assert.equal(all[0].status, LISTING_STATUS.SOLD);
  assert.ok(all[0].offMarketAt);
  assert.ok(all[0].statusHistory.length);
});

test("one failed provider does not mass-deactivate existing homes", async () => {
  const store = createStore({ memory: true });
  const ok = createPropertySyncJob({ store, provider: providerFrom([listing()]) });
  await ok.run();
  const down = createPropertySyncJob({ store, provider: providerFrom([], { fail: true }) });
  const result = await down.run();
  assert.equal(result.propertiesDeactivated, 0);
  assert.equal(store.read().listings[0].status, LISTING_STATUS.ACTIVE);
});

test("missing from a successful complete feed uses a grace streak before removal", async () => {
  const store = createStore({ memory: true });
  let rows = [listing()];
  const job = createPropertySyncJob({
    store,
    provider: providerFrom(() => rows),
    absentStreakLimit: 3,
  });
  await job.run();
  rows = [];
  await job.run();
  await job.run();
  assert.equal(store.read().listings[0].status, LISTING_STATUS.ACTIVE);
  assert.equal(store.read().listings[0].absentStreak, 2);
  const third = await job.run();
  assert.equal(third.propertiesDeactivated, 1);
  assert.equal(store.read().listings[0].status, LISTING_STATUS.REMOVED);
  const service = createListingsService({ store, provider: providerFrom([]) });
  const { listings } = await service.list();
  assert.equal(listings.length, 0);
});

test("duplicate provider rows collapse to one property", async () => {
  const store = createStore({ memory: true });
  const job = createPropertySyncJob({
    store,
    provider: providerFrom([listing(), listing({ title: "100 Main Street" })]),
  });
  const result = await job.run();
  assert.equal(store.read().listings.length, 1);
  assert.equal(result.propertiesAdded, 1);
  assert.ok(result.duplicatesSkipped >= 1);
});

test("the same address from different providers collapses to one property", async () => {
  const store = createStore({ memory: true });
  const provider = {
    name: "public",
    async fetchBatches() {
      return [
        {
          provider: "mock",
          ok: true,
          complete: true,
          listings: [listing({ id: "mock-a", providerListingId: "mock-a", source: "mock" })],
        },
        {
          provider: "hud",
          ok: true,
          complete: true,
          listings: [listing({ id: "hud-b", providerListingId: "hud-b", source: "hud" })],
        },
      ];
    },
  };
  const job = createPropertySyncJob({ store, provider });
  const result = await job.run();
  assert.equal(store.read().listings.length, 1);
  assert.ok(result.duplicatesSkipped >= 1);
  assert.equal(store.read().listings[0].source, "hud");
  assert.deepEqual(store.read().listings[0].alternateSources, ["mock"]);

  const service = createListingsService({ store, provider });
  const { listings } = await service.list();
  assert.equal(listings.length, 1);
});

test("courthouse is never stored as the house address", async () => {
  const { isPrimaryHomeResult } = require("../listings/entity");
  const store = createStore({ memory: true });
  const job = createPropertySyncJob({
    store,
    provider: providerFrom([
      listing({
        id: "gov1",
        providerListingId: "gov1",
        mlsNumber: "gov1",
        address: "531 Court Place",
        title: "Jefferson County Courthouse",
        propertyType: "Courthouse",
      }),
    ]),
  });
  await job.run();
  const service = createListingsService({
    store,
    provider: providerFrom([]),
  });
  const { listings } = await service.list();
  assert.ok(listings.every((l) => isPrimaryHomeResult(l)));
  assert.ok(!listings.some((l) => /courthouse/i.test(l.title)));
});

test("street view is not requested when listing photos exist", async () => {
  const listingWithPhoto = listing();
  assert.equal(shouldRecheckStreetView(listingWithPhoto), false);
  const applied = await applyStreetViewFallback(listingWithPhoto, {
    key: "fake",
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(applied.requested, false);
  assert.equal(applied.listing.image, listingWithPhoto.image);
});

test("lock prevents overlapping sync runs", async () => {
  const store = createStore({ memory: true });
  const job = createPropertySyncJob({ store, provider: providerFrom([listing()]) });
  assert.equal(store.tryLock(), true);
  const skipped = await job.run();
  assert.equal(skipped.skipped, true);
  store.unlock();
});
