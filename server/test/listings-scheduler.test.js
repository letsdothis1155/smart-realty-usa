"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { startPropertySyncScheduler } = require("../listings/scheduler");
const { readConfig } = require("../config");
const { start } = require("../index");

test("property scheduler repeats and stops cleanly", async () => {
  let runs = 0;
  let sawSecondRun;
  const secondRun = new Promise((resolve) => {
    sawSecondRun = resolve;
  });
  const scheduler = startPropertySyncScheduler(
    {
      async run() {
        runs += 1;
        if (runs === 2) sawSecondRun();
        return { status: "ok" };
      },
    },
    { intervalMs: 10, runOnStart: false, log: () => {} },
  );

  let repeatTimeout;
  await Promise.race([
    secondRun,
    new Promise((_, reject) =>
      (repeatTimeout = setTimeout(() => reject(new Error("scheduler did not repeat")), 1000)),
    ),
  ]).finally(() => {
    clearTimeout(repeatTimeout);
    scheduler.stop();
  });
  const stoppedAt = runs;
  assert.equal(stoppedAt, 2);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(runs, stoppedAt);
});

test("stopping also cancels a pending startup sync", async () => {
  let runs = 0;
  const scheduler = startPropertySyncScheduler(
    { async run() { runs += 1; return { status: "ok" }; } },
    { intervalMs: 1000, startupDelayMs: 20, log: () => {} },
  );
  scheduler.stop();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(runs, 0);
});

test("server start wires the recurring property scheduler", async (t) => {
  const config = readConfig({
    JWT_SECRET: "9f8e7d6c5b4a32109f8e7d6c5b4a3210",
    AUTH_PORT: "0",
    LISTINGS_SYNC_INTERVAL_MS: "60000",
  });
  const server = start({
    config,
    ddMemory: true,
    listingsMemory: true,
    syncOnStart: false,
  });
  t.after(() => {
    server.propertySyncScheduler?.stop();
    if (server.listening) server.close();
  });
  if (!server.listening) await once(server, "listening");
  assert.ok(server.propertySyncScheduler);
  assert.equal(server.propertySyncScheduler.intervalMs, 60000);
});
