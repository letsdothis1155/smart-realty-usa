"use strict";

function createRateLimiter() {
  const hits = new Map();

  function allow(key, max, windowMs) {
    const now = Date.now();
    const row = hits.get(key) || { n: 0, reset: now + windowMs };
    if (now > row.reset) {
      row.n = 0;
      row.reset = now + windowMs;
    }
    row.n += 1;
    hits.set(key, row);
    return row.n <= max;
  }

  function reset() {
    hits.clear();
  }

  return { allow, reset };
}

module.exports = { createRateLimiter };
