"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreListing, dealFlags, decorateWithScore } = require("../listings/score");
const { LISTING_STATUS } = require("../listings/constants");
const { createStore } = require("../listings/store");
const { createListingsService } = require("../listings/service");
const { createPropertySyncJob } = require("../listings/sync-job");

function home(partial) {
  return {
    id: "a",
    title: "12 Oak St",
    address: "12 Oak St",
    city: "Greensboro",
    state: "NC",
    listPrice: 200000,
    sqft: 2000,
    beds: 3,
    baths: 2,
    status: LISTING_STATUS.ACTIVE,
    listingDate: new Date(Date.now() - 10 * 86400000).toISOString(),
    image: "https://example.test/a.jpg",
    images: ["https://example.test/a.jpg"],
    latitude: 36.07,
    longitude: -79.79,
    ...partial,
  };
}

test("Smart Realty Score is 0-100 and explains itself", () => {
  const a = home();
  const b = home({ id: "b", title: "14 Oak St", listPrice: 260000 });
  const scored = scoreListing(a, [a, b]);
  assert.ok(scored.score >= 0 && scored.score <= 100);
  assert.ok(scored.reasons.length >= 3);
  assert.match(scored.disclaimer, /not an appraisal/i);
});

test("Deal Finder flags recent reductions and long DOM", () => {
  const listing = home({
    priceHistory: [{ previous: 230000, price: 200000, at: new Date().toISOString() }],
    listingDate: new Date(Date.now() - 80 * 86400000).toISOString(),
    desc: "Sold as-is, needs work",
  });
  const neighbor = home({ id: "n", listPrice: 280000, sqft: 2000 });
  const flags = dealFlags(listing, [listing, neighbor]).map((f) => f.id);
  assert.ok(flags.includes("recently_reduced"));
  assert.ok(flags.includes("long_dom"));
  assert.ok(flags.includes("potential_fixer"));
  assert.ok(flags.includes("below_nearby_ppsf"));
});

test("deals API groups catalog signals", async () => {
  const store = createStore({ memory: true });
  const listing = home({
    id: "deal1",
    providerListingId: "deal1",
    mlsNumber: "deal1",
    source: "mock",
    priceHistory: [{ previous: 250000, price: 200000, at: new Date().toISOString() }],
  });
  const job = createPropertySyncJob({
    store,
    provider: { name: "mock", fetchListings: async () => ({ listings: [listing], complete: true }) },
  });
  await job.run();
  const service = createListingsService({
    store,
    provider: { name: "mock", fetchListings: async () => ({ listings: [listing], complete: true }) },
  });
  const data = await service.deals();
  assert.ok(data.groups.some((g) => g.id === "recently_reduced"));
});
