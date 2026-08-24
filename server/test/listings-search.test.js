"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { entityKind, isGovernmentPrimary, isHiddenOffice, isPrimaryHomeResult, canView3D, attachPublicRecords, isResidentialListing } = require("../listings/entity");
const { parseSearchQuery, matchesFilters, rankListings } = require("../listings/search-query");
const { createStore } = require("../listings/store");
const { createListingsProvider } = require("../listings/providers");
const { createListingsService } = require("../listings/service");

test("courthouse and clerk offices are government entities, not homes", () => {
  assert.equal(
    entityKind({ title: "Jefferson County Courthouse", address: "600 W Jefferson St", city: "Louisville", source: "court" }),
    "government"
  );
  assert.equal(isGovernmentPrimary({ title: "Clerk of Court", address: "514 W Liberty St" }), true);
  assert.equal(isGovernmentPrimary({ title: "County Assessor Office", address: "1 Fiscal Ct" }), true);
  assert.equal(isPrimaryHomeResult({ title: "Municipal Building", address: "City Hall Plaza" }), false);
});

test("a real house with court/PVA history stays a home", () => {
  const home = {
    title: "2511 St Xavier Street",
    address: "2511 St Xavier Street",
    city: "Louisville",
    state: "KY",
    postalCode: "40212",
    beds: 3,
    baths: 2,
    listPrice: 89000,
    source: "hud",
    desc: "Court auction history is attached from the Master Commissioner.",
  };
  assert.equal(entityKind(home), "home");
  assert.equal(isGovernmentPrimary(home), false);
  assert.equal(isPrimaryHomeResult(home), true);
});

test("2611 Harmony Rd is never a public listing", () => {
  assert.equal(isHiddenOffice({ address: "2611 Harmony Rd", title: "2611 Harmony Rd (sample)" }), true);
  assert.equal(entityKind({ address: "2611 Harmony Rd", title: "2611 Harmony Rd", source: "mock" }), "office");
  assert.equal(isPrimaryHomeResult({ address: "2611 Harmony Road, Louisville, KY 40299" }), false);
});

test("court auctions without a house number stay secondary public records", () => {
  const parcel = { title: "Northwestern Parkway, Parcel No. 03015K00800000", address: "Northwestern Parkway, Parcel No. 03015K00800000", source: "court" };
  assert.equal(entityKind(parcel), "public_record");
});

test("public-record rows attach to the matching home instead of ranking as the property", () => {
  const homes = [{ title: "123 Main St", address: "123 Main St", city: "Louisville", publicRecords: [] }];
  const leftover = attachPublicRecords(homes, [
    { title: "123 Main St", address: "123 Main St", caseNumber: "26CI1", source: "court", kind: "court-upcoming" },
  ]);
  assert.equal(leftover.length, 0);
  assert.equal(homes[0].publicRecords.length, 1);
  assert.equal(homes[0].publicRecords[0].caseNumber, "26CI1");
});

test("View in 3D is only for real homes with usable photos", () => {
  assert.equal(
    canView3D({
      title: "918 Baxter Avenue",
      address: "918 Baxter Avenue",
      source: "mock",
      image: "images/listing-19.jpg",
      images: ["images/gallery/g-09.jpg"],
    }),
    true
  );
  assert.equal(
    canView3D({
      title: "600 W Jefferson St",
      address: "600 W Jefferson St",
      source: "court",
      image: "data:image/svg+xml,courthouse",
    }),
    false
  );
  assert.equal(
    canView3D({
      title: "4119 River Park Drive",
      address: "4119 River Park Drive",
      source: "court",
      image: "data:image/svg+xml,court",
    }),
    false
  );
});

test("parses natural-language housing queries into filters", () => {
  const q = parseSearchQuery("3 bedroom houses under 250k near Greensboro");
  assert.equal(q.beds, 3);
  assert.equal(q.maxPrice, 250000);
  assert.equal(q.city, "Greensboro");
  assert.equal(q.state, "NC");
  assert.equal(q.propertyType, "house");

  const zip = parseSearchQuery("property 27407");
  assert.equal(zip.postalCode, "27407");

  const combo = parseSearchQuery("3 bed 2 bath under 300k");
  assert.equal(combo.beds, 3);
  assert.equal(combo.baths, 2);
  assert.equal(combo.maxPrice, 300000);

  const near = parseSearchQuery("homes near me");
  assert.equal(near.nearMe, true);
  assert.equal(near.radiusMiles, 20);
  assert.ok(near.lat != null && near.lng != null);
});

test("typo-tolerant city match still finds Greensboro", () => {
  const q = parseSearchQuery("homes in greensbro nc");
  assert.equal(q.city, "Greensboro");
});

test("ranking never puts a courthouse-style record above a matching home", () => {
  const filters = parseSearchQuery("louisville");
  const ranked = rankListings(
    [
      { title: "Jefferson Circuit Court sale sheet", address: "600 W Jefferson St", source: "court", status: "active", listPrice: 0 },
      {
        title: "918 Baxter Avenue",
        address: "918 Baxter Avenue",
        city: "Louisville",
        state: "KY",
        source: "mock",
        status: "active",
        listPrice: 329000,
        beds: 3,
        baths: 2,
        sqft: 1840,
        image: "images/listing-19.jpg",
        listingDate: "2026-08-19T15:00:00Z",
      },
    ],
    filters
  );
  assert.equal(ranked[0].address, "918 Baxter Avenue");
});

test("service hides Harmony Rd and paginates filtered homes", async () => {
  const store = createStore({ memory: true });
  store.write([
    { id: "keep", source: "mock", mlsNumber: "K1", title: "918 Baxter Avenue", address: "918 Baxter Avenue", city: "Louisville", state: "KY", listPrice: 329000, beds: 3, baths: 2, status: "active" },
    { id: "hide", source: "mock", mlsNumber: "H1", title: "2611 Harmony Rd (sample)", address: "2611 Harmony Rd", city: "Jeffersontown", state: "KY", listPrice: 285000, beds: 3, status: "active" },
    { id: "gov", source: "court", title: "Jefferson County Courthouse", address: "600 W Jefferson St", city: "Louisville", status: "active" },
  ]);
  const provider = createListingsProvider({});
  const service = createListingsService({ store, provider });
  const { listings, total } = await service.list({ q: "louisville", limit: 10 });
  assert.ok(listings.every((l) => !/2611\s+harmony/i.test(`${l.address} ${l.title}`)));
  assert.ok(listings.every((l) => l.entityKind === "home"));
  assert.ok(total >= 1);
  const page = await service.list({ limit: 1, offset: 0 });
  assert.equal(page.listings.length, 1);
  assert.equal(page.limit, 1);
});

test("Southern Indiana queries resolve to Jeffersonville, New Albany, and Utica IN", () => {
  const jeff = parseSearchQuery("Jeffersonville IN");
  assert.equal(jeff.city, "Jeffersonville");
  assert.equal(jeff.state, "IN");
  assert.ok(jeff.lat);
  assert.equal(jeff.radiusMiles, 30);

  const albany = parseSearchQuery("homes in New Albany");
  assert.equal(albany.city, "New Albany");
  assert.equal(albany.state, "IN");

  const utica = parseSearchQuery("Utica Indiana");
  assert.equal(utica.city, "Utica");
  assert.equal(utica.state, "IN");

  const priced = parseSearchQuery("houses under $300k near Jeffersonville");
  assert.equal(priced.maxPrice, 300000);
  assert.equal(priced.city, "Jeffersonville");
  assert.equal(priced.propertyType, "house");

  const beds = parseSearchQuery("3 bedroom homes New Albany");
  assert.equal(beds.beds, 3);
  assert.equal(beds.city, "New Albany");
});

test("nearby Kentucky homes can match a Jeffersonville search; Utica KY does not match Utica Indiana", () => {
  const filters = parseSearchQuery("Jeffersonville IN");
  const nearby = {
    title: "186 Blakemoore Ln",
    address: "186 Blakemoore Ln",
    city: "Smithfield",
    state: "KY",
    listPrice: 184000,
    beds: 3,
    latitude: 38.407,
    longitude: -85.508,
    listingKind: "active_listing",
    status: "active",
  };
  assert.equal(matchesFilters(nearby, filters), true);

  const uticaIn = parseSearchQuery("Utica Indiana");
  const uticaKy = {
    title: "107 E Locust Grove Rd",
    address: "107 E Locust Grove Rd",
    city: "Utica",
    state: "KY",
    listPrice: 145000,
    latitude: 37.605,
    longitude: -87.116,
    listingKind: "active_listing",
    status: "active",
  };
  assert.equal(matchesFilters(uticaKy, uticaIn), false);
});

test("commercial and parcel-only rows are not residential homes", () => {
  assert.equal(
    isResidentialListing({
      title: "Warehouse on Industrial Blvd",
      address: "900 Industrial Blvd",
      propertyType: "Commercial",
      city: "Jeffersonville",
      state: "IN",
    }),
    false
  );
  assert.equal(
    isResidentialListing({
      title: "329 Holmes St",
      address: "329 Holmes St",
      city: "Frankfort",
      state: "KY",
      propertyType: "Single Family Home",
      source: "hud",
    }),
    true
  );
});

test("NL filter matches 3 bed under 300k", () => {
  const filters = parseSearchQuery("3 bed 2 bath under 300k");
  assert.equal(
    matchesFilters({ beds: 3, baths: 2, listPrice: 285000, title: "A", address: "1 Main", city: "Louisville" }, filters),
    true
  );
  assert.equal(
    matchesFilters({ beds: 2, baths: 2, listPrice: 285000, title: "B", address: "2 Main", city: "Louisville" }, filters),
    false
  );
  assert.equal(
    matchesFilters({ beds: 3, baths: 2, listPrice: 410000, title: "C", address: "3 Main", city: "Louisville" }, filters),
    false
  );
});
