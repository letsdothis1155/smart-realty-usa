const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../js/advertiser-inquiry.js"), "utf8");

function harness(reply) {
  const events = {};
  const values = {
    advertiserName: "Example Advertiser",
    advertiserBusiness: "Example Company",
    advertiserEmail: "buyer@example.com",
    advertiserPhone: "502-555-0100",
    advertiserBusinessUrl: "https://example.com",
    advertiserPlacement: "Homepage",
    advertiserDates: "October 1-31",
    advertiserBudget: "$100-$500",
    advertiserDetails: "Promote a Louisville home-services offer.",
    advertiserWebsite: "",
  };
  const elements = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
  elements.advertiserForm = { reportValidity: () => true, addEventListener: (event, handler) => { events[event] = handler; } };
  elements.advertiserConsent = { checked: true };
  elements.advertiserSubmit = { disabled: false, textContent: "Send inquiry - no charge" };
  elements.advertiserStatus = { textContent: "", focus() {} };
  elements.advertiserEmailFallback = { href: "" };
  const calls = [];
  vm.runInNewContext(source, {
    document: { getElementById: (id) => elements[id] }, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { calls.push({ url, options }); return typeof reply === "function" ? reply() : reply; },
  });
  return { elements, events, calls, submit: () => events.submit({ preventDefault() {} }) };
}

const response = (data, status = 200, type = "application/json") => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: () => type }, json: async () => data,
});

test("advertising inquiry uses the saved lead endpoint without claiming a booking or charge", async () => {
  const h = harness(response({ ok: true, id: "advertiser-123", emailed: true }));
  await h.submit();
  assert.equal(h.calls[0].url, "/api/signup");
  const body = JSON.parse(h.calls[0].options.body);
  assert.equal(body.intent, "services");
  assert.equal(body.website, "");
  assert.equal(body.phone, "502-555-0100");
  assert.match(body.note, /^Advertising inquiry/);
  assert.match(body.note, /Example Company/);
  assert.match(body.note, /https:\/\/example.com/);
  assert.match(body.note, /Homepage/);
  assert.ok(body.note.length <= 500);
  assert.match(h.elements.advertiserStatus.textContent, /advertiser-123/);
  assert.match(h.elements.advertiserStatus.textContent, /no charge was made/i);
  assert.equal(h.elements.advertiserSubmit.disabled, true);
  await h.submit();
  assert.equal(h.calls.length, 1, "a completed form must not create a duplicate inquiry");
});

test("official inbox is used for the email fallback", () => {
  const h = harness(response({ ok: true, id: "test", emailed: true }));
  assert.match(h.elements.advertiserEmailFallback.href, /^mailto:andrewiredale@smartrealty\.us/);
  assert.doesNotMatch(h.elements.advertiserEmailFallback.href, /ai@smartrealty\.us/);
});

test("saved inquiry with failed notification preserves a referenced email fallback", async () => {
  const h = harness(response({ ok: true, id: "saved-456", emailed: false }));
  await h.submit();
  assert.match(h.elements.advertiserStatus.textContent, /could not confirm Andrew's email/);
  assert.match(decodeURIComponent(h.elements.advertiserEmailFallback.href), /Saved inquiry reference: saved-456/);
});

for (const [name, reply] of [
  ["static-host HTTP 405", response(null, 405, "text/html")],
  ["HTML response", response(null, 200, "text/html")],
  ["acknowledgment without a saved request ID", response({ ok: true, emailed: true })],
  ["explicit application failure", response({ ok: false, error: "Unavailable" })],
]) {
  test(name + " never shows a received or booked confirmation", async () => {
    const h = harness(reply);
    await h.submit();
    assert.match(h.elements.advertiserStatus.textContent, /could not confirm receipt/);
    assert.equal(h.elements.advertiserSubmit.disabled, false);
    assert.equal(h.elements.advertiserDetails.value, "Promote a Louisville home-services offer.");
  });
}

test("rate limits preserve campaign details and explain the retry path", async () => {
  const h = harness(response({ ok: false }, 429));
  await h.submit();
  assert.match(h.elements.advertiserStatus.textContent, /Too many requests/);
});

test("timeout is treated as uncertain receipt", async () => {
  const h = harness(() => { const error = new Error("timeout"); error.name = "AbortError"; throw error; });
  await h.submit();
  assert.match(h.elements.advertiserStatus.textContent, /receipt is unconfirmed/);
  assert.match(h.elements.advertiserStatus.textContent, /before submitting again/);
});

test("contact consent is required before transmitting the inquiry", async () => {
  const h = harness(response({ ok: true, id: "test", emailed: true }));
  h.elements.advertiserConsent.checked = false;
  await h.submit();
  assert.equal(h.calls.length, 0);
});

test("maximum field lengths fit the backend note limit", async () => {
  const h = harness(response({ ok: true, id: "test", emailed: true }));
  h.elements.advertiserBusiness.value = "b".repeat(80);
  h.elements.advertiserBusinessUrl.value = "https://example.com/" + "u".repeat(140);
  h.elements.advertiserDetails.value = "d".repeat(220);
  await h.submit();
  const body = JSON.parse(h.calls[0].options.body);
  assert.ok(body.note.length <= 500);
  assert.match(body.note, /^Advertising inquiry/);
});
