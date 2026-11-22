"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const tp = path.join(ROOT, "turnover-prices");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("example feed is labeled, has no affiliate ids, and keeps retailers apart", () => {
  const data = JSON.parse(read("turnover-prices/data/prices.example.json"));
  assert.equal(data.meta.exampleData, true);
  assert.equal(data.meta.amazon.enabled, false);
  assert.equal(data.categories.length, 5);
  assert.ok(data.products.length >= 25);
  const blob = JSON.stringify(data);
  assert.doesNotMatch(blob, /campid|EPN_|affiliateCampaign|AMAZON_|itemAffiliateWebUrl|productTrackingUrl|goto\.walmart|impact\.com/i);
  assert.doesNotMatch(blob, /[?&]tag=[a-z0-9]+-20/i);
  for (const product of data.products) {
    assert.ok(product.retailers.ebay && product.retailers.walmart);
    for (const retailer of ["ebay", "walmart"]) {
      for (const offer of product.retailers[retailer].offers) {
        assert.equal(offer.example, true);
        assert.ok(offer.checkedAt);
        assert.equal(typeof offer.itemPrice, "number");
        assert.equal(typeof offer.shipping, "number");
        const url = new URL(offer.url);
        assert.ok(url.hostname === "www.ebay.com" || url.hostname === "www.walmart.com");
        assert.equal([...url.searchParams.keys()].some((key) => /camp|tag|impact|publisher/i.test(key)), false);
      }
    }
  }
});

test("pages keep retailers apart and disclose every price link", () => {
  const vm = require("node:vm");
  const sandbox = {
    console,
    Intl,
    Date,
    URLSearchParams,
    module: { exports: {} },
  };
  sandbox.exports = sandbox.module.exports;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read("turnover-prices/turnover.js"), sandbox, { filename: "turnover.js" });
  const api = sandbox.module.exports;
  assert.equal(api.PAST_COPY_ENABLED, false);
  assert.equal(api.lowWindow(), null);
  assert.equal(api.isSample(), true);
  assert.equal(api.checkedLabel("2026-11-22T01:00:00.000Z"), "Sample price");
  const sampleControl = api.controlHtml("https://www.ebay.com/sch/i.html?_nkw=range", "ebay");
  assert.match(sampleControl, /Live link coming soon/);
  assert.match(sampleControl, /disabled/);
  assert.doesNotMatch(sampleControl, /href=/);
  sandbox.window = { TURNOVER_CONFIG: { dataMode: "live" } };
  assert.equal(api.isSample(), false);
  assert.match(api.checkedLabel("2026-11-22T01:00:00.000Z"), /Last checked .+ ET$/);
  const liveControl = api.controlHtml("https://www.walmart.com/search?q=range", "walmart");
  assert.match(liveControl, /View on Walmart/);
  assert.match(liveControl, /href="https:\/\/www\.walmart\.com\/search\?q=range"/);
  assert.equal(api.DISCLOSURE, "Affiliate link (#ad): Smart Realty may earn a commission. Rankings are never paid.");
  const data = JSON.parse(read("turnover-prices/data/prices.example.json"));
  const keypad = data.products.find((p) => p.id === "keypad-deadbolt");
  const sorted = api.sortOffers(keypad.retailers.ebay.offers);
  assert.ok(api.totalCents(sorted[0]) <= api.totalCents(sorted[1]));
  const selected = { "paint-gallon": true };
  const ebay = api.bundleFor(data.products, "2", "ebay", selected);
  const walmart = api.bundleFor(data.products, "2", "walmart", selected);
  assert.equal(ebay.lines.length, 1);
  assert.notEqual(ebay.totalCents, walmart.totalCents);
  const hub = read("turnover-prices/index.html");
  const cost = read("turnover-prices/rental-turnover-cost/index.html");
  const locks = read("turnover-prices/smart-locks-for-landlords/index.html");
  for (const html of [hub, cost, locks]) {
    assert.match(html, /Sample prices for layout only, not real offers\. Live eBay and Walmart prices are coming soon\./);
  }
  assert.match(hub, /value="total-asc"/);
  assert.match(hub, /Get 3 quotes/);
  assert.match(hub, /id="tpQuoteForm"/);
  assert.match(hub, /id="tpCalculator"/);
  assert.match(cost, /FAQPage/);
  assert.match(locks, /FAQPage/);
  assert.match(read("turnover-prices/turnover.js"), /From eBay|tp-retailer-ebay/);
  assert.match(read("turnover-prices/turnover.js"), /View on eBay/);
  assert.match(read("turnover-prices/turnover.js"), /View on Walmart/);
  assert.match(read("turnover-prices/turnover.js"), /Price on Walmart.com at time of purchase governs/);
  assert.doesNotMatch(read("turnover-prices/turnover.js"), /#affiliate/);
  assert.match(read("turnover-prices/config.js"), /dataMode:\s*"sample"/);
  assert.match(read("turnover-prices/config.js"), /YOUR_WEB3FORMS_ACCESS_KEY/);
  assert.doesNotMatch(read("turnover-prices/config.js"), /web3formsAccessKey:\s*"[0-9a-f]{8}-/);
});

test("sitemap, privacy, and the refresh job match the terms", async () => {
  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /turnover-prices\/</);
  assert.match(sitemap, /rental-turnover-cost/);
  assert.match(sitemap, /smart-locks-for-landlords/);
  const privacy = read("privacy.html");
  assert.match(privacy, /eBay/);
  assert.match(privacy, /Walmart/);
  assert.match(privacy, /Impact/);
  assert.match(privacy, /Amazon/);
  assert.match(privacy, /andrewiredale@smartrealty\.us/);
  assert.match(read("apps-privacy.html"), /site privacy policy/);
  const lib = await import(path.join(tp, "refresh", "lib.mjs"));
  assert.equal(lib.PAST_COPY_ENABLED, false);
  assert.equal(lib.shouldRun({}), false);
  assert.deepEqual(lib.keepCurrentOffer({ itemPrice: 1, extra: [1] }), { itemPrice: 1 });
  assert.match(read("turnover-prices/refresh/lib.mjs"), /PAST_COPY_ENABLED = false/);
  assert.match(read("turnover-prices/refresh/worker.mjs"), /disabled: true/);
  assert.match(read(".github/workflows/turnover-prices-refresh.yml"), /workflow_dispatch/);
  assert.doesNotMatch(read(".github/workflows/turnover-prices-refresh.yml"), /^\s*schedule:/m);
  const readme = read("turnover-prices/README.md");
  for (const name of [
    "EBAY_CLIENT_ID",
    "EBAY_CLIENT_SECRET",
    "EBAY_DEV_ID",
    "EBAY_CAMPAIGN_ID",
    "EBAY_AFFILIATE_REF_ID",
    "WALMART_CONSUMER_ID",
    "WALMART_PRIVATE_KEY",
    "WALMART_KEY_VERSION",
    "WALMART_PUBLISHER_ID",
    "AMAZON_CLIENT_ID",
    "AMAZON_CLIENT_SECRET",
    "AMAZON_CREDENTIAL_VERSION",
    "AMAZON_PARTNER_TAG",
    "AMAZON_MARKETPLACE",
  ]) {
    assert.match(readme, new RegExp(name));
  }
});

test("Jeffersonville link resolves to a real page", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "homes", "jeffersonville-in", "index.html")), true);
  assert.match(read("homes/jeffersonville-in/index.html"), /Jeffersonville/);
  assert.match(read("new-listings/index.html"), /\/homes\/jeffersonville-in\//);
  assert.match(read("app.js"), /homes\/jeffersonville-in\//);
});

test("quote and bundle forms post to Web3Forms only after a real key is set", async () => {
  const html = read("turnover-prices/index.html");
  const src = read("turnover-prices/turnover.js");
  assert.equal((html.match(/name="botcheck"/g) || []).length, 2);
  assert.equal((html.match(/name="access_key" value="YOUR_WEB3FORMS_ACCESS_KEY"/g) || []).length, 2);
  assert.ok((html.match(/mailto:andrewiredale@smartrealty\.us/g) || []).length >= 2);
  assert.match(html, /id="tpQuoteStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="tpBundleStatus"[^>]*aria-live="polite"/);
  assert.match(html, /name="phone"/);
  assert.match(html, /name="location"/);
  assert.match(html, /name="scope"/);
  assert.match(html, /name="bundle_estimate"/);
  assert.doesNotMatch(src, /status\.innerHTML/);
  assert.match(src, /el\.textContent = text/);
  assert.match(src, /https:\/\/api\.web3forms\.com\/submit/);
  assert.match(src, /Accept: "application\/json"/);
  assert.match(read("privacy.html"), /Web3Forms/);
  assert.match(read("apps-privacy.html"), /Web3Forms/);

  const vm = require("node:vm");
  const sandbox = { console, Intl, Date, URLSearchParams, module: { exports: {} }, fetch: () => { throw new Error("fetch should not run"); } };
  sandbox.exports = sandbox.module.exports;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: "turnover.js" });
  const api = sandbox.module.exports;
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.equal(url, "https://api.web3forms.com/submit");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Accept, "application/json");
    return { ok: true, json: async () => ({ success: true }) };
  };
  const placeholder = await api.submitWeb3Form({ access_key: "YOUR_WEB3FORMS_ACCESS_KEY", email: "a@b.co", botcheck: false }, { fetch: fakeFetch });
  assert.equal(placeholder.mode, "placeholder");
  assert.equal(calls, 0);
  const bot = await api.submitWeb3Form({ access_key: "real-key-not-committed", email: "a@b.co", botcheck: true }, { fetch: fakeFetch });
  assert.equal(bot.mode, "bot");
  assert.equal(calls, 0);
  const sent = await api.submitWeb3Form({
    access_key: "real-key-not-committed",
    email: "a@b.co",
    subject: "Get 3 quotes",
    from_name: "Pat",
    bundle_estimate: "Sample estimate",
    botcheck: false,
  }, { fetch: fakeFetch });
  assert.equal(sent.ok, true);
  assert.equal(calls, 1);
  const el = { textContent: "", className: "" };
  api.setStatus(el, "Sent. <b>ok</b>", "ok");
  assert.equal(el.textContent, "Sent. <b>ok</b>");
  assert.match(api.bundleEstimateText("2", 100, 200, [{ qty: 1, name: "Primer" }]), /^Sample estimate/);
});
