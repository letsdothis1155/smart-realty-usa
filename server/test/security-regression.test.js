"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../..");

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((file) => fs.existsSync(path.join(repoRoot, file)));
}

test("known published credentials are absent from tracked content", () => {
  const knownValues = [
    ["Smart", "Realty2026"].join(""),
    ["Smart", "RealtyAdmin2026"].join(""),
    ["sru-dev-secret-", "change-me-in-production"].join(""),
  ];

  for (const file of trackedFiles()) {
    const fullPath = path.join(repoRoot, file);
    const content = fs.readFileSync(fullPath);
    if (content.includes(0)) continue;
    const text = content.toString("utf8");
    for (const value of knownValues) {
      assert.equal(text.includes(value), false, `${value} found in ${file}`);
    }
  }
});

test("browser configs do not contain a demo password", () => {
  const configs = [
    "domain-config.js",
    "android/app/src/main/assets/www/domain-config.js",
    "scripts/pack-for-godaddy-airo.sh",
  ];
  for (const file of configs) {
    const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
    assert.match(text, /demoPassword:\s*["']["']/, `${file} must keep demoPassword empty`);
  }
});

test("credential files are neither tracked nor packaged", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, ".htpasswd")), false);
  for (const file of ["scripts/pack-for-upload.sh", "scripts/pack-for-godaddy-airo.sh"]) {
    const text = fs.readFileSync(path.join(repoRoot, file), "utf8");
    assert.equal(text.includes(".htpasswd"), false, `${file} must not package .htpasswd`);
  }
});
