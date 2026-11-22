/* Kentuckiana Turnover Price Check
   Renders eBay and Walmart prices in separate blocks. No blended listing cards.
   dataMode "sample" (the default) does not send people to retailers. */
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
  var WEB3FORMS_URL = "https://api.web3forms.com/submit";
  var WEB3FORMS_PLACEHOLDER = "YOUR_WEB3FORMS_ACCESS_KEY";
  var EBAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  /* Disabled. Do not enable without written permission from the retailer. */
  var PAST_COPY_ENABLED = false;

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

  function isSample() {
    var cfg = typeof window !== "undefined" ? window.TURNOVER_CONFIG : null;
    return !cfg || cfg.dataMode !== "live";
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

  function checkedLabel(iso) {
    return isSample() ? "Sample price" : formatChecked(iso);
  }

  function controlHtml(url, retailer) {
    if (isSample()) {
      return '<p class="tp-go"><button type="button" class="tp-out" disabled>Live link coming soon</button></p>';
    }
    return (
      '<p class="tp-go"><a class="tp-out" href="' +
      esc(url) +
      '" target="_blank" rel="sponsored noopener noreferrer">' +
      linkLabel(retailer) +
      "</a></p>"
    );
  }

  function isStaleEbay(iso, now) {
    var dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return true;
    return (now || Date.now()) - dt.getTime() > EBAY_MAX_AGE_MS;
  }

  function lowWindow() {
    if (!PAST_COPY_ENABLED) return null;
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
      ( !isSample() && offer.example ? ' <span class="tp-tag">EXAMPLE DATA</span>' : "") +
      "</p>" +
      '<p class="tp-price"><strong>' +
      moneyFromCents(totalCents(offer)) +
      "</strong> total <span class=\"tp-split\">" +
      moneyFromCents(cents(offer.itemPrice)) +
      " item + " +
      (ship ? moneyFromCents(ship) + " shipping" : "free shipping") +
      "</span></p>" +
      '<p class="tp-checked">' +
      esc(checkedLabel(offer.checkedAt)) +
      "</p>" +
      (retailer === "walmart"
        ? '<p class="tp-govern">Price on Walmart.com at time of purchase governs.</p>'
        : "") +
      (!isSample() && stale
        ? '<p class="tp-stale">This eBay listing is more than 6 hours old. Refresh it before treating it as current.</p>'
        : "") +
      controlHtml(offer.url, retailer) +
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
      "</td><td>" +
      controlHtml(line.offer.url, retailer) +
      disclosureHtml() +
      '<p class="tp-checked">' +
      esc(checkedLabel(line.offer.checkedAt)) +
      "</p>" +
      (!isSample() && line.offer.example ? '<p><span class="tp-tag">EXAMPLE DATA</span></p>' : "") +
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
      web3formsAccessKey: String(cfg.web3formsAccessKey || WEB3FORMS_PLACEHOLDER).trim(),
      contactEmail: cfg.contactEmail || "andrewiredale@smartrealty.us",
    };
  }

  function isPlaceholderKey(key) {
    var value = String(key || "").trim();
    return !value || value === WEB3FORMS_PLACEHOLDER;
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = "tp-status" + (kind ? " is-" + kind : "");
  }

  function bundleEstimateText(size, ebayCents, walmartCents, items) {
    var lines = (items || []).map(function (item) {
      return "- " + item.qty + " x " + item.name;
    });
    return [
      "Sample estimate",
      "Unit size: " + size + " bedroom",
      "eBay subtotal: " + moneyFromCents(ebayCents || 0),
      "Walmart subtotal: " + moneyFromCents(walmartCents || 0),
      "Items:",
      lines.join("\n") || "- none checked",
    ].join("\n");
  }

  async function submitWeb3Form(fields, deps) {
    var fetchImpl = (deps && deps.fetch) || fetch;
    var key = String((fields && fields.access_key) || (deps && deps.accessKey) || "").trim();
    if (isPlaceholderKey(key)) return { ok: false, mode: "placeholder" };
    if (fields && (fields.botcheck === true || fields.botcheck === "on")) {
      return { ok: false, mode: "bot" };
    }
    var res = await fetchImpl(WEB3FORMS_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    var data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok || data.success === false) {
      throw new Error(data.message || "Web3Forms could not send this form.");
    }
    return { ok: true, mode: "sent" };
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
        var bot = form.querySelector('[name="botcheck"]');
        var button = form.querySelector('[type="submit"]');
        if (!consent || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setStatus(status, "Add a valid email and confirm Andrew may reply. Nothing was sent.", "bad");
          return;
        }
        var cfg = readConfig();
        var items = data.products.filter(function (p) { return selected[p.id]; }).map(function (p) {
          return { id: p.id, name: p.name, qty: p.qty[size] };
        });
        var estimate = bundleEstimateText(size, Number(out.dataset.ebayCents || 0), Number(out.dataset.walmartCents || 0), items);
        var hidden = form.querySelector('[name="bundle_estimate"]');
        if (hidden) hidden.value = estimate;
        if (isPlaceholderKey(cfg.web3formsAccessKey)) {
          setStatus(status, "This form is not set up yet. Please email andrewiredale@smartrealty.us.", "bad");
          return;
        }
        button.disabled = true;
        setStatus(status, "Sending…", "");
        submitWeb3Form({
          access_key: cfg.web3formsAccessKey,
          subject: "Turnover bundle sample estimate",
          from_name: name || "Smart Realty",
          name: name,
          email: email,
          message: estimate,
          bundle_estimate: estimate,
          botcheck: !!(bot && bot.checked),
        }).then(function (result) {
          if (result.mode === "placeholder") {
            setStatus(status, "This form is not set up yet. Please email andrewiredale@smartrealty.us.", "bad");
            return;
          }
          if (result.mode === "bot") {
            setStatus(status, "Thanks. If this was a real note, email andrewiredale@smartrealty.us.", "ok");
            return;
          }
          setStatus(status, "Sent. Andrew will get this sample estimate by email.", "ok");
          form.reset();
        }).catch(function (err) {
          setStatus(status, err.message || "Could not send. Please email andrewiredale@smartrealty.us.", "bad");
        }).then(function () {
          button.disabled = false;
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
      var phone = String(data.get("phone") || "").trim();
      var locationField = String(data.get("location") || "").trim();
      var scope = String(data.get("scope") || "").trim();
      var consent = data.get("consent") === "yes";
      var bot = form.querySelector('[name="botcheck"]');
      var button = form.querySelector('[type="submit"]');
      if (!consent || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || locationField.length < 2 || scope.length < 2) {
        setStatus(status, "Check name, email, location, scope, and the consent box. Nothing was sent.", "bad");
        return;
      }
      var cfg = readConfig();
      var out = document.getElementById("tpBundleOut");
      var bundleForm = document.getElementById("tpBundleForm");
      var stored = bundleForm && bundleForm.querySelector('[name="bundle_estimate"]');
      var estimate = (stored && stored.value) || bundleEstimateText(
        (out && out.dataset.size) || "2",
        Number((out && out.dataset.ebayCents) || 0),
        Number((out && out.dataset.walmartCents) || 0),
        []
      );
      var quoteEstimate = form.querySelector('[name="bundle_estimate"]');
      if (quoteEstimate) quoteEstimate.value = estimate;
      if (isPlaceholderKey(cfg.web3formsAccessKey)) {
        setStatus(status, "This form is not set up yet. Please email andrewiredale@smartrealty.us.", "bad");
        return;
      }
      button.disabled = true;
      setStatus(status, "Sending…", "");
      submitWeb3Form({
        access_key: cfg.web3formsAccessKey,
        subject: "Get 3 quotes",
        from_name: name || "Smart Realty",
        name: name,
        email: email,
        phone: phone,
        location: locationField,
        scope: scope,
        message: ["Name: " + name, "Email: " + email, "Phone: " + (phone || "not given"), "Location: " + locationField, "Scope: " + scope, "", estimate].join("\n"),
        bundle_estimate: estimate,
        botcheck: !!(bot && bot.checked),
      }).then(function (result) {
        if (result.mode === "placeholder") {
          setStatus(status, "This form is not set up yet. Please email andrewiredale@smartrealty.us.", "bad");
          return;
        }
        if (result.mode === "bot") {
          setStatus(status, "Thanks. If this was a real request, email andrewiredale@smartrealty.us.", "ok");
          return;
        }
        setStatus(status, "Sent. Andrew will reply about quotes. There is no charge and no paid ranking.", "ok");
        form.reset();
      }).catch(function (err) {
        setStatus(status, err.message || "Could not send. Please email andrewiredale@smartrealty.us.", "bad");
      }).then(function () {
        button.disabled = false;
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
        '</strong></p><p class="tp-checked">' +
        esc(checkedLabel(data.meta.generatedAt)) +
        "</p></section>" +
        '<section class="tp-retailer tp-retailer-walmart" aria-label="From Walmart"><h3>From Walmart</h3><p class="tp-price"><strong>' +
        moneyFromCents(walmart.totalCents) +
        '</strong></p><p class="tp-govern">Price on Walmart.com at time of purchase governs.</p><p class="tp-checked">' +
        esc(checkedLabel(data.meta.generatedAt)) +
        "</p></section>" +
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
      if (!data || !data.meta) throw new Error("Could not read the price file.");
      if (isSample() && data.meta.exampleData !== true) {
        throw new Error("Sample mode only renders the sample file.");
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
    PAST_COPY_ENABLED: PAST_COPY_ENABLED,
    isSample: isSample,
    checkedLabel: checkedLabel,
    controlHtml: controlHtml,
    EBAY_MAX_AGE_MS: EBAY_MAX_AGE_MS,
    cents: cents,
    totalCents: totalCents,
    moneyFromCents: moneyFromCents,
    sortOffers: sortOffers,
    setStatus: setStatus,
    isPlaceholderKey: isPlaceholderKey,
    submitWeb3Form: submitWeb3Form,
    bundleEstimateText: bundleEstimateText,
    WEB3FORMS_URL: WEB3FORMS_URL,
    WEB3FORMS_PLACEHOLDER: WEB3FORMS_PLACEHOLDER,
    isStaleEbay: isStaleEbay,
    lowWindow: lowWindow,
    cheapest: cheapest,
    lineFor: lineFor,
    bundleFor: bundleFor,
    mountPage: mountPage,
  };
});
