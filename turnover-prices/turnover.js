/* Kentuckiana Turnover Price Check
   Renders example (or later, short-lived) eBay and Walmart prices in
   separate blocks. No blended listing cards. No price history. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TURNOVER = api;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      api.mountPage();
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DISCLOSURE = "Affiliate link (#ad): Smart Realty may earn a commission. Rankings are never paid.";
  var EBAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  /**
   * TODO(ebay-written-permission): 30/90-day lows and any eBay price archive
   * stay off. The Browse API license allows only short-lived copies, and
   * deriving averages needs eBay's written permission. Walmart's operating
   * agreement prohibits price tracking and alerts. Do not flip this on.
   */
  var PRICE_HISTORY_ENABLED = false;

  function cents(n) {
    var value = Number(n);
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100);
  }

  function totalCents(offer) {
    return cents(offer && offer.itemPrice) + cents(offer && offer.shipping);
  }

  function moneyFromCents(c) {
    return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sortOffers(offers, mode) {
    return (offers || []).slice().sort(function (a, b) {
      var diff = mode === "item-asc"
        ? cents(a.itemPrice) - cents(b.itemPrice)
        : mode === "total-desc"
          ? totalCents(b) - totalCents(a)
          : totalCents(a) - totalCents(b);
      if (diff) return diff;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }

  function formatChecked(iso) {
    var dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "Last checked — ET";
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(dt);
    return "Last checked " + parts + " ET";
  }

  function isStaleEbay(iso, now) {
    var dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return true;
    return (now || Date.now()) - dt.getTime() > EBAY_MAX_AGE_MS;
  }

  /**
   * History stays unreachable while PRICE_HISTORY_ENABLED is false.
   * Returning null is the supported behavior.
   */
  function lowWindow() {
    if (!PRICE_HISTORY_ENABLED) return null;
    return null;
  }

  function cheapest(offers) {
    var sorted = sortOffers(offers);
    return sorted.length ? sorted[0] : null;
  }

  function lineFor(product, size, retailer) {
    var qty = product.qty && Number(product.qty[String(size)]);
    if (!qty) return null;
    var block = product.retailers && product.retailers[retailer];
    var offer = cheapest(block && block.offers);
    if (!offer) {
      return { product: product, qty: qty, offer: null, lineCents: 0, missing: true };
    }
    return {
      product: product,
      qty: qty,
      offer: offer,
      lineCents: totalCents(offer) * qty,
      missing: false,
    };
  }

  function bundleFor(products, size, retailer, selectedIds) {
    var lines = [];
    (products || []).forEach(function (product) {
      if (selectedIds && !selectedIds[product.id]) return;
      var line = lineFor(product, size, retailer);
      if (line) lines.push(line);
    });
    var total = lines.reduce(function (sum, line) {
      return sum + (line.missing ? 0 : line.lineCents);
    }, 0);
    return { retailer: retailer, size: String(size), lines: lines, totalCents: total };
  }

  function linkLabel(retailer) {
    return retailer === "ebay" ? "View on eBay" : "View on Walmart";
  }

  function disclosureHtml() {
    return '<p class="tp-disclosure">' + esc(DISCLOSURE) + "</p>";
  }

  function offerHtml(offer, retailer) {
    var ship = cents(offer.shipping);
    var stale = retailer === "ebay" && isStaleEbay(offer.checkedAt);
    return (
      '<article class="tp-offer">' +
      '<p class="tp-offer-title">' +
      esc(offer.title) +
      (offer.example ? ' <span class="tp-tag">EXAMPLE DATA</span>' : "") +
      "</p>" +
      '<p class="tp-price"><strong>' +
      moneyFromCents(totalCents(offer)) +
      "</strong> total <span class=\"tp-split\">" +
      moneyFromCents(cents(offer.itemPrice)) +
      " item + " +
      (ship ? moneyFromCents(ship) + " shipping" : "free shipping") +
      "</span></p>" +
      '<p class="tp-checked">' +
      esc(formatChecked(offer.checkedAt)) +
      "</p>" +
      (retailer === "walmart"
        ? '<p class="tp-govern">Price on Walmart.com at time of purchase governs.</p>'
        : "") +
      (stale
        ? '<p class="tp-stale">This eBay example is more than 6 hours old. A live eBay listing has to be refreshed at least every 6 hours.</p>'
        : "") +
      '<p class="tp-go"><a class="tp-out" href="' +
      esc(offer.url) +
      '" target="_blank" rel="sponsored noopener noreferrer">' +
      linkLabel(retailer) +
      "</a></p>" +
      disclosureHtml() +
      "</article>"
    );
  }

  function blockHtml(product, retailer) {
    var meta = (product && product._retailerMeta && product._retailerMeta[retailer]) || {};
    var label = meta.label || (retailer === "ebay" ? "From eBay" : "From Walmart");
    var offers = sortOffers((product.retailers[retailer] && product.retailers[retailer].offers) || [], product._sortMode || "total-asc");
    var body = offers.length
      ? offers.map(function (offer) { return offerHtml(offer, retailer); }).join("")
      : '<p class="tp-empty">No current example offer in this preview.</p>';
    return (
      '<section class="tp-retailer tp-retailer-' +
      retailer +
      '" aria-label="' +
      esc(label) +
      '">' +
      "<h4>" +
      esc(label) +
      "</h4>" +
      body +
      "</section>"
    );
  }

  function productHtml(product, retailerMeta) {
    product._retailerMeta = retailerMeta;
    return (
      '<article class="tp-product" id="sku-' +
      esc(product.id) +
      '">' +
      "<h3>" +
      esc(product.name) +
      "</h3>" +
      '<p class="tp-summary">' +
      esc(product.summary) +
      "</p>" +
      '<div class="tp-blocks">' +
      blockHtml(product, "ebay") +
      blockHtml(product, "walmart") +
      "</div>" +
      "</article>"
    );
  }

  function selectedMap(products) {
    var map = {};
    products.forEach(function (product) {
      map[product.id] = !!product.defaultOn;
    });
    return map;
  }

  function lineRow(line, retailer) {
    var name = esc(line.product.name);
    var qty = esc(line.qty + " " + (line.product.unit || ""));
    if (line.missing) {
      return (
        "<tr><td>" +
        name +
        "</td><td>" +
        qty +
        '</td><td colspan="2">No example offer in this block.</td></tr>'
      );
    }
    return (
      "<tr><td>" +
      name +
      "</td><td>" +
      qty +
      "</td><td>" +
      moneyFromCents(line.lineCents) +
      '</td><td><a class="tp-out" href="' +
      esc(line.offer.url) +
      '" target="_blank" rel="sponsored noopener noreferrer">' +
      linkLabel(retailer) +
      "</a>" +
      disclosureHtml() +
      '<p class="tp-checked">' +
      esc(formatChecked(line.offer.checkedAt)) +
      "</p>" +
      (line.offer.example ? '<p><span class="tp-tag">EXAMPLE DATA</span></p>' : "") +
      (retailer === "walmart" ? '<p class="tp-govern">Price on Walmart.com at time of purchase governs.</p>' : "") +
      "</td></tr>"
    );
  }

  function bundleHtml(bundle) {
    var label = bundle.retailer === "ebay" ? "From eBay" : "From Walmart";
    var rows = bundle.lines.map(function (line) { return lineRow(line, bundle.retailer); }).join("");
    if (!rows) rows = '<tr><td colspan="4">Check at least one item.</td></tr>';
    return (
      '<section class="tp-retailer tp-retailer-' +
      bundle.retailer +
      '" aria-label="' +
      label +
      ' bundle">' +
      "<h3>" +
      label +
      "</h3>" +
      '<table class="tp-table"><thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Line total</th><th scope="col">Current offer</th></tr></thead><tbody>' +
      rows +
      "</tbody><tfoot><tr><th scope=\"row\" colspan=\"2\">Subtotal</th><td colspan=\"2\"><strong>" +
      moneyFromCents(bundle.totalCents) +
      "</strong></td></tr></tfoot></table>" +
      "</section>"
    );
  }

  function readConfig() {
    var cfg = (typeof window !== "undefined" && window.TURNOVER_CONFIG) || {};
    return {
      formEndpoint: String(cfg.formEndpoint || "").trim(),
      contactEmail: cfg.contactEmail || "andrewiredale@smartrealty.us",
    };
  }

  function utmFields() {
    var params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
    var out = {};
    keys.forEach(function (key) {
      var value = params.get(key);
      if (value) out[key] = value.slice(0, 80);
    });
    if (!out.utm_source) out.utm_source = "turnover-prices";
    return out;
  }

  function mailtoLink(email, subject, body) {
    return "mailto:" + email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  async function postIntake(payload) {
    var cfg = readConfig();
    if (!cfg.formEndpoint) return { ok: false, mode: "unconfigured" };
    var res = await fetch(cfg.formEndpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("The form endpoint returned " + res.status + ".");
    return { ok: true, mode: "endpoint" };
  }

  function mountMenu() {
    var button = document.getElementById("tpMenu");
    var nav = document.getElementById("tpNav");
    if (!button || !nav) return;
    button.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
  }

  function fillCatalog(data, rootEl, mode) {
    if (!rootEl) return;
    rootEl.querySelectorAll("[data-mount]").forEach(function (mount) { mount.innerHTML = ""; });
    data.products.forEach(function (product) {
      var mount = rootEl.querySelector('[data-mount="' + product.category + '"]');
      if (!mount) return;
      product._sortMode = mode || "total-asc";
      mount.insertAdjacentHTML("beforeend", productHtml(product, data.meta.retailers));
    });
  }

  function mountCalculator(data) {
    var rootEl = document.getElementById("tpCalculator");
    if (!rootEl) return;
    var sizeInputs = rootEl.querySelectorAll('input[name="tpSize"]');
    var list = rootEl.querySelector("#tpCheckList");
    var out = rootEl.querySelector("#tpBundleOut");
    var status = rootEl.querySelector("#tpBundleStatus");
    var form = rootEl.querySelector("#tpBundleForm");
    var selected = selectedMap(data.products);
    var size = "2";

    list.innerHTML = data.categories.map(function (cat) {
      var items = data.products.filter(function (p) { return p.category === cat.id; });
      return (
        '<fieldset class="tp-checks"><legend>' +
        esc(cat.name) +
        "</legend>" +
        items.map(function (product) {
          return (
            '<label class="tp-check"><input type="checkbox" data-sku="' +
            esc(product.id) +
            '"' +
            (selected[product.id] ? " checked" : "") +
            "> <span>" +
            esc(product.name) +
            "</span></label>"
          );
        }).join("") +
        "</fieldset>"
      );
    }).join("");

    function currentSize() {
      var picked = rootEl.querySelector('input[name="tpSize"]:checked');
      return picked ? picked.value : "2";
    }

    function render() {
      size = currentSize();
      var ebay = bundleFor(data.products, size, "ebay", selected);
      var walmart = bundleFor(data.products, size, "walmart", selected);
      out.innerHTML = bundleHtml(ebay) + bundleHtml(walmart);
      out.dataset.ebayCents = String(ebay.totalCents);
      out.dataset.walmartCents = String(walmart.totalCents);
      out.dataset.size = size;
    }

    sizeInputs.forEach(function (input) {
      input.addEventListener("change", render);
    });
    list.addEventListener("change", function (event) {
      var box = event.target.closest("[data-sku]");
      if (!box) return;
      selected[box.getAttribute("data-sku")] = box.checked;
      render();
    });

    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var email = form.querySelector('[name="email"]').value.trim();
        var name = form.querySelector('[name="name"]').value.trim();
        var consent = form.querySelector('[name="consent"]').checked;
        if (!consent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          status.textContent = "Add a valid email and confirm Andrew may reply. Nothing was sent.";
          status.className = "tp-status is-bad";
          return;
        }
        var payload = {
          kind: "turnover-bundle",
          name: name,
          email: email,
          size: size,
          ebaySubtotalCents: Number(out.dataset.ebayCents || 0),
          walmartSubtotalCents: Number(out.dataset.walmartCents || 0),
          items: data.products.filter(function (p) { return selected[p.id]; }).map(function (p) {
            return { id: p.id, name: p.name, qty: p.qty[size] };
          }),
          interest: "yield-map-waitlist,landlord-software",
          exampleData: !!(data.meta && data.meta.exampleData),
          utm: utmFields(),
          page: location.pathname,
        };
        var body = [
          "Email me this turnover bundle",
          "Name: " + (name || "(not given)"),
          "Email: " + email,
          "Unit size: " + size + " bedroom",
          "eBay subtotal (example if labeled): " + moneyFromCents(payload.ebaySubtotalCents),
          "Walmart subtotal (example if labeled): " + moneyFromCents(payload.walmartSubtotalCents),
          "Items:",
          payload.items.map(function (item) { return "- " + item.qty + " × " + item.name; }).join("\n"),
          "Interest: Yield Map waitlist and landlord software list.",
          "Example data: " + (payload.exampleData ? "yes" : "no"),
        ].join("\n");
        var cfg = readConfig();
        var mail = mailtoLink(cfg.contactEmail, "Turnover bundle — " + size + " BR", body);
        status.textContent = "Sending…";
        status.className = "tp-status";
        postIntake(payload).then(function (result) {
          if (result.ok) {
            status.innerHTML = "Request sent to Andrew. It is also on the landlord-software interest note in that message.";
            status.className = "tp-status is-ok";
            form.reset();
            return;
          }
          status.innerHTML = 'No form endpoint is configured yet. <a href="' + mail + '">Email this bundle to Andrew</a>.';
          status.className = "tp-status is-ok";
        }).catch(function (err) {
          status.innerHTML = esc(err.message || "Could not send.") + ' <a href="' + mail + '">Email this bundle to Andrew</a>.';
          status.className = "tp-status is-bad";
        });
      });
    }
    render();
  }

  function mountQuote() {
    var form = document.getElementById("tpQuoteForm");
    if (!form) return;
    var status = document.getElementById("tpQuoteStatus");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var name = String(data.get("name") || "").trim();
      var email = String(data.get("email") || "").trim();
      var trade = String(data.get("trade") || "").trim();
      var zip = String(data.get("zip") || "").trim();
      var units = String(data.get("units") || "").trim();
      var timeline = String(data.get("timeline") || "").trim();
      var note = String(data.get("note") || "").trim();
      var consent = data.get("consent") === "yes";
      var photos = form.querySelector('[name="photos"]');
      var photoCount = photos && photos.files ? photos.files.length : 0;
      if (!consent || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{5}$/.test(zip) || !trade || !timeline) {
        status.textContent = "Check name, email, trade, a 5-digit ZIP, timeline, and the consent box. Nothing was sent.";
        status.className = "tp-status is-bad";
        return;
      }
      var payload = {
        kind: "contractor-quotes",
        name: name,
        email: email,
        trade: trade,
        zip: zip,
        units: units,
        timeline: timeline,
        note: note,
        photoCount: photoCount,
        paidRanking: false,
        billing: false,
        utm: utmFields(),
        page: location.pathname,
      };
      var body = [
        "Get 3 quotes",
        "Name: " + name,
        "Email: " + email,
        "Trade: " + trade,
        "ZIP: " + zip,
        "Unit count: " + units,
        "Timeline: " + timeline,
        "Note: " + (note || "(none)"),
        "Photos selected on the form: " + photoCount + " (attach them in your email app; this preview does not upload files).",
        "No contractor billing. No paid ranking.",
      ].join("\n");
      var cfg = readConfig();
      var mail = mailtoLink(cfg.contactEmail, "Quote request — " + trade + " " + zip, body);
      status.textContent = "Sending…";
      status.className = "tp-status";
      postIntake(payload).then(function (result) {
        if (result.ok && photoCount === 0) {
          status.textContent = "Request sent to Andrew. There is no charge and no paid ranking.";
          status.className = "tp-status is-ok";
          form.reset();
          return;
        }
        if (result.ok && photoCount) {
          status.innerHTML = 'Request sent without the photos. <a href="' + mail + '">Email Andrew and attach the photos</a>.';
          status.className = "tp-status is-ok";
          return;
        }
        var extra = photoCount ? " Attach the photos in that email." : "";
        status.innerHTML = 'No form endpoint is configured yet. <a href="' + mail + '">Email this quote request to Andrew</a>.' + extra;
        status.className = "tp-status is-ok";
      }).catch(function (err) {
        status.innerHTML = esc(err.message || "Could not send.") + ' <a href="' + mail + '">Email this quote request to Andrew</a>.';
        status.className = "tp-status is-bad";
      });
    });
  }

  function mountCostPage(data) {
    var mount = document.getElementById("tpCostTotals");
    if (!mount) return;
    var selected = {};
    data.products.forEach(function (product) {
      if (product.defaultOn) selected[product.id] = true;
    });
    ["1", "2", "3"].forEach(function (size) {
      var ebay = bundleFor(data.products, size, "ebay", selected);
      var walmart = bundleFor(data.products, size, "walmart", selected);
      var slot = document.getElementById("tpCost" + size);
      if (!slot) return;
      slot.innerHTML =
        '<div class="tp-blocks">' +
        '<section class="tp-retailer tp-retailer-ebay" aria-label="From eBay"><h3>From eBay</h3><p class="tp-price"><strong>' +
        moneyFromCents(ebay.totalCents) +
        '</strong></p><p class="tp-checked">Example subtotal for the checked starter list. <span class="tp-tag">EXAMPLE DATA</span></p></section>' +
        '<section class="tp-retailer tp-retailer-walmart" aria-label="From Walmart"><h3>From Walmart</h3><p class="tp-price"><strong>' +
        moneyFromCents(walmart.totalCents) +
        '</strong></p><p class="tp-govern">Price on Walmart.com at time of purchase governs.</p><p class="tp-checked">Example subtotal. <span class="tp-tag">EXAMPLE DATA</span></p></section>' +
        "</div>";
    });
  }

  function loadData() {
    var url = document.body && document.body.getAttribute("data-prices");
    if (!url) return Promise.resolve(null);
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("Could not load prices.");
      return res.json();
    });
  }

  function mountPage() {
    mountMenu();
    mountQuote();
    var pricesUrl = document.body && document.body.getAttribute("data-prices");
    if (!pricesUrl) return;
    var status = document.getElementById("tpDataStatus");
    loadData().then(function (data) {
      if (!data || !data.meta || data.meta.exampleData !== true) {
        throw new Error("This preview only renders a file marked exampleData.");
      }
      if (data.meta.priceHistory && data.meta.priceHistory.enabled) {
        throw new Error("Price history is disabled.");
      }
      var sort = document.getElementById("tpSort");
      var paint = function () { fillCatalog(data, document, sort ? sort.value : "total-asc"); };
      if (sort) sort.addEventListener("change", paint);
      paint();
      mountCalculator(data);
      mountCostPage(data);
      if (status) status.textContent = "";
    }).catch(function (err) {
      if (status) {
        status.textContent = err.message || "Could not load example prices.";
        status.className = "tp-status is-bad";
      }
    });
  }

  return {
    DISCLOSURE: DISCLOSURE,
    PRICE_HISTORY_ENABLED: PRICE_HISTORY_ENABLED,
    EBAY_MAX_AGE_MS: EBAY_MAX_AGE_MS,
    cents: cents,
    totalCents: totalCents,
    moneyFromCents: moneyFromCents,
    sortOffers: sortOffers,
    formatChecked: formatChecked,
    isStaleEbay: isStaleEbay,
    lowWindow: lowWindow,
    cheapest: cheapest,
    lineFor: lineFor,
    bundleFor: bundleFor,
    mountPage: mountPage,
  };
});
