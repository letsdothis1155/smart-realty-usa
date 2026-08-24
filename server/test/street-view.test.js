"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  usableListingPhotos,
  isEligibleForStreetView,
  bearingDegrees,
  headingTowardProperty,
  shouldRecheckStreetView,
  applyStreetViewFallback,
  imagePresentation,
  buildStreetViewStaticUrl,
} = require("../listings/street-view");

function home(partial) {
  return {
    id: "sv-1",
    source: "hud",
    address: "123 Main St",
    title: "123 Main St",
    city: "Greensboro",
    state: "NC",
    postalCode: "27401",
    latitude: 36.0726,
    longitude: -79.792,
    status: "active",
    listingKind: "active_listing",
    ...partial,
  };
}

test("listing photos win and Street View is not requested", async () => {
  const listing = home({ image: "https://cdn.example/house.jpg", images: ["https://cdn.example/house.jpg"] });
  let fetched = 0;
  const applied = await applyStreetViewFallback(listing, {
    key: "secret-key",
    fetchImpl: async () => {
      fetched += 1;
      throw new Error("should not fetch");
    },
  });
  assert.equal(applied.requested, false);
  assert.equal(fetched, 0);
  assert.equal(applied.listing.image, "https://cdn.example/house.jpg");
  const view = imagePresentation(applied.listing);
  assert.equal(view.primaryImageSource, "provider");
  assert.equal(view.hasListingPhotos, true);
  assert.equal(view.displayImage.src, "https://cdn.example/house.jpg");
});

test("no listing photo uses Street View metadata only and does not overwrite image", async () => {
  const listing = home({ image: "", images: [] });
  const originalImage = listing.image;
  const applied = await applyStreetViewFallback(listing, {
    key: "secret-key",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: "OK",
        pano_id: "pano-abc",
        location: { lat: 36.0716, lng: -79.792 },
        copyright: "© Google",
      }),
    }),
  });
  assert.equal(applied.requested, true);
  assert.equal(applied.listing.image, originalImage);
  assert.equal(applied.listing.images.length, 0);
  assert.equal(applied.listing.streetView.available, true);
  assert.equal(applied.listing.streetView.panoId, "pano-abc");
  assert.ok(applied.listing.streetView.heading != null);
  const heading = headingTowardProperty({ lat: 36.0716, lng: -79.792 }, listing);
  assert.ok(heading < 20 || heading > 340, `heading ${heading} should face north toward the house`);
  const view = imagePresentation(applied.listing);
  assert.equal(view.primaryImageSource, "street_view");
  assert.equal(view.hasListingPhotos, false);
  assert.equal(view.displayImage.label, "Street View");
  assert.match(view.displayImage.src, /\/api\/listings\/sv-1\/street-view/);
  assert.equal(view.displayImage.attribution, "© Google");
});

test("ZERO_RESULTS is not retried until the recheck window", async () => {
  const listing = home({
    image: "",
    images: [],
    streetView: { available: false, status: "ZERO_RESULTS", checkedAt: new Date().toISOString() },
  });
  let fetched = 0;
  const applied = await applyStreetViewFallback(listing, {
    key: "secret-key",
    fetchImpl: async () => {
      fetched += 1;
      return { ok: true, json: async () => ({ status: "OK" }) };
    },
  });
  assert.equal(applied.requested, false);
  assert.equal(fetched, 0);
  const view = imagePresentation(listing);
  assert.equal(view.primaryImageSource, "placeholder");
});

test("courthouse / government addresses never request Street View", async () => {
  const listing = home({
    title: "Jefferson County Courthouse",
    address: "600 W Jefferson St",
    city: "Louisville",
    state: "KY",
    image: "",
    images: [],
  });
  assert.equal(isEligibleForStreetView(listing), false);
  let fetched = 0;
  const applied = await applyStreetViewFallback(listing, {
    key: "secret-key",
    fetchImpl: async () => {
      fetched += 1;
      throw new Error("no");
    },
  });
  assert.equal(fetched, 0);
  assert.equal(applied.requested, false);
});

test("bearing from panorama toward the property is used as heading", () => {
  const heading = bearingDegrees(36.07, -79.80, 36.07, -79.79);
  assert.ok(heading > 80 && heading < 100, `eastbound heading, got ${heading}`);
});

test("static URL uses pano id and heading, never stores the key on the listing", () => {
  const url = buildStreetViewStaticUrl({ panoId: "pano-abc", heading: 42, key: "secret-key" });
  assert.match(url, /pano=pano-abc/);
  assert.match(url, /heading=42/);
  assert.match(url, /fov=80/);
  const photos = usableListingPhotos({ image: url, imageSource: "street_view" });
  assert.equal(photos.length, 0);
});

test("shouldRecheckStreetView is false when a real listing photo exists", () => {
  assert.equal(shouldRecheckStreetView(home({ image: "https://cdn.example/a.jpg", images: ["https://cdn.example/a.jpg"] })), false);
});
