"use strict";

const fs = require("node:fs");
const path = require("node:path");

function emptyDb() {
  return { listings: [], syncedAt: null };
}

function createStore({ dataDir, memory = false } = {}) {
  const file = dataDir ? path.join(dataDir, "listings-cache.json") : null;
  let cache = emptyDb();

  function ensure() {
    if (memory || !file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(emptyDb(), null, 2));
    }
  }

  function read() {
    if (memory || !file) return cache;
    ensure();
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      cache = { listings: data.listings || [], syncedAt: data.syncedAt || null };
      return cache;
    } catch {
      cache = emptyDb();
      return cache;
    }
  }

  function write(listings) {
    const next = { listings, syncedAt: new Date().toISOString() };
    cache = next;
    if (memory || !file) return next;
    ensure();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, file);
    return next;
  }

  return { read, write };
}

module.exports = { createStore };
