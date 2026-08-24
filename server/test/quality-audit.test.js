"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { auditListings } = require("../listings/quality-audit");
const { createPropertySyncJob } = require("../listings/sync-job");
const { createStore } = require("../listings/store");
const { LISTING_STATUS } = require("../listings/constants");

test("quality audit flags courthouse and impossible prices without deleting", () => {
  const rows = [
    { id: "ok", title: "10 Main", address: "10 Main", city: "Louisville", listPrice: 200000, sqft: 1500, latitude: 38, longitude: -85, image: "https://x/a.jpg", status: "active", source: "hud" },
    { id: "gov", title: "Jefferson County Courthouse", address: "531 Court Place", propertyType: "Courthouse", listPrice: 1, status: "active" },
    { id: "wild", title: "99 Sky", address: "99 Sky", listPrice: 9, sqft: 10, status: "active" },
  ];
  const report = auditListings(rows);
  assert.ok(report.blocked >= 1);
  assert.ok(report.warnings >= 1);
  assert.equal(rows.length, 3);
});

test("hourly sync records a quality report", async () => {
  const store = createStore({ memory: true });
  const job = createPropertySyncJob({
    store,
    provider: {
      name: "mock",
      fetchListings: async () => ({
        listings: [
          {
            id: "q1",
            source: "mock",
            providerListingId: "q1",
            address: "10 Pine",
            title: "10 Pine",
            city: "Louisville",
            state: "KY",
            listPrice: 180000,
            beds: 3,
            status: LISTING_STATUS.ACTIVE,
          },
        ],
        complete: true,
      }),
    },
  });
  const run = await job.run();
  assert.ok(run.quality);
  assert.equal(run.quality.checked, 1);
});
