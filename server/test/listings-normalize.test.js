"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeListing, upsertListings, listingDedupeKey } = require("../listings/normalize");
const { createStore } = require("../listings/store");

test("firstSeenAt is stamped once and survives repeated normalization", () => {
  const first = upsertListings([], [{ source: "mock", mlsNumber: "A1", listPrice: 100 }]);
  assert.ok(first[0].firstSeenAt);

  // Re-normalizing the same stored row (as happens on every store.read())
  // must not reset firstSeenAt.
  const renormalized = normalizeListing(first[0]);
  assert.equal(renormalized.firstSeenAt, first[0].firstSeenAt);

  const second = upsertListings(first, [{ source: "mock", mlsNumber: "A1", listPrice: 110 }]);
  assert.equal(second[0].firstSeenAt, first[0].firstSeenAt);
});

test("recently_added sort reflects when a listing first appeared, not price-update time", async () => {
  const store = createStore({ memory: true });
  store.write([{ source: "mock", mlsNumber: "OLD", title: "Old one", listPrice: 100 }]);
  await new Promise((r) => setTimeout(r, 5)); // ensure a distinct firstSeenAt tick
  store.write([{ source: "mock", mlsNumber: "NEW", title: "New one", listPrice: 200 }]);
  const { listings } = store.read();
  const sorted = [...listings].sort(
    (a, b) => new Date(b.firstSeenAt || 0) - new Date(a.firstSeenAt || 0)
  );
  assert.equal(sorted[0].mlsNumber, "NEW");
});

test("listingDedupeKey is stable across normalization", () => {
  const a = normalizeListing({ source: "mock", mlsNumber: "123" });
  const b = normalizeListing({ source: "mock", mlsNumber: "123", title: "different title entirely" });
  assert.equal(listingDedupeKey(a), listingDedupeKey(b));
});
