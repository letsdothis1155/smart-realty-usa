"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLocationCatalog, slugify } = require("../listings/locations");
const { parseSearchQuery, matchesFilters } = require("../listings/search-query");
const { createStore } = require("../listings/store");
const { createListingsProvider } = require("../listings/providers");
const { createListingsService } = require("../listings/service");
const { createListingsRouter } = require("../listings/routes");
const { upsertListings } = require("../listings/normalize");
const express = require("express");
const http = require("node:http");

test("location catalog is data-driven and grows from listings", () => {
  const cat = createLocationCatalog();
  assert.ok(cat.getBySlug("greensboro-nc"));
  assert.ok(cat.getBySlug("charlotte-nc"));
  assert.ok(cat.getBySlug("los-angeles-ca"));
  assert.equal(cat.resolve("28202").name, "Charlotte");
  assert.equal(cat.resolve("winston salem").name, "Winston-Salem");
  cat.addFromListing({ city: "Stokesdale", state: "NC", postalCode: "27357", latitude: 36.23, longitude: -79.99 });
  assert.ok(cat.getBySlug("stokesdale-nc"));
  assert.equal(slugify(["South End"]), "south-end");
});

test("NL search resolves expansion cities without a hard-coded if-else list", () => {
  const q = parseSearchQuery("3 bedroom houses in Atlanta");
  assert.equal(q.city, "Atlanta");
  assert.equal(q.state, "GA");
  assert.equal(q.beds, 3);
  const miami = parseSearchQuery("Miami condos under 500k");
  assert.equal(miami.city, "Miami");
  assert.equal(miami.maxPrice, 500000);
  const around = parseSearchQuery("homes around Raleigh");
  assert.equal(around.city, "Raleigh");
  const zip = parseSearchQuery("28202");
  assert.equal(zip.postalCode, "28202");
});

test("courthouse records are not for-sale listings", () => {
  const filters = parseSearchQuery("charlotte");
  const home = { title: "100 S Tryon St", address: "100 S Tryon St", city: "Charlotte", state: "NC", listingKind: "active_listing", status: "active", listPrice: 400000, beds: 3 };
  const court = { title: "600 W Jefferson St", address: "600 W Jefferson St", city: "Louisville", state: "KY", listingKind: "public_record", source: "court", status: "active" };
  assert.equal(matchesFilters(home, filters), true);
  assert.equal(matchesFilters(court, { ...filters, listingKind: "active_listing" }), false);
});

test("address dedupe keeps one house when two providers send the same street", () => {
  const merged = upsertListings(
    [{ source: "mock", mlsNumber: "A", address: "10 Main St", city: "Raleigh", state: "NC", listPrice: 1, image: "" }],
    [{ source: "hud", mlsNumber: "B", address: "10 Main St", city: "Raleigh", state: "NC", listPrice: 250000, image: "https://x/a.jpg" }],
  );
  const mains = merged.filter((l) => /10 main st/i.test(l.address));
  assert.equal(mains.length, 1);
});

test("coverage and city page use actual inventory counts", async () => {
  const store = createStore({ memory: true });
  store.write([
    { id: "h1", source: "hud", mlsNumber: "1", title: "1 Elm St", address: "1 Elm St", city: "Greensboro", state: "NC", postalCode: "27401", listPrice: 120000, beds: 3, status: "active", listingKind: "active_listing", latitude: 36.07, longitude: -79.79, image: "https://x/a.jpg" },
    { id: "h2", source: "hud", mlsNumber: "2", title: "2 Oak St", address: "2 Oak St", city: "Charlotte", state: "NC", postalCode: "28202", listPrice: 220000, beds: 3, status: "active", listingKind: "active_listing", latitude: 35.22, longitude: -80.84 },
  ]);
  const provider = createListingsProvider({});
  const service = createListingsService({ store, provider });
  const cov = await service.coverage();
  assert.equal(cov.active, 2);
  assert.equal(cov.citiesCovered, 2);
  const gso = await service.cityPage("greensboro-nc");
  assert.equal(gso.total, 1);
  assert.equal(gso.listings[0].city, "Greensboro");
});

test("HTTP coverage and location slug endpoints", async () => {
  const store = createStore({ memory: true });
  store.write([
    { id: "d1", source: "hud", mlsNumber: "9", title: "9 Main", address: "9 Main St", city: "Dallas", state: "TX", listPrice: 300000, status: "active", listingKind: "active_listing", latitude: 32.77, longitude: -96.79 },
  ]);
  const service = createListingsService({ store, provider: createListingsProvider({}) });
  const app = express();
  app.use(createListingsRouter({ service, adminPassword: "coverage-admin-test" }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const cov = await fetch(`http://127.0.0.1:${port}/api/coverage`).then((r) => r.json());
  assert.equal(cov.ok, true);
  assert.ok(cov.active >= 1);
  const city = await fetch(`http://127.0.0.1:${port}/api/locations/dallas-tx`).then((r) => r.json());
  assert.equal(city.ok, true);
  assert.equal(city.place.state, "TX");
  server.close();
});
