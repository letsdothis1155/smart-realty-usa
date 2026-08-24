"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mapResoProperty } = require("../listings/mapper");
const {
  createHudListingsProvider,
  mapHudRow,
  hudImageUrls,
} = require("../listings/providers/hud");
const { createListingsProvider } = require("../listings/providers");
const { createStore } = require("../listings/store");
const { createListingsService } = require("../listings/service");

test("mapResoProperty maps RESO Data Dictionary fields and carries IDX attribution", () => {
  const listing = mapResoProperty(
    {
      ListingKey: "abc123",
      ListingId: "MLS-1",
      UnparsedAddress: "1 Main St, Louisville, KY 40202",
      City: "Louisville",
      StateOrProvince: "KY",
      BedroomsTotal: 4,
      BathroomsTotalInteger: 3,
      LivingArea: 2400,
      ListPrice: 450000,
      StandardStatus: "Active",
      PropertyType: "Residential",
      PublicRemarks: "Nice house.",
      ListOfficeName: "Acme Realty",
      ListAgentFullName: "Jane Agent",
      OriginatingSystemName: "Metro MLS",
      ModificationTimestamp: "2026-08-01T00:00:00Z",
    },
    { abc123: [{ MediaURL: "https://example.test/1.jpg" }] }
  );

  assert.equal(listing.id, "abc123");
  assert.equal(listing.mlsNumber, "MLS-1");
  assert.equal(listing.status, "active");
  assert.equal(listing.beds, 4);
  assert.equal(listing.listPrice, 450000);
  assert.equal(listing.listingOffice, "Acme Realty");
  assert.equal(listing.listingAgent, "Jane Agent");
  assert.equal(listing.mlsSourceName, "Metro MLS");
  assert.deepEqual(listing.images, ["https://example.test/1.jpg"]);
});

test("unmapped RESO status falls back to off_market rather than crashing", () => {
  const listing = mapResoProperty({ ListingKey: "x", StandardStatus: "SomethingNew" });
  assert.equal(listing.status, "off_market");
});

test("HUD mapper keeps listing photos and extra gallery images", () => {
  const listing = mapHudRow({
    propertyCaseNumber: "156-515383",
    propertyAddress: "10327 Nicklaus St",
    propertyCity: "Crown Point",
    propertyState: "IN",
    propertyZip: "46307",
    propertyCounty: "Lake",
    listPrice: "385000",
    bedrooms: "3",
    bathroomsdecimal: 2.1,
    squareFootage: "2488",
    yearBuilt: "2012",
    listDate: "07/24/2026",
    latitude: "41.4302",
    longitude: "-87.2478",
    propertyType: "Single Family Home",
    propertyThumb: "https://res.cloudinary.com/yardi/image/upload/q_auto,f_auto,c_limit/d_hhs:themes:common:images:NoImage.jpg/hhs/FRONT.jpg",
    galleryImages: '"SAM_4465_1.JPG","SAM_4460_2.JPG"',
  });
  assert.equal(listing.city, "Crown Point");
  assert.equal(listing.state, "IN");
  assert.equal(listing.yearBuilt, 2012);
  assert.equal(listing.hasListingPhotos, true);
  assert.ok(listing.images.length >= 2);
  assert.equal(listing.primaryImageSource, "listing");
  assert.ok(hudImageUrls({ galleryImages: "SAM_1.JPG" }).some((u) => u.endsWith("SAM_1.JPG")));
});

test("listings provider defaults to mock", () => {
  const provider = createListingsProvider({});
  assert.equal(provider.name, "mock");
});

test("HUD outage does not impersonate a current active listing", async () => {
  const offline = createHudListingsProvider({
    regions: ["KY"],
    extraRegions: [],
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(() => offline.fetchListings(), /KY: offline/);

  const explicitDemo = createHudListingsProvider({
    regions: ["KY"],
    extraRegions: [],
    allowSampleFallback: true,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  const result = await explicitDemo.fetchListings();
  assert.equal(result.complete, false);
  assert.equal(result.listings[0].source, "hud_sample");
  assert.equal(result.listings[0].status, "demo");
  assert.equal(result.listings[0].listingKind, "demo_listing");
  assert.match(result.listings[0].desc, /not current inventory/i);
});

test("provider mode without credentials falls back to mock", () => {
  const provider = createListingsProvider({ mode: "provider" });
  assert.equal(provider.name, "mock");
  assert.equal(provider.forcedFromProvider, true);
  assert.equal(provider.providerReason, "missing_reso_credentials");
});

test("provider mode with credentials but no IDX agreement still falls back to mock", () => {
  const provider = createListingsProvider({
    mode: "provider",
    resoClientId: "id",
    resoClientSecret: "secret",
    resoTokenUrl: "https://example.test/token",
    resoQueryUrl: "https://example.test/odata",
    idxAgreementAccepted: false,
  });
  assert.equal(provider.name, "mock");
  assert.equal(provider.providerReason, "idx_agreement_not_accepted");
});

test("service lists and fetches sample listings via lazy sync", async () => {
  const store = createStore({ memory: true });
  const provider = createListingsProvider({});
  const service = createListingsService({ store, provider });

  const { listings, provider: providerName } = await service.list();
  assert.ok(listings.length > 0);
  assert.equal(providerName, "mock");

  const first = await service.get(listings[0].id);
  assert.equal(first.id, listings[0].id);

  await assert.rejects(() => service.get("does-not-exist"), /LISTING_NOT_FOUND|couldn't find/);
});

test("service filters by status, minBeds, and maxPrice", async () => {
  const store = createStore({ memory: true });
  const provider = createListingsProvider({});
  const service = createListingsService({ store, provider });

  const { listings: active } = await service.list({ status: "active" });
  assert.ok(active.every((l) => l.status === "active"));

  const { listings: cheap } = await service.list({ maxPrice: 1 });
  assert.equal(cheap.length, 0);
});

test("service sorts, paginates, and text-searches", async () => {
  const store = createStore({ memory: true });
  const provider = createListingsProvider({});
  const service = createListingsService({ store, provider });

  const { listings: byPrice, total } = await service.list({ sort: "price_desc" });
  assert.ok(total >= byPrice.length);
  for (let i = 1; i < byPrice.length; i++) {
    assert.ok(byPrice[i - 1].listPrice >= byPrice[i].listPrice);
  }

  const { listings: page1, limit } = await service.list({ limit: 1, offset: 0 });
  assert.equal(page1.length, 1);
  assert.equal(limit, 1);
  const { listings: page2 } = await service.list({ limit: 1, offset: 1 });
  assert.notEqual(page1[0].id, page2[0].id);

  const { listings: found } = await service.list({ q: "louisville" });
  assert.ok(found.every((l) => String(l.location || l.city || "").toLowerCase().includes("louisville")));
  assert.ok(found.length > 0);
});
