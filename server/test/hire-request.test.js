const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../../js/hire-request.js"), "utf8");

function harness(reply, search = "") {
  const events = {};
  const values = { hireName: "Example Customer", hireEmail: "customer@example.com", hireCity: "Louisville", hireBrief: "Three bedrooms and an updated kitchen.", hireWebsite: "" };
  const elements = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
  elements.hireService = { value: "listing-copy", disabled: false };
  elements.hireForm = { reportValidity: () => true, addEventListener: (event, handler) => { events[event] = handler; } };
  elements.hireConsent = { checked: true };
  elements.hireSubmit = { disabled: false, textContent: "Request a quote — no charge" };
  elements.hireStatus = { textContent: "", focus() {} };
  elements.hireEmailFallback = { href: "" };
  const calls = [];
  vm.runInNewContext(source, {
    document: { getElementById: (id) => elements[id] },
    window: { location: { search } }, URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { calls.push({ url, options }); return typeof reply === "function" ? reply() : reply; },
  });
  return { elements, events, calls, submit: () => events.submit({ preventDefault() {} }) };
}

const response = (data, status = 200, type = "application/json") => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: () => type }, json: async () => data,
});

test("service inquiry uses the live signup contract and does not treat a request as payment", async () => {
  const h = harness(response({ ok: true, id: "request-123", emailed: true }));
  await h.submit();
  assert.equal(h.calls[0].url, "/api/signup");
  const body = JSON.parse(h.calls[0].options.body);
  assert.equal(body.intent, "services");
  assert.match(body.note, /USD 150/);
  assert.match(body.note, /Three bedrooms/);
  assert.doesNotMatch(body.note, /Source:/);
  assert.ok(body.note.length <= 500);
  assert.match(h.elements.hireStatus.textContent, /request-123/);
  assert.match(h.elements.hireStatus.textContent, /No payment has been taken/);
  assert.equal(h.elements.hireSubmit.disabled, true);
  await h.submit();
  assert.equal(h.calls.length, 1, "a second submit must not duplicate the saved request");
});

test("saved inquiry with failed notification gives an email fallback with its reference", async () => {
  const h = harness(response({ ok: true, id: "saved-456", emailed: false }));
  await h.submit();
  assert.match(h.elements.hireStatus.textContent, /could not confirm Andrew's email/);
  assert.match(decodeURIComponent(h.elements.hireEmailFallback.href), /Saved request reference: saved-456/);
  assert.equal(h.elements.hireBrief.value, "Three bedrooms and an updated kitchen.");
});

for (const [name, reply] of [
  ["static-host HTTP 405", response(null, 405, "text/html")],
  ["HTML page returning HTTP 200", response(null, 200, "text/html")],
  ["acknowledgment without a saved request ID", response({ ok: true, emailed: true })],
  ["explicit application failure", response({ ok: false, error: "Unavailable" })],
]) {
  test(name + " never shows a saved or paid confirmation", async () => {
    const h = harness(reply);
    await h.submit();
    assert.match(h.elements.hireStatus.textContent, /could not confirm receipt/);
    assert.equal(h.elements.hireSubmit.disabled, false);
    assert.equal(h.elements.hireBrief.value, "Three bedrooms and an updated kitchen.");
  });
}

test("rate limits preserve the brief and explain when to retry", async () => {
  const h = harness(response({ ok: false }, 429));
  await h.submit();
  assert.match(h.elements.hireStatus.textContent, /Too many requests/);
});

test("timeout is an uncertain receipt, not a false failure or a booked order", async () => {
  const h = harness(() => { const e = new Error("timeout"); e.name = "AbortError"; throw e; });
  await h.submit();
  assert.match(h.elements.hireStatus.textContent, /receipt is unconfirmed/);
  assert.match(h.elements.hireStatus.textContent, /before submitting again/);
});

test("contact consent is required before transmitting the brief", async () => {
  const h = harness(response({ ok: true, id: "test", emailed: true }));
  h.elements.hireConsent.checked = false;
  await h.submit();
  assert.equal(h.calls.length, 0);
});

test("a tagged quote preserves a maximum-length brief and attributes the email fallback", async () => {
  const h = harness(response({ ok: true, id: "test", emailed: false }), "?utm_source=ABCDEFGHIJKLMNOPQRSTUVWX");
  const brief = "x".repeat(396) + "tail";
  h.elements.hireBrief.value = brief;
  assert.match(decodeURIComponent(h.elements.hireEmailFallback.href), /Source: abcdefghijklmnopqrstuvwx/);
  await h.submit();
  const { note } = JSON.parse(h.calls[0].options.body);
  assert.match(note, /Source: abcdefghijklmnopqrstuvwx/);
  assert.ok(note.endsWith(brief));
  assert.ok(note.length <= 500);
  assert.match(decodeURIComponent(h.elements.hireEmailFallback.href), /Source: abcdefghijklmnopqrstuvwx.*Saved request reference: test/s);
});

test("malformed and overlong source tags are omitted from the quote", async () => {
  for (const tag of ["person%40example.com", "a".repeat(25), "5020000000"]) {
    const h = harness(response({ ok: true, id: "test", emailed: true }), "?utm_source=" + tag);
    await h.submit();
    assert.doesNotMatch(JSON.parse(h.calls[0].options.body).note, /Source:/);
  }
});

test("a room-studio referral preselects the combined quote and keeps the 400-character brief", async () => {
  const h = harness(response({ ok: true, id: "room-quote", emailed: true }),
    "?offer=room-and-copy&utm_source=room-studio");
  assert.equal(h.elements.hireService.value, "room-and-copy");
  assert.match(h.elements.hireBrief.placeholder, /room name/);
  assert.match(decodeURIComponent(h.elements.hireEmailFallback.href), /subject=Listing copy \+ one-room visualization quote/);
  h.elements.hireBrief.value = "a".repeat(396) + "tail";
  await h.submit();
  const body = JSON.parse(h.calls[0].options.body);
  assert.equal(body.intent, "other");
  assert.match(body.note, /^Quote: copy \+ one-room layout.*Source: room-studio/);
  assert.ok(body.note.endsWith(h.elements.hireBrief.value));
  assert.ok(body.note.length <= 500);
  assert.match(h.elements.hireStatus.textContent, /scope, price, and a delivery date/);
  assert.doesNotMatch(h.elements.hireStatus.textContent, /Stripe|\$150/);
});

test("switching quote services keeps the typed brief and updates the email fallback", async () => {
  const h = harness(response({ ok: true, id: "copy-quote", emailed: false }), "?offer=room-and-copy");
  const brief = h.elements.hireBrief.value;
  h.elements.hireService.value = "listing-copy";
  h.events.input();
  assert.equal(h.elements.hireBrief.value, brief);
  assert.match(h.elements.hireBrief.placeholder, /confirmed features/);
  await h.submit();
  assert.equal(JSON.parse(h.calls[0].options.body).intent, "services");
  const email = decodeURIComponent(h.elements.hireEmailFallback.href);
  assert.match(email, /subject=Listing copy pack quote/);
  assert.match(email, /Saved request reference: copy-quote/);
});
