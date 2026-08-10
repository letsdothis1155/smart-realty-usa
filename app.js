/* ============================================
   Smart Realty USA — Interactive Application
   ============================================ */

// Inventory lives in js/properties.js (single source of truth)
const PROPERTIES = window.SRU_PROPERTIES || [];
const DEFAULT_COORDS = window.SRU_DEFAULT_COORDS || {};
if (!PROPERTIES.length) {
  console.warn("[Smart Realty] js/properties.js missing or empty — load it before app.js");
}



const RECENT_KEY = "sru_recent_searches";
const POPULAR_MARKETS = [
  "Las Vegas",
  "Austin",
  "Miami",
  "Seattle",
  "Denver",
  "Nashville",
  "Beverly Hills",
  "Chicago",
];

// Enrich inventory with demo amenities / facts (does not rewrite base objects)
const AMENITY_POOL = {
  mansion: ["Chef kitchen", "Wine cellar", "Home theater", "Pool", "Smart home", "Guest wing"],
  vegas: ["Infinity pool", "Strip views", "Outdoor kitchen", "EV chargers", "Spa", "Club room"],
  modern: ["Floor-to-ceiling glass", "Radiant floors", "Solar ready", "Office loft", "Rooftop deck"],
  family: ["Fenced yard", "Garage", "Near schools", "Updated kitchen", "Laundry room", "Quiet street"],
  waterfront: ["Water views", "Dock access", "Balcony", "Elevator", "Concierge", "Gym"],
};

function propertyGallery(p) {
  const list = Array.isArray(p.images) && p.images.length ? p.images.slice() : [];
  if (p.image && !list.includes(p.image)) list.unshift(p.image);
  if (!list.length && p.image) list.push(p.image);
  // de-dupe while preserving order
  const seen = new Set();
  return list.filter((src) => {
    if (!src || seen.has(src)) return false;
    seen.add(src);
    return true;
  });
}

function enrichProperty(p) {
  if (p._enriched) return p;
  const tags = p.tags || [];
  const amenities = new Set();
  tags.forEach((t) => (AMENITY_POOL[t] || []).forEach((a) => amenities.add(a)));
  if (p.rentable) amenities.add("Furnished stay ready");
  amenities.add("Blue Book verified");
  amenities.add("Bitcoin escrow OK");
  // Deterministic year / HOA from id hash
  const n = parseInt(String(p.id).replace(/\D/g, ""), 10) || 1;
  p.yearBuilt = p.yearBuilt || 1998 + (n % 26);
  p.hoaMonthly = p.hoaMonthly != null ? p.hoaMonthly : n % 3 === 0 ? 0 : 85 + (n % 12) * 40;
  p.lotSqft = p.lotSqft || Math.round(p.sqft * (1.4 + (n % 5) * 0.15));
  p.propertyType =
    p.propertyType ||
    (tags.includes("mansion")
      ? "Estate"
      : tags.includes("waterfront") && p.beds <= 3
        ? "Condo / Loft"
        : tags.includes("family")
          ? "Single family"
          : "Luxury residence");
  p.amenities = p.amenities || [...amenities].slice(0, 8);
  p.pricePerSqft = Math.round(p.offer / p.sqft);
  // Normalize multi-photo gallery (primary image first)
  p.images = propertyGallery(p);
  if (p.images[0]) p.image = p.images[0];
  p._enriched = true;
  return p;
}

PROPERTIES.forEach(enrichProperty);

// Live BTC pricing — multi-stream WebSocket + fast REST (display always tracks LIVE spot)
let btcRate = 0; // live spot used everywhere (updates every tick)
let btcRateGecko = 0; // reference only (24h change)
let btcRateCoinbase = 0;
let btcRateBinance = 0;
let btcRatePrev = 0;
let btcChange24h = null;
let btcLastUpdated = null;
let btcStreamMode = "connecting"; // live | polling | offline
let btcTickCount = 0;
let btcSessionOpen = null;
let btcLastSource = "";
const btcPriceHistory = [];
const BTC_HISTORY_MAX = 120;
const QUOTE_SECONDS = 15 * 60;
const FAST_POLL_MS = 900; // ~1s REST so UI always ticks even if WS blocked
const GECKO_REFRESH_MS = 60 * 1000;
const WS_COINBASE = "wss://ws-feed.exchange.coinbase.com";
const WS_BINANCE = "wss://stream.binance.com:9443/ws/btcusdt@trade";

const DEMO_GATE_KEY = "sru_demo_unlocked";

// ---------- Utilities ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function formatUSD(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatBTC(n) {
  // Extra precision so live USD ticks visibly change home-in-BTC amounts
  return `${n.toFixed(6)} BTC`;
}

function savings(p) {
  return p.listPrice - p.offer;
}

function savingsPct(p) {
  return Math.round(((p.listPrice - p.offer) / p.listPrice) * 100);
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3200);
}

// ---------- Listings / marketplace ----------
let activeFilter = "all";
let viewMode = "grid"; // grid | list | split
let favorites = new Set(JSON.parse(localStorage.getItem("sru_favs") || "[]"));
let compareSet = new Set(JSON.parse(localStorage.getItem("sru_compare") || "[]"));
let searchState = {
  query: "",
  priceMin: 0,
  priceMax: 0,
  beds: 0,
  rentableOnly: false,
  sort: "featured",
};

const MAX_COMPARE = 3;

function persistCompare() {
  localStorage.setItem("sru_compare", JSON.stringify([...compareSet]));
}

function toggleCompare(id) {
  if (compareSet.has(id)) {
    compareSet.delete(id);
  } else {
    if (compareSet.size >= MAX_COMPARE) {
      toast(`Compare up to ${MAX_COMPARE} homes — remove one first.`);
      return false;
    }
    compareSet.add(id);
  }
  persistCompare();
  updateCompareBar();
  updateFavBadge();
  return true;
}

function pricePerSqft(p) {
  return Math.round(p.offer / p.sqft);
}

function getCoords(p) {
  if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  return DEFAULT_COORDS[p.id] || { lat: 36.1, lng: -115.1 };
}

function btcForOffer(offer) {
  if (!btcRate) return null;
  return offer / btcRate;
}

function getFilteredProperties() {
  const q = searchState.query.trim().toLowerCase();
  let list = PROPERTIES.filter((p) => {
    if (activeFilter === "rentable") {
      if (!p.rentable) return false;
    } else if (activeFilter !== "all" && !p.tags.includes(activeFilter)) {
      return false;
    }
    if (searchState.rentableOnly && !p.rentable) return false;
    if (searchState.beds && p.beds < searchState.beds) return false;
    if (searchState.priceMin && p.offer < searchState.priceMin) return false;
    if (searchState.priceMax && p.offer > searchState.priceMax) return false;
    if (q) {
      const hay = `${p.title} ${p.location} ${p.desc} ${p.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sort = searchState.sort;
  list = [...list].sort((a, b) => {
    if (sort === "price-asc") return a.offer - b.offer;
    if (sort === "price-desc") return b.offer - a.offer;
    if (sort === "savings") return savings(b) - savings(a);
    if (sort === "sqft") return b.sqft - a.sqft;
    if (sort === "btc") {
      if (!btcRate) return a.offer - b.offer;
      return btcForOffer(a.offer) - btcForOffer(b.offer);
    }
    // featured: savings % then price
    return savingsPct(b) - savingsPct(a) || a.offer - b.offer;
  });

  return list;
}

function listingCardHtml(p) {
  enrichProperty(p);
  const save = savings(p);
  const pct = savingsPct(p);
  const fav = favorites.has(p.id);
  const inCompare = compareSet.has(p.id);
  const btcAmt = btcForOffer(p.offer);
  const btcLine = btcAmt
    ? `<div class="price-row btc-live"><span>Pay in Bitcoin (live)</span><strong>₿ ${btcAmt.toFixed(6)}</strong></div>`
    : `<div class="price-row btc-live"><span>Pay in Bitcoin (live)</span><strong class="btc-loading">loading…</strong></div>`;

  const photoCount = propertyGallery(p).length;
  return `
      <article class="listing-card reveal" data-id="${p.id}">
        <div class="listing-media">
          <img src="${p.image}" alt="${p.title}" loading="lazy" decoding="async" />
          <div class="listing-badges">
            <span class="badge gold">Blue Book</span>
            <span class="badge btc">₿ BTC OK</span>
            ${p.rentable ? `<span class="badge rent">Try Before Buy</span>` : ""}
            <span class="badge save">Save ${pct}%</span>
          </div>
          ${
            photoCount > 1
              ? `<span class="photo-count-badge" aria-label="${photoCount} photos">${photoCount} photos</span>`
              : ""
          }
          <button class="listing-fav ${fav ? "active" : ""}" type="button" data-fav="${p.id}" aria-label="${fav ? "Remove from saved" : "Save home"}" aria-pressed="${fav}">
            ${fav ? "♥" : "♡"}
          </button>
          <label class="compare-check ${inCompare ? "on" : ""}" title="Compare">
            <input type="checkbox" data-compare="${p.id}" ${inCompare ? "checked" : ""} />
            <span>Compare</span>
          </label>
        </div>
        <div class="listing-body">
          <div class="listing-loc">📍 ${p.location}</div>
          <h3 class="listing-title">${p.title}</h3>
          <div class="listing-type">${p.propertyType} · Built ${p.yearBuilt}</div>
          <div class="listing-meta">
            <span>🛏 ${p.beds} beds</span>
            <span>🛁 ${p.baths} baths</span>
            <span>📐 ${p.sqft.toLocaleString()} sqft</span>
            <span>💵 ${formatUSD(pricePerSqft(p))}/ft²</span>
          </div>
          <div class="price-stack">
            <div class="price-row strike"><span>List price</span><strong>${formatUSD(p.listPrice)}</strong></div>
            <div class="price-row"><span>House Blue Book</span><strong>${formatUSD(p.blueBook)}</strong></div>
            <div class="price-row offer"><span>Lowest offer</span><strong>${formatUSD(p.offer)}</strong></div>
            <div class="price-row"><span>You save</span><strong style="color:var(--success)">${formatUSD(save)}</strong></div>
            ${btcLine}
          </div>
          <div class="listing-actions">
            <button class="btn btn-ghost" type="button" data-view="${p.id}">View Details</button>
            <button class="btn btn-btc" type="button" data-btc="${p.id}">₿ Buy with BTC</button>
          </div>
        </div>
      </article>`;
}

function renderMarketStats(filtered) {
  const el = $("#marketStats");
  if (!el) return;
  const list = filtered || getFilteredProperties();
  if (!list.length) {
    el.innerHTML = `<div class="mstat"><span>Results</span><strong>0</strong></div>`;
    return;
  }
  const offers = list.map((p) => p.offer);
  const min = Math.min(...offers);
  const max = Math.max(...offers);
  const avg = Math.round(offers.reduce((a, b) => a + b, 0) / offers.length);
  const avgSave = Math.round(list.reduce((a, p) => a + savingsPct(p), 0) / list.length);
  const rentable = list.filter((p) => p.rentable).length;
  el.innerHTML = `
    <div class="mstat"><span>Showing</span><strong>${list.length}</strong></div>
    <div class="mstat"><span>From</span><strong>${formatUSD(min)}</strong></div>
    <div class="mstat"><span>To</span><strong>${formatUSD(max)}</strong></div>
    <div class="mstat"><span>Avg offer</span><strong>${formatUSD(avg)}</strong></div>
    <div class="mstat"><span>Avg savings</span><strong>${avgSave}%</strong></div>
    <div class="mstat"><span>Try-before-buy</span><strong>${rentable}</strong></div>
  `;
}

function updateFavBadge() {
  const badge = $("#favCount");
  if (badge) {
    badge.textContent = String(favorites.size);
    badge.classList.toggle("hidden", favorites.size === 0);
  }
  const cbadge = $("#compareCount");
  if (cbadge) {
    cbadge.textContent = String(compareSet.size);
    cbadge.classList.toggle("hidden", compareSet.size === 0);
  }
}

function renderFavoritesDrawer() {
  const body = $("#favDrawerBody");
  if (!body) return;
  const items = [...favorites]
    .map((id) => PROPERTIES.find((p) => p.id === id))
    .filter(Boolean);
  if (!items.length) {
    body.innerHTML = `<div class="drawer-empty">
      <p>No saved homes yet.</p>
      <p class="muted">Tap ♥ on any listing to build your shortlist.</p>
      <a href="#listings" class="btn btn-primary btn-sm" id="favBrowse">Browse homes</a>
    </div>`;
    return;
  }
  body.innerHTML = items
    .map(
      (p) => `
    <article class="drawer-card">
      <img src="${p.image}" alt="" />
      <div>
        <strong>${p.title}</strong>
        <p>${p.location}</p>
        <p class="drawer-price">${formatUSD(p.offer)}</p>
        <div class="drawer-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-view="${p.id}">View</button>
          <button type="button" class="btn btn-btc btn-sm" data-btc="${p.id}">BTC</button>
          <button type="button" class="btn btn-ghost btn-sm" data-fav="${p.id}">Remove</button>
        </div>
      </div>
    </article>`
    )
    .join("");
}

function openFavDrawer() {
  renderFavoritesDrawer();
  $("#favDrawer")?.classList.add("open");
  $("#favDrawer")?.setAttribute("aria-hidden", "false");
  $("#drawerBackdrop")?.classList.add("open");
}

function closeFavDrawer() {
  $("#favDrawer")?.classList.remove("open");
  $("#favDrawer")?.setAttribute("aria-hidden", "true");
  $("#drawerBackdrop")?.classList.remove("open");
}

function updateCompareBar() {
  const bar = $("#compareBar");
  if (!bar) return;
  const items = [...compareSet]
    .map((id) => PROPERTIES.find((p) => p.id === id))
    .filter(Boolean);
  if (!items.length) {
    bar.classList.add("hidden");
    bar.innerHTML = "";
    return;
  }
  bar.classList.remove("hidden");
  bar.innerHTML = `
    <div class="compare-bar-inner container">
      <div class="compare-thumbs">
        ${items
          .map(
            (p) => `
          <div class="compare-thumb">
            <img src="${p.image}" alt="" />
            <button type="button" data-compare-remove="${p.id}" aria-label="Remove">×</button>
            <span>${formatUSD(p.offer)}</span>
          </div>`
          )
          .join("")}
        ${Array.from({ length: MAX_COMPARE - items.length })
          .map(() => `<div class="compare-thumb empty">+</div>`)
          .join("")}
      </div>
      <div class="compare-bar-actions">
        <span>${items.length} / ${MAX_COMPARE} selected</span>
        <button type="button" class="btn btn-primary btn-sm" id="openCompareModal" ${items.length < 2 ? "disabled" : ""}>Compare</button>
        <button type="button" class="btn btn-ghost btn-sm" id="clearCompare">Clear</button>
      </div>
    </div>`;
}

function openCompareModal() {
  const items = [...compareSet]
    .map((id) => PROPERTIES.find((p) => p.id === id))
    .filter(Boolean);
  if (items.length < 2) {
    toast("Select at least 2 homes to compare.");
    return;
  }
  const body = $("#compareModalBody");
  if (!body) return;
  const rows = [
    ["Photo", (p) => `<img src="${p.image}" alt="${p.title}" class="cmp-img" />`],
    ["Home", (p) => `<strong>${p.title}</strong>`],
    ["Location", (p) => p.location],
    ["Type", (p) => p.propertyType],
    ["Offer", (p) => `<span class="cmp-offer">${formatUSD(p.offer)}</span>`],
    ["List", (p) => formatUSD(p.listPrice)],
    ["Blue Book", (p) => formatUSD(p.blueBook)],
    ["You save", (p) => `${formatUSD(savings(p))} (${savingsPct(p)}%)`],
    ["BTC (live)", (p) => (btcRate ? formatBTC(p.offer / btcRate) : "…")],
    ["Beds / Baths", (p) => `${p.beds} / ${p.baths}`],
    ["Sqft", (p) => p.sqft.toLocaleString()],
    ["$/sqft", (p) => formatUSD(pricePerSqft(p))],
    ["Year", (p) => p.yearBuilt],
    ["HOA / mo", (p) => (p.hoaMonthly ? formatUSD(p.hoaMonthly) : "None")],
    ["Try before buy", (p) => (p.rentable ? `Yes · ${formatUSD(p.nightly)}/night` : "No")],
  ];
  body.innerHTML = `
    <h2>Compare homes</h2>
    <p class="modal-loc">Side-by-side Blue Book transparency</p>
    <div class="compare-table-wrap">
      <table class="compare-table">
        <tbody>
          ${rows
            .map(
              ([label, fn]) => `
            <tr>
              <th>${label}</th>
              ${items.map((p) => `<td>${fn(p)}</td>`).join("")}
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="modal-actions" style="margin-top:1rem">
      ${items.map((p) => `<button type="button" class="btn btn-ghost btn-sm" data-view="${p.id}">Open ${p.title.split(" ")[0]}…</button>`).join("")}
    </div>`;
  $("#compareModal")?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

async function shareListing(p, channel) {
  const cfg = getConfig();
  const base = (cfg.siteUrl || window.location.href.split("#")[0]).replace(/\/$/, "");
  const url = `${base}/?home=${encodeURIComponent(p.id)}#listings`;
  const btc = btcRate ? ` · ${formatBTC(p.offer / btcRate)}` : "";
  const text = `${p.title} — ${formatUSD(p.offer)}${btc}\n${p.location}\nBlue Book ${formatUSD(p.blueBook)} · Save ${savingsPct(p)}%\n${url}`;
  const intent = channel || "auto";
  track("share_listing", { id: p.id, channel: intent });

  if (intent === "x" || intent === "twitter") {
    const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `${p.title} · ${formatUSD(p.offer)} · Smart Realty Blue Book`
    )}&url=${encodeURIComponent(url)}`;
    window.open(tw, "_blank", "noopener,width=560,height=480");
    toast("Share on X opened.");
    return;
  }
  if (intent === "copy" || intent === "link") {
    try {
      await navigator.clipboard.writeText(url);
      toast("Listing link copied.");
    } catch {
      toast("Copy failed.");
    }
    return;
  }

  try {
    if (navigator.share) {
      await navigator.share({ title: p.title, text, url });
      toast("Share sheet opened.");
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Listing summary copied — paste anywhere.");
  } catch {
    toast("Could not share — copy failed.");
  }
}

function initGrowthMarkets() {
  const chips = $("#growthMarketChips");
  const kpis = $("#growthKpis");
  if (!chips || !kpis) return;

  const cities = [
    ...new Set(
      PROPERTIES.map((p) => {
        const parts = (p.location || "").split(",");
        return (parts[parts.length - 2] || parts[0] || "").trim().replace(/\d+/g, "").trim();
      }).filter(Boolean)
    ),
  ].slice(0, 14);

  chips.innerHTML = cities
    .map(
      (c) =>
        `<button type="button" class="growth-chip" data-search="${escapeAttr(c)}">${escapeHtml(c)}</button>`
    )
    .join("");
  chips.querySelectorAll("[data-search]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = $("#searchQuery");
      if (q) {
        q.value = btn.dataset.search;
        searchState.query = btn.dataset.search;
        saveRecentSearch(btn.dataset.search);
        renderListings();
        document.getElementById("listings")?.scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  const offers = PROPERTIES.map((p) => p.offer);
  const avg = offers.reduce((a, b) => a + b, 0) / offers.length;
  const rentable = PROPERTIES.filter((p) => p.rentable).length;
  const saved = Math.round(
    PROPERTIES.reduce((a, p) => a + (p.listPrice - p.offer), 0) / PROPERTIES.length
  );
  kpis.innerHTML = `
    <div class="growth-kpi-item"><strong>${PROPERTIES.length}</strong><span>Listings</span></div>
    <div class="growth-kpi-item"><strong>${cities.length}+</strong><span>Markets</span></div>
    <div class="growth-kpi-item"><strong>${formatUSD(avg)}</strong><span>Avg offer</span></div>
    <div class="growth-kpi-item"><strong>${rentable}</strong><span>Try-before-buy</span></div>
    <div class="growth-kpi-item"><strong>${formatUSD(saved)}</strong><span>Avg list→offer save</span></div>
  `;
}

function initWaitlist() {
  const form = $("#waitlistForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#waitlistMsg");
    const btn = $("#waitlistBtn");
    const email = $("#waitlistEmail")?.value?.trim();
    const name = $("#waitlistName")?.value?.trim() || "";
    if (!email) return;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Joining…";
    try {
      if (window.SRU_AUTH?.submitLead && window.SRU_AUTH.apiBase()) {
        const data = await window.SRU_AUTH.submitLead({
          email,
          name,
          source: "homepage_waitlist",
          interest: "launch_updates",
        });
        msg.textContent = data.message || "You're on the list.";
      } else {
        // Offline / static preview — store locally
        const key = "sru_waitlist_local";
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        if (!list.includes(email)) list.push(email);
        localStorage.setItem(key, JSON.stringify(list));
        msg.textContent = "Saved on this device (API offline). On GoDaddy, leads hit api/leads.php.";
      }
      msg.classList.remove("hidden");
      msg.classList.add("ok");
      form.reset();
      toast("Waitlist joined.");
      track("waitlist_join", { email_domain: (email.split("@")[1] || "").slice(0, 40) });
    } catch (err) {
      msg.textContent = err.message || "Could not join — try again.";
      msg.classList.remove("hidden");
      msg.classList.remove("ok");
      track("waitlist_error");
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}

function openDeepLinkedHome() {
  const params = new URLSearchParams(location.search);
  const home = params.get("home");
  if (home && PROPERTIES.some((p) => p.id === home)) {
    setTimeout(() => openProperty(home), 400);
  }
}

/** Live OpenStreetMap map (Leaflet) — falls back to pin plot if Leaflet missing */
let sruLeafletMap = null;
let sruLeafletLayer = null;

function destroyLeafletMap() {
  if (sruLeafletMap) {
    try {
      sruLeafletMap.remove();
    } catch {
      /* ignore */
    }
    sruLeafletMap = null;
    sruLeafletLayer = null;
  }
}

function renderMap(filtered) {
  const canvas = $("#mapCanvas");
  const sub = $("#mapSub");
  if (!canvas) return;

  if (!filtered.length) {
    destroyLeafletMap();
    canvas.innerHTML = `<div class="map-empty">No homes match — adjust filters.</div>`;
    if (sub) sub.textContent = "0 pins";
    return;
  }

  // Prefer live tiles when Leaflet is loaded
  if (typeof L !== "undefined") {
    renderLeafletMap(filtered, canvas, sub);
    return;
  }

  // Fallback: abstract pin plot (no CDN)
  destroyLeafletMap();
  const lats = filtered.map((p) => getCoords(p).lat);
  const lngs = filtered.map((p) => getCoords(p).lng);
  const minLat = Math.min(...lats) - 0.5;
  const maxLat = Math.max(...lats) + 0.5;
  const minLng = Math.min(...lngs) - 0.5;
  const maxLng = Math.max(...lngs) + 0.5;

  canvas.innerHTML = filtered
    .map((p) => {
      const { lat, lng } = getCoords(p);
      const top = 100 - ((lat - minLat) / (maxLat - minLat || 1)) * 100;
      const left = ((lng - minLng) / (maxLng - minLng || 1)) * 100;
      const btcAmt = btcForOffer(p.offer);
      const label = btcAmt ? `₿${btcAmt.toFixed(2)}` : formatUSD(p.offer);
      return `
        <button type="button" class="map-pin" style="top:${Math.min(92, Math.max(6, top))}%;left:${Math.min(92, Math.max(6, left))}%"
          data-view="${p.id}" title="${p.title} — ${formatUSD(p.offer)}">
          <span class="map-pin-dot"></span>
          <span class="map-pin-label">${label}</span>
        </button>`;
    })
    .join("");

  if (sub) sub.textContent = `${filtered.length} pin${filtered.length === 1 ? "" : "s"} · offline plot`;
}

function renderLeafletMap(filtered, canvas, sub) {
  // Ensure map host div
  let host = canvas.querySelector("#leafletHost");
  if (!host) {
    canvas.innerHTML = `<div id="leafletHost" class="leaflet-host"></div>`;
    host = canvas.querySelector("#leafletHost");
    destroyLeafletMap();
  }

  if (!sruLeafletMap) {
    sruLeafletMap = L.map(host, {
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(sruLeafletMap);
    // Enable wheel zoom after click (desktop UX)
    host.addEventListener("click", () => {
      if (sruLeafletMap && !sruLeafletMap.scrollWheelZoom.enabled()) {
        sruLeafletMap.scrollWheelZoom.enable();
      }
    });
  }

  if (sruLeafletLayer) {
    sruLeafletLayer.clearLayers();
  } else {
    sruLeafletLayer = L.layerGroup().addTo(sruLeafletMap);
  }

  const bounds = [];
  const priceIcon = (label) =>
    L.divIcon({
      className: "sru-map-marker",
      html: `<span class="sru-map-bubble">${label}</span>`,
      iconSize: [88, 28],
      iconAnchor: [44, 28],
    });

  filtered.forEach((p) => {
    const { lat, lng } = getCoords(p);
    bounds.push([lat, lng]);
    const btcAmt = btcForOffer(p.offer);
    const label = btcAmt ? `₿${btcAmt.toFixed(2)}` : formatUSD(p.offer);
    const marker = L.marker([lat, lng], { icon: priceIcon(label) });
    marker.bindPopup(
      `<div class="sru-popup">
        <strong>${escapeHtml(p.title)}</strong><br/>
        <span>${escapeHtml(p.location)}</span><br/>
        <span class="sru-popup-price">${formatUSD(p.offer)}</span>
        <button type="button" class="sru-popup-btn" data-view="${p.id}">View home</button>
      </div>`,
      { maxWidth: 240 }
    );
    marker.on("popupopen", () => {
      document.querySelector(`.sru-popup-btn[data-view="${p.id}"]`)?.addEventListener(
        "click",
        () => openProperty(p.id),
        { once: true }
      );
    });
    sruLeafletLayer.addLayer(marker);
  });

  if (bounds.length === 1) {
    sruLeafletMap.setView(bounds[0], 11);
  } else if (bounds.length > 1) {
    sruLeafletMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
  }

  // Leaflet needs a kick after layout changes (split view)
  setTimeout(() => {
    try {
      sruLeafletMap?.invalidateSize();
    } catch {
      /* ignore */
    }
  }, 120);

  if (sub) {
    sub.textContent = `${filtered.length} pin${filtered.length === 1 ? "" : "s"} · live OSM tiles`;
  }
}

function renderListings() {
  const grid = $("#listingsGrid");
  if (!grid) return;

  const filtered = getFilteredProperties();
  const countEl = $("#resultsCount");
  if (countEl) {
    countEl.textContent = `${filtered.length} home${filtered.length === 1 ? "" : "s"}`;
  }

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-results glass">
        <h3>No homes match</h3>
        <p>Try <strong>Las Vegas</strong>, <strong>Austin</strong>, or <strong>Miami</strong> — or clear filters for all ${PROPERTIES.length} homes.</p>
        <div class="empty-actions">
          <button type="button" class="btn btn-primary" id="clearFiltersBtn">Clear filters</button>
          <button type="button" class="btn btn-ghost" data-search="Las Vegas">Try Las Vegas</button>
        </div>
      </div>`;
    renderMap([]);
    $("#clearFiltersBtn")?.addEventListener("click", clearMarketFilters);
    return;
  }

  grid.innerHTML = filtered.map(listingCardHtml).join("");
  renderMap(filtered);
  renderMarketStats(filtered);
  renderActiveFilters();
  updateFavBadge();
  updateCompareBar();
  observeReveals();
}

function clearMarketFilters() {
  searchState = {
    query: "",
    priceMin: 0,
    priceMax: 0,
    beds: 0,
    rentableOnly: false,
    sort: "featured",
  };
  activeFilter = "all";
  const q = $("#searchQuery");
  if (q) q.value = "";
  if ($("#filterPriceMin")) $("#filterPriceMin").value = "0";
  if ($("#filterPriceMax")) $("#filterPriceMax").value = "0";
  if ($("#filterBeds")) $("#filterBeds").value = "0";
  if ($("#sortBy")) $("#sortBy").value = "featured";
  if ($("#filterRentable")) $("#filterRentable").checked = false;
  $$("#styleFilters .filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "all"));
  updateSearchClearBtn();
  hideSuggest();
  renderActiveFilters();
  renderListings();
  toast("Filters cleared.");
}

function setViewMode(mode) {
  viewMode = mode;
  const layout = $("#marketLayout");
  if (layout) layout.dataset.mode = mode;
  $$(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.viewMode === mode));
  // Leaflet needs a resize when map panel becomes visible
  setTimeout(() => {
    try {
      sruLeafletMap?.invalidateSize();
    } catch {
      /* ignore */
    }
  }, 200);
}

function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter(Boolean).slice(0, 6);
  } catch {
    return [];
  }
}

function saveRecentSearch(term) {
  const t = (term || "").trim();
  if (!t || t.length < 2) return;
  const next = [t, ...getRecentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  renderRecentSearches();
}

function renderRecentSearches() {
  const wrap = $("#recentSearches");
  const chips = $("#recentChips");
  if (!wrap || !chips) return;
  const recent = getRecentSearches();
  if (!recent.length) {
    wrap.classList.add("hidden");
    chips.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  chips.innerHTML = recent
    .map((r) => `<button type="button" class="chip recent-chip" data-search="${escapeAttr(r)}">${escapeHtml(r)}</button>`)
    .join("");
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function updateSearchClearBtn() {
  const btn = $("#searchClear");
  const q = $("#searchQuery")?.value || "";
  if (!btn) return;
  btn.classList.toggle("hidden", !q.trim());
}

function renderQuickCities() {
  const el = $("#quickCities");
  if (!el) return;
  el.innerHTML = POPULAR_MARKETS.map(
    (c) => `<button type="button" class="chip city-chip" data-search="${escapeAttr(c)}">${escapeHtml(c)}</button>`
  ).join("");
}

function renderActiveFilters() {
  const el = $("#activeFilters");
  if (!el) return;
  const pills = [];
  if (searchState.query.trim()) {
    pills.push({ key: "query", label: `Search: ${searchState.query.trim()}` });
  }
  if (activeFilter !== "all") {
    const labels = {
      mansion: "Mansions",
      vegas: "Vegas Style",
      modern: "Modern",
      family: "Family",
      waterfront: "Waterfront",
      rentable: "Try Before Buy",
    };
    pills.push({ key: "style", label: labels[activeFilter] || activeFilter });
  }
  if (searchState.priceMin) pills.push({ key: "min", label: `Min ${formatUSD(searchState.priceMin)}` });
  if (searchState.priceMax) pills.push({ key: "max", label: `Max ${formatUSD(searchState.priceMax)}` });
  if (searchState.beds) pills.push({ key: "beds", label: `${searchState.beds}+ beds` });
  if (searchState.rentableOnly) pills.push({ key: "rent", label: "Try Before Buy" });
  if (searchState.sort && searchState.sort !== "featured") {
    const sortLabels = {
      "price-asc": "Price ↑",
      "price-desc": "Price ↓",
      savings: "Biggest savings",
      sqft: "Largest",
      btc: "Lowest BTC",
    };
    pills.push({ key: "sort", label: sortLabels[searchState.sort] || searchState.sort });
  }

  if (!pills.length) {
    el.innerHTML = "";
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML =
    pills.map((p) => `<span class="active-pill" data-remove="${p.key}">${escapeHtml(p.label)} <button type="button" aria-label="Remove">×</button></span>`).join("") +
    `<button type="button" class="btn-text" id="clearFiltersInline">Clear all</button>`;
}

function removeActiveFilter(key) {
  if (key === "query") {
    searchState.query = "";
    if ($("#searchQuery")) $("#searchQuery").value = "";
  } else if (key === "style") {
    activeFilter = "all";
    $$("#styleFilters .filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "all"));
  } else if (key === "min") {
    searchState.priceMin = 0;
    if ($("#filterPriceMin")) $("#filterPriceMin").value = "0";
  } else if (key === "max") {
    searchState.priceMax = 0;
    if ($("#filterPriceMax")) $("#filterPriceMax").value = "0";
  } else if (key === "beds") {
    searchState.beds = 0;
    if ($("#filterBeds")) $("#filterBeds").value = "0";
  } else if (key === "rent") {
    searchState.rentableOnly = false;
    if ($("#filterRentable")) $("#filterRentable").checked = false;
  } else if (key === "sort") {
    searchState.sort = "featured";
    if ($("#sortBy")) $("#sortBy").value = "featured";
  }
  updateSearchClearBtn();
  renderActiveFilters();
  renderListings();
}

function buildSuggestions(query) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 1) {
    // When empty + focused: show popular + recent
    const recent = getRecentSearches().map((r) => ({ type: "Recent", label: r, value: r }));
    const popular = POPULAR_MARKETS.map((c) => ({ type: "Market", label: c, value: c }));
    return [...recent, ...popular].slice(0, 8);
  }

  const items = [];
  const seen = new Set();

  // Cities / locations
  PROPERTIES.forEach((p) => {
    const loc = p.location;
    const city = loc.split(",")[0].trim();
    [loc, city].forEach((label) => {
      const key = label.toLowerCase();
      if (key.includes(q) && !seen.has(key)) {
        seen.add(key);
        items.push({ type: "Location", label, value: city });
      }
    });
  });

  // Home titles
  PROPERTIES.forEach((p) => {
    if (p.title.toLowerCase().includes(q) && !seen.has(p.id)) {
      seen.add(p.id);
      items.push({ type: "Home", label: p.title, value: p.title, id: p.id });
    }
  });

  // Tags / styles
  ["mansion", "vegas", "modern", "family", "waterfront"].forEach((tag) => {
    if (tag.includes(q) || (q.length >= 2 && tag.startsWith(q))) {
      items.push({ type: "Style", label: tag.charAt(0).toUpperCase() + tag.slice(1), value: tag, filter: tag });
    }
  });

  return items.slice(0, 8);
}

function hideSuggest() {
  const box = $("#searchSuggest");
  const input = $("#searchQuery");
  if (box) {
    box.classList.add("hidden");
    box.innerHTML = "";
  }
  if (input) input.setAttribute("aria-expanded", "false");
}

function showSuggest(items) {
  const box = $("#searchSuggest");
  const input = $("#searchQuery");
  if (!box || !input) return;
  if (!items.length) {
    hideSuggest();
    return;
  }
  box.innerHTML = items
    .map(
      (it, i) => `
      <button type="button" class="suggest-item" role="option" data-idx="${i}"
        data-value="${escapeAttr(it.value)}"
        ${it.filter ? `data-filter="${escapeAttr(it.filter)}"` : ""}
        ${it.id ? `data-open-id="${escapeAttr(it.id)}"` : ""}>
        <span class="suggest-type">${escapeHtml(it.type)}</span>
        <span class="suggest-label">${escapeHtml(it.label)}</span>
      </button>`
    )
    .join("");
  box.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");
  box._items = items;
}

function applySearchValue(value, { filter, openId, save } = {}) {
  if (filter) {
    activeFilter = filter;
    $$("#styleFilters .filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === filter));
  }
  if (value != null) {
    searchState.query = value;
    if ($("#searchQuery")) $("#searchQuery").value = value;
  }
  if (save !== false && searchState.query.trim()) saveRecentSearch(searchState.query);
  updateSearchClearBtn();
  hideSuggest();
  renderActiveFilters();
  renderListings();
  if (openId) openProperty(openId);
}

function flashPriceEl(el, direction) {
  if (!el) return;
  el.classList.remove("flash-up", "flash-down", "flash-tick");
  void el.offsetWidth;
  if (direction === "up") el.classList.add("flash-up");
  else if (direction === "down") el.classList.add("flash-down");
  else el.classList.add("flash-tick");
}

/** Write a live price into an element and force a visible flash whenever digits change */
function setLivePriceText(el, text, direction) {
  if (!el) return;
  const prev = el.textContent;
  el.textContent = text;
  if (prev !== text && prev && prev !== "—" && prev !== "Loading…") {
    flashPriceEl(el, direction || "up");
  } else if (direction) {
    flashPriceEl(el, direction);
  }
}

function pushPriceHistory(price) {
  if (!price || price <= 0) return;
  const last = btcPriceHistory[btcPriceHistory.length - 1];
  // throttle tiny noise for sparkline density
  if (last && Math.abs(last - price) < 0.05 && btcPriceHistory.length > 5) {
    btcPriceHistory[btcPriceHistory.length - 1] = price;
  } else {
    btcPriceHistory.push(price);
  }
  while (btcPriceHistory.length > BTC_HISTORY_MAX) btcPriceHistory.shift();
  drawSparkline("#btcSpark", 120, 28);
  drawSparkline("#btcSparkLg", 280, 64);
}

function drawSparkline(sel, w, h) {
  const svg = $(sel);
  if (!svg || btcPriceHistory.length < 2) return;
  const data = btcPriceHistory;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = data[data.length - 1] >= data[0];
  const color = up ? "#3ecf8e" : "#ff6b7a";
  const fill = up ? "rgba(62,207,142,0.15)" : "rgba(255,107,122,0.12)";
  const area = `${pad},${h - pad} ${pts.join(" ")} ${w - pad},${h - pad}`;
  svg.innerHTML = `
    <polyline points="${area}" fill="${fill}" stroke="none" />
    <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx="${pts[pts.length - 1].split(",")[0]}" cy="${pts[pts.length - 1].split(",")[1]}" r="2.4" fill="${color}" />
  `;
}

function pushTickFeed(price, delta) {
  const feed = $("#btcTickFeed");
  if (!feed) return;
  const up = delta >= 0;
  const row = document.createElement("div");
  row.className = `tick-row ${up ? "up" : "down"}`;
  row.innerHTML = `<span>${new Date().toLocaleTimeString()}</span>
    <strong>${formatUsdPrecise(price)}</strong>
    <span>${up ? "▲" : "▼"} ${formatUsdPrecise(Math.abs(delta))}</span>`;
  feed.prepend(row);
  while (feed.children.length > 8) feed.lastChild.remove();
}

function updateStreamBadge() {
  const badge = $("#streamBadge");
  const label = $("#btcLiveLabel");
  const map = {
    live: "LIVE",
    polling: "POLLING",
    connecting: "CONNECTING",
    offline: "OFFLINE",
  };
  if (badge) {
    badge.textContent = map[btcStreamMode] || "…";
    badge.className = `stream-badge mode-${btcStreamMode}`;
  }
  if (label) {
    label.textContent =
      btcStreamMode === "live"
        ? "Coinbase stream live"
        : btcStreamMode === "polling"
          ? "REST polling"
          : btcStreamMode === "offline"
            ? "Offline fallback"
            : "Connecting stream…";
  }
  $("#btcTicker")?.classList.toggle("is-live", btcStreamMode === "live");
}

/**
 * Apply a new LIVE spot price. Always drives btcRate (display),
 * never freezes on a higher stale CoinGecko max.
 */
function applyLiveSpot(price, source = "stream") {
  const next = Number(price);
  if (!Number.isFinite(next) || next <= 0) return;

  if (source === "binance") btcRateBinance = next;
  if (source === "coinbase" || source === "rest" || source === "stream") btcRateCoinbase = next;
  if (source === "gecko") {
    btcRateGecko = next;
    // Gecko is reference only — do not override live spot if we already have one
    if (btcRate > 0 && (btcStreamMode === "live" || btcRateCoinbase > 0 || btcRateBinance > 0)) {
      btcLastUpdated = new Date();
      updateBtcTicker({ direction: null, delta: 0, source: "gecko" });
      return;
    }
  }

  const prev = btcRate;
  // Prefer freshest live venues for the number users see
  if (source === "binance" || source === "coinbase" || source === "stream" || source === "rest") {
    btcRate = next;
  } else if (!btcRate) {
    btcRate = next;
  }

  btcLastUpdated = new Date();
  btcLastSource = source;
  if (btcSessionOpen == null) btcSessionOpen = btcRate;

  const delta = prev ? btcRate - prev : 0;
  // Flash on any visible cent move (or first paint)
  let direction = null;
  if (!prev) direction = null;
  else if (delta > 0.005) direction = "up";
  else if (delta < -0.005) direction = "down";
  else if (Math.abs(delta) > 0) direction = delta > 0 ? "up" : "down";

  // Always refresh UI when digits change OR it's a stream tick
  const prevText = formatUsdPrecise(prev || 0);
  const nextText = formatUsdPrecise(btcRate);
  const changed = prevText !== nextText || Math.abs(delta) >= 0.01;

  if (source === "binance" || source === "coinbase" || source === "stream") {
    btcStreamMode = "live";
    lastStreamAt = Date.now();
  } else if (btcStreamMode !== "live") {
    btcStreamMode = "polling";
  }

  if (changed || source === "stream" || source === "binance" || source === "coinbase") {
    pushPriceHistory(btcRate);
    updateBtcTicker({
      direction: direction || (changed ? "up" : null),
      delta,
      source,
      forceFlash: changed,
    });
    updateBtcQuote({ direction: direction || (changed ? "up" : null) });
    updateAffordCalculator();
    updateLiveListingBtc(direction || (changed ? "up" : null));
    updateLiveModalBtc(direction);
    updateLiveMapBtc();

    if (changed && Math.abs(delta) >= 0.01) {
      pushTickFeed(btcRate, delta);
      btcTickCount += 1;
    }
  } else {
    // still bump "updated" clock
    const updated = $("#tickerUpdated");
    if (updated) {
      updated.textContent = `${btcStreamMode} · ${btcLastUpdated.toLocaleTimeString()} · ${btcTickCount} ticks · ${btcLastSource}`;
    }
  }

  btcRatePrev = btcRate;
  updateStreamBadge();
}

// Back-compat alias used by older call sites
function onBtcPriceTick({ source = "stream" } = {}) {
  if (btcRateCoinbase > 0) applyLiveSpot(btcRateCoinbase, source === "rest" ? "rest" : "coinbase");
  else if (btcRateBinance > 0) applyLiveSpot(btcRateBinance, "binance");
  else if (btcRateGecko > 0) applyLiveSpot(btcRateGecko, "gecko");
}

function updateLiveListingBtc(direction) {
  $$(".price-row.btc-live strong").forEach((el) => {
    const card = el.closest(".listing-card");
    if (!card || !btcRate) return;
    const p = PROPERTIES.find((x) => x.id === card.dataset.id);
    if (!p) return;
    // 6 decimals so micro moves in USD show up as BTC amount flicker
    const next = `₿ ${(p.offer / btcRate).toFixed(6)}`;
    const prev = el.textContent;
    el.classList.remove("btc-loading");
    if (prev !== next) {
      el.textContent = next;
      flashPriceEl(el, direction || "up");
      card.classList.add("btc-pulse");
      setTimeout(() => card.classList.remove("btc-pulse"), 400);
    }
  });
}

function updateLiveModalBtc(direction) {
  const modal = document.getElementById("propertyModal");
  if (!modal || modal.classList.contains("hidden") || !btcRate) return;
  const modalBtc = modal.querySelector(".btc-line strong");
  const title = modal.querySelector("h2")?.textContent;
  const p = PROPERTIES.find((x) => x.title === title);
  if (!p || !modalBtc) return;
  const next = formatBTC(p.offer / btcRate);
  if (modalBtc.textContent !== next) {
    modalBtc.textContent = next;
    if (direction) flashPriceEl(modalBtc, direction);
  }
}

function updateLiveMapBtc() {
  if (!btcRate) return;
  $$(".map-pin-label").forEach((el) => {
    const btn = el.closest("[data-view]");
    if (!btn) return;
    const p = PROPERTIES.find((x) => x.id === btn.dataset.view);
    if (p) el.textContent = `₿${(p.offer / btcRate).toFixed(3)}`;
  });
}

function updateBtcTicker({ direction = null, delta = 0, source = "", forceFlash = false } = {}) {
  const price = $("#tickerBtcPrice");
  const change = $("#tickerBtcChange");
  const gecko = $("#tickerGecko");
  const coinbase = $("#tickerCoinbase");
  const updated = $("#tickerUpdated");
  const tickDelta = $("#tickerTickDelta");
  const board = $("#boardBtcPrice");
  const session = $("#boardSession");

  const text = btcRate ? formatUsdPrecise(btcRate) : "Loading…";
  if (price) setLivePriceText(price, text, forceFlash || direction ? direction || "up" : null);
  if (board) setLivePriceText(board, btcRate ? formatUsdPrecise(btcRate) : "—", forceFlash || direction ? direction || "up" : null);

  // Always re-apply flash class when forced (even same direction spam)
  if (forceFlash && direction) {
    flashPriceEl(price, direction);
    flashPriceEl(board, direction);
  }

  if (gecko) gecko.textContent = btcRateGecko ? formatUsdPrecise(btcRateGecko) : "—";
  if (coinbase) {
    const live = btcRateBinance || btcRateCoinbase || btcRate;
    setLivePriceText(coinbase, live ? formatUsdPrecise(live) : "—", direction);
  }
  if (change) {
    if (btcChange24h != null) {
      const up = btcChange24h >= 0;
      change.textContent = `${up ? "▲" : "▼"} ${Math.abs(btcChange24h).toFixed(2)}% 24h`;
      change.className = `ticker-change ${up ? "up" : "down"}`;
    } else {
      change.textContent = "—";
      change.className = "ticker-change";
    }
  }
  if (tickDelta && direction && Math.abs(delta) >= 0.01) {
    tickDelta.textContent = `${direction === "up" ? "+" : "−"}${formatUsdPrecise(Math.abs(delta))}`;
    tickDelta.className = `ticker-tick ${direction}`;
    flashPriceEl(tickDelta, direction);
  }
  if (session && btcSessionOpen && btcRate) {
    const pct = ((btcRate - btcSessionOpen) / btcSessionOpen) * 100;
    session.textContent = `session ${pct >= 0 ? "+" : ""}${pct.toFixed(3)}%`;
    session.className = `board-session ${pct >= 0 ? "up" : "down"}`;
  }
  if (updated && btcLastUpdated) {
    updated.textContent = `${btcStreamMode} · ${btcLastSource || source} · ${btcLastUpdated.toLocaleTimeString()} · ${btcTickCount} ticks`;
  }
  updateStreamBadge();
}

function initMarketplace() {
  const form = $("#marketSearchForm");
  if (!form) return;

  renderQuickCities();
  renderRecentSearches();
  renderActiveFilters();

  const syncFromForm = () => {
    searchState.query = $("#searchQuery")?.value || "";
    searchState.priceMin = Number($("#filterPriceMin")?.value || 0);
    searchState.priceMax = Number($("#filterPriceMax")?.value || 0);
    searchState.beds = Number($("#filterBeds")?.value || 0);
    searchState.rentableOnly = Boolean($("#filterRentable")?.checked);
    searchState.sort = $("#sortBy")?.value || "featured";
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    syncFromForm();
    if (searchState.query.trim()) saveRecentSearch(searchState.query);
    hideSuggest();
    renderActiveFilters();
    renderListings();
    toast(`Showing homes for “${searchState.query || "all markets"}”.`);
  });

  ["filterPriceMin", "filterPriceMax", "filterBeds", "sortBy", "filterRentable"].forEach((id) => {
    $(`#${id}`)?.addEventListener("change", () => {
      syncFromForm();
      renderActiveFilters();
      renderListings();
    });
  });

  $("#resetFiltersBtn")?.addEventListener("click", clearMarketFilters);

  const input = $("#searchQuery");
  let t;
  input?.addEventListener("input", () => {
    updateSearchClearBtn();
    clearTimeout(t);
    t = setTimeout(() => {
      syncFromForm();
      showSuggest(buildSuggestions(input.value));
      renderActiveFilters();
      renderListings();
    }, 180);
  });

  input?.addEventListener("focus", () => {
    showSuggest(buildSuggestions(input.value));
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideSuggest();
  });

  $("#searchClear")?.addEventListener("click", () => {
    if ($("#searchQuery")) $("#searchQuery").value = "";
    searchState.query = "";
    updateSearchClearBtn();
    hideSuggest();
    renderActiveFilters();
    renderListings();
    $("#searchQuery")?.focus();
  });

  // Suggestion / chip clicks
  document.addEventListener("click", (e) => {
    const suggest = e.target.closest(".suggest-item");
    if (suggest) {
      applySearchValue(suggest.dataset.value, {
        filter: suggest.dataset.filter,
        openId: suggest.dataset.openId,
      });
      return;
    }
    const chip = e.target.closest("[data-search]");
    if (chip && (chip.classList.contains("city-chip") || chip.classList.contains("recent-chip"))) {
      applySearchValue(chip.dataset.search);
      toast(`Searching “${chip.dataset.search}”`);
      return;
    }
    const pill = e.target.closest(".active-pill");
    if (pill?.dataset.remove) {
      removeActiveFilter(pill.dataset.remove);
      return;
    }
    if (e.target.id === "clearFiltersInline" || e.target.closest("#clearFiltersInline")) {
      clearMarketFilters();
      return;
    }
    if (e.target.id === "clearRecent") {
      localStorage.removeItem(RECENT_KEY);
      renderRecentSearches();
      return;
    }
    // Click outside search closes suggest
    if (!e.target.closest("#searchFieldWrap")) hideSuggest();
  });

  $$(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => setViewMode(btn.dataset.viewMode));
  });

  updateSearchClearBtn();
}

function renderRentals() {
  const grid = $("#rentalGrid");
  const rentables = PROPERTIES.filter((p) => p.rentable).slice(0, 8);
  grid.innerHTML = rentables
    .map(
      (p) => `
    <article class="rental-card reveal">
      <img src="${p.image}" alt="${p.title}" loading="lazy" />
      <div class="rental-body">
        <span class="credit-tag">${p.creditPercent}% purchase credit</span>
        <div class="loc">📍 ${p.location}</div>
        <h4>${p.title}</h4>
        <div class="rental-price">
          <strong>${formatUSD(p.nightly)}</strong>
          <span>/ night · then buy</span>
        </div>
        <button class="btn btn-primary btn-block" type="button" data-rent="${p.id}">Book Stay</button>
      </div>
    </article>`
    )
    .join("");
  observeReveals();
}

// ---------- Property modal + multi-photo gallery ----------
function galleryHeroHtml(p) {
  const gallery = propertyGallery(p);
  const n = gallery.length;
  const slides = gallery
    .map(
      (src, i) => `
      <figure class="gallery-slide${i === 0 ? " is-active" : ""}" data-gallery-index="${i}">
        <img src="${src}" alt="${escapeHtml(p.title)} — photo ${i + 1} of ${n}" ${
        i === 0 ? "" : 'loading="lazy"'
      } decoding="async" />
      </figure>`
    )
    .join("");
  const thumbs =
    n > 1
      ? `<div class="gallery-thumbs" role="tablist" aria-label="Photo thumbnails">
      ${gallery
        .map(
          (src, i) => `
        <button type="button" class="gallery-thumb${i === 0 ? " is-active" : ""}" role="tab"
          data-gallery-goto="${i}" aria-label="Show photo ${i + 1}" aria-selected="${i === 0}">
          <img src="${src}" alt="" loading="lazy" decoding="async" />
        </button>`
        )
        .join("")}
    </div>`
      : "";
  const controls =
    n > 1
      ? `
    <button type="button" class="gallery-nav gallery-prev" data-gallery-nav="-1" aria-label="Previous photo">‹</button>
    <button type="button" class="gallery-nav gallery-next" data-gallery-nav="1" aria-label="Next photo">›</button>
    <div class="gallery-counter" aria-live="polite"><span data-gallery-current>1</span> / ${n}</div>
    <div class="gallery-dots" role="tablist" aria-label="Photos">
      ${gallery
        .map(
          (_, i) =>
            `<button type="button" class="gallery-dot${i === 0 ? " is-active" : ""}" data-gallery-goto="${i}" aria-label="Photo ${i + 1}"></button>`
        )
        .join("")}
    </div>`
      : "";

  return `
    <div class="modal-hero gallery-hero" data-gallery-root data-gallery-count="${n}">
      <div class="gallery-stage">
        ${slides}
      </div>
      <div class="modal-hero-overlay">
        <span class="badge gold">Save ${savingsPct(p)}%</span>
        <span class="badge btc">₿ ready</span>
        ${n > 1 ? `<span class="badge gallery-badge">${n} photos</span>` : ""}
      </div>
      ${controls}
      ${thumbs}
    </div>`;
}

function wirePropertyGallery(root) {
  if (!root) return;
  const total = Number(root.dataset.galleryCount) || 1;
  if (total <= 1) return;
  let index = 0;

  const setIndex = (next) => {
    index = ((next % total) + total) % total;
    root.querySelectorAll(".gallery-slide").forEach((el, i) => {
      el.classList.toggle("is-active", i === index);
    });
    root.querySelectorAll(".gallery-thumb").forEach((el, i) => {
      el.classList.toggle("is-active", i === index);
      el.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    root.querySelectorAll(".gallery-dot").forEach((el, i) => {
      el.classList.toggle("is-active", i === index);
    });
    const cur = root.querySelector("[data-gallery-current]");
    if (cur) cur.textContent = String(index + 1);
  };

  root.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-gallery-nav]");
    if (nav) {
      e.preventDefault();
      setIndex(index + Number(nav.dataset.galleryNav));
      return;
    }
    const goto = e.target.closest("[data-gallery-goto]");
    if (goto) {
      e.preventDefault();
      setIndex(Number(goto.dataset.galleryGoto));
    }
  });

  // Swipe on stage
  const stage = root.querySelector(".gallery-stage");
  if (stage) {
    let startX = 0;
    stage.addEventListener(
      "touchstart",
      (e) => {
        startX = e.changedTouches[0]?.clientX || 0;
      },
      { passive: true }
    );
    stage.addEventListener(
      "touchend",
      (e) => {
        const dx = (e.changedTouches[0]?.clientX || 0) - startX;
        if (Math.abs(dx) < 40) return;
        setIndex(index + (dx < 0 ? 1 : -1));
      },
      { passive: true }
    );
  }

  // Keyboard when modal open
  const onKey = (e) => {
    if ($("#propertyModal")?.classList.contains("hidden")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setIndex(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setIndex(index - 1);
    }
  };
  document.addEventListener("keydown", onKey);
  // Clean previous handler if re-opening
  if (wirePropertyGallery._onKey) {
    document.removeEventListener("keydown", wirePropertyGallery._onKey);
  }
  wirePropertyGallery._onKey = onKey;
}

function openProperty(id) {
  const p = PROPERTIES.find((x) => x.id === id);
  if (!p) return;
  enrichProperty(p);
  track("view_listing", { id: p.id, title: p.title, offer: p.offer });
  const fav = favorites.has(p.id);
  const body = $("#propertyModalBody");
  const amenityHtml = (p.amenities || [])
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join("");
  body.innerHTML = `
    ${galleryHeroHtml(p)}
    <div class="modal-content">
      <div class="listing-badges" style="position:static;margin-bottom:0.75rem">
        <span class="badge gold">Transparent Pricing</span>
        <span class="badge btc">Bitcoin Ready</span>
        ${p.rentable ? `<span class="badge rent">Try Before Buy</span>` : ""}
        <span class="badge">${escapeHtml(p.propertyType)}</span>
      </div>
      <h2>${p.title}</h2>
      <p class="modal-loc">📍 ${p.location} · ${p.beds} bed · ${p.baths} bath · ${p.sqft.toLocaleString()} sqft · ${formatUSD(pricePerSqft(p))}/ft²</p>
      <div class="modal-price-grid">
        <div class="mp-cell"><span>List</span><strong>${formatUSD(p.listPrice)}</strong></div>
        <div class="mp-cell"><span>Blue Book</span><strong>${formatUSD(p.blueBook)}</strong></div>
        <div class="mp-cell offer"><span>Our Offer</span><strong>${formatUSD(p.offer)}</strong></div>
      </div>
      <div class="fact-grid">
        <div><span>Year built</span><strong>${p.yearBuilt}</strong></div>
        <div><span>Lot</span><strong>${p.lotSqft.toLocaleString()} ft²</strong></div>
        <div><span>HOA</span><strong>${p.hoaMonthly ? formatUSD(p.hoaMonthly) + "/mo" : "None"}</strong></div>
        <div><span>You save</span><strong style="color:var(--success)">${formatUSD(savings(p))}</strong></div>
      </div>
      <p class="modal-desc">${p.desc}</p>
      <div class="amenity-block">
        <h4>Highlights</h4>
        <ul class="amenity-list">${amenityHtml}</ul>
      </div>
      <p class="modal-desc btc-line">
        BTC equivalent (live): <strong style="color:var(--btc)">${
          btcRate ? formatBTC(p.offer / btcRate) : "loading…"
        }</strong>
        ${btcRate ? `at ${formatUsdPrecise(btcRate)} / BTC (best live rate)` : "· fetching market rates…"}
      </p>
      <div class="pay-estimator glass" id="payEstimator" data-price="${p.offer}">
        <h4>Payment estimator <span class="pay-est-tag">demo</span></h4>
        <div class="pay-est-row">
          <label>Down payment %
            <input type="range" id="payDown" min="5" max="50" value="20" />
            <span id="payDownLabel">20%</span>
          </label>
          <label>Rate %
            <input type="range" id="payRate" min="3" max="10" step="0.1" value="6.5" />
            <span id="payRateLabel">6.5%</span>
          </label>
          <label>Term
            <select id="payTerm">
              <option value="15">15 years</option>
              <option value="30" selected>30 years</option>
            </select>
          </label>
        </div>
        <div class="pay-est-results">
          <div><span>Down</span><strong id="payDownAmt">—</strong></div>
          <div><span>Loan</span><strong id="payLoanAmt">—</strong></div>
          <div class="offer"><span>Est. monthly*</span><strong id="payMonthly">—</strong></div>
          <div><span>≈ BTC / mo</span><strong id="payMonthlyBtc" style="color:var(--btc)">—</strong></div>
        </div>
        <p class="pay-est-note">*Illustrative P&amp;I only — not a loan offer. Taxes/insurance extra.</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-btc" type="button" data-btc="${p.id}">₿ Purchase with Bitcoin</button>
        ${
          p.rentable
            ? `<button class="btn btn-outline" type="button" data-rent="${p.id}">Book Try-Before-Buy Stay</button>`
            : ""
        }
        <button class="btn btn-ghost" type="button" id="shareProperty">Share</button>
        <button class="btn btn-ghost" type="button" id="sharePropertyX" title="Share on X">Share 𝕏</button>
        <button class="btn btn-ghost" type="button" id="sharePropertyLink" title="Copy link">Copy link</button>
        <button class="btn btn-ghost" type="button" id="favFromModal" data-fav="${p.id}">${fav ? "♥ Saved" : "♡ Save"}</button>
        <button class="btn btn-ghost" type="button" id="compareFromModal" data-compare-btn="${p.id}">${compareSet.has(p.id) ? "✓ In compare" : "＋ Compare"}</button>
        <button class="btn btn-ghost" type="button" id="askAboutProperty">Ask Live Human</button>
      </div>
    </div>`;
  $("#propertyModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";

  pushRecentView(p.id);
  wirePayEstimator(p.offer);
  wirePropertyGallery(body.querySelector("[data-gallery-root]"));

  $("#askAboutProperty")?.addEventListener("click", () => {
    closeModals();
    openChat(`I'm interested in ${p.title}. Can you walk me through Blue Book pricing and Bitcoin checkout?`);
  });
  $("#shareProperty")?.addEventListener("click", () => shareListing(p));
  $("#sharePropertyX")?.addEventListener("click", () => shareListing(p, "x"));
  $("#sharePropertyLink")?.addEventListener("click", () => shareListing(p, "copy"));
  $("#compareFromModal")?.addEventListener("click", () => {
    toggleCompare(p.id);
    openProperty(p.id); // refresh labels
  });
}

function wirePayEstimator(price) {
  const down = $("#payDown");
  const rate = $("#payRate");
  const term = $("#payTerm");
  if (!down || !rate || !term) return;

  const update = () => {
    const dPct = Number(down.value) || 20;
    const rPct = Number(rate.value) || 6.5;
    const years = Number(term.value) || 30;
    $("#payDownLabel").textContent = `${dPct}%`;
    $("#payRateLabel").textContent = `${rPct}%`;
    const downAmt = price * (dPct / 100);
    const loan = Math.max(0, price - downAmt);
    const monthly = mortgagePI(loan, rPct, years);
    $("#payDownAmt").textContent = formatUSD(downAmt);
    $("#payLoanAmt").textContent = formatUSD(loan);
    $("#payMonthly").textContent = formatUSD(monthly);
    if (btcRate && monthly > 0) {
      $("#payMonthlyBtc").textContent = formatBTC(monthly / btcRate);
    } else {
      $("#payMonthlyBtc").textContent = "—";
    }
  };
  down.addEventListener("input", update);
  rate.addEventListener("input", update);
  term.addEventListener("change", update);
  update();
}

/** Standard P&I mortgage payment */
function mortgagePI(principal, annualRatePct, years) {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

const RECENT_VIEWS_KEY = "sru_recent_views";

function getRecentViews() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_VIEWS_KEY) || "[]").filter(Boolean);
  } catch {
    return [];
  }
}

function pushRecentView(id) {
  const next = [id, ...getRecentViews().filter((x) => x !== id)].slice(0, 8);
  localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(next));
  renderRecentViews();
}

function renderRecentViews() {
  const wrap = $("#recentViews");
  const rail = $("#recentViewsRail");
  if (!wrap || !rail) return;
  const ids = getRecentViews();
  const items = ids.map((id) => PROPERTIES.find((p) => p.id === id)).filter(Boolean);
  if (!items.length) {
    wrap.classList.add("hidden");
    rail.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  rail.innerHTML = items
    .map(
      (p) => `
    <button type="button" class="recent-view-card" data-view="${p.id}">
      <img src="${p.image}" alt="" loading="lazy" />
      <div>
        <strong>${escapeHtml(p.title)}</strong>
        <span>${formatUSD(p.offer)}</span>
      </div>
    </button>`
    )
    .join("");
}

function initContactLeadForm() {
  const form = $("#contactLeadForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#contactLeadMsg");
    const btn = $("#contactLeadBtn");
    const email = $("#contactEmail")?.value?.trim();
    const name = $("#contactName")?.value?.trim() || "";
    const interest = $("#contactInterest")?.value || "general";
    const note = $("#contactMsg")?.value?.trim() || "";
    if (!email) return;
    btn.disabled = true;
    try {
      const interestLabel = note ? `${interest}: ${note.slice(0, 100)}` : interest;
      if (window.SRU_AUTH?.submitLead && window.SRU_AUTH.apiBase()) {
        const data = await window.SRU_AUTH.submitLead({
          email,
          name,
          source: "support_contact",
          interest: interestLabel,
        });
        msg.textContent = data.message || "Sent — we’ll be in touch.";
      } else {
        const key = "sru_contact_local";
        const list = JSON.parse(localStorage.getItem(key) || "[]");
        list.push({ email, name, interest: interestLabel, at: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(list));
        msg.textContent = "Saved on this device (API offline). On GoDaddy this emails + stores the lead.";
      }
      msg.classList.remove("hidden");
      msg.classList.add("ok");
      form.reset();
      toast("Concierge request sent.");
      track("contact_submit", { interest });
    } catch (err) {
      msg.textContent = err.message || "Could not send.";
      msg.classList.remove("hidden");
      msg.classList.remove("ok");
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Rental modal ----------
function openRental(id) {
  const p = PROPERTIES.find((x) => x.id === id);
  if (!p || !p.rentable) return;
  const body = $("#rentalModalBody");
  body.innerHTML = `
    <div class="modal-hero">
      <img src="${p.image}" alt="${p.title}" />
    </div>
    <div class="modal-content">
      <span class="credit-tag">${p.creditPercent}% of stay credits toward purchase</span>
      <h2>Stay at ${p.title}</h2>
      <p class="modal-loc">Airbnb-style preview · ${p.location}</p>
      <p class="modal-desc">${p.desc}</p>
      <form class="rental-form" id="rentalForm">
        <div class="form-row">
          <label>Check-in
            <input type="date" id="rentIn" required />
          </label>
          <label>Check-out
            <input type="date" id="rentOut" required />
          </label>
        </div>
        <label>Guests
          <select id="rentGuests">
            <option>1</option><option selected>2</option><option>4</option><option>6</option><option>8+</option>
          </select>
        </label>
        <div class="rental-summary" id="rentalSummary">
          <div><span>Nightly rate</span><strong>${formatUSD(p.nightly)}</strong></div>
          <div><span>Nights</span><strong id="rentNights">—</strong></div>
          <div><span>Stay total</span><strong id="rentTotal">—</strong></div>
          <div><span>Purchase credit</span><strong id="rentCredit" style="color:var(--gold)">—</strong></div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Confirm Stay Reservation</button>
      </form>
    </div>`;
  $("#rentalModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const today = new Date();
  const inEl = $("#rentIn");
  const outEl = $("#rentOut");
  inEl.min = today.toISOString().slice(0, 10);
  outEl.min = today.toISOString().slice(0, 10);
  inEl.value = today.toISOString().slice(0, 10);
  const outDate = new Date(today);
  outDate.setDate(outDate.getDate() + 5);
  outEl.value = outDate.toISOString().slice(0, 10);

  const updateSummary = () => {
    const a = new Date(inEl.value);
    const b = new Date(outEl.value);
    const nights = Math.max(0, Math.round((b - a) / 86400000));
    const total = nights * p.nightly;
    const credit = Math.round(total * (p.creditPercent / 100));
    $("#rentNights").textContent = nights || "—";
    $("#rentTotal").textContent = nights ? formatUSD(total) : "—";
    $("#rentCredit").textContent = nights ? formatUSD(credit) : "—";
  };
  inEl.addEventListener("change", updateSummary);
  outEl.addEventListener("change", updateSummary);
  updateSummary();

  $("#rentalForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const nights = $("#rentNights").textContent;
    closeModals();
    toast(`Stay reserved at ${p.title} for ${nights} nights. A human concierge will confirm shortly.`);
    openChat(`I just reserved a try-before-buy stay at ${p.title}. Can you confirm availability and purchase credit terms?`);
  });
}

function closeModals() {
  $("#propertyModal")?.classList.add("hidden");
  $("#rentalModal")?.classList.add("hidden");
  $("#compareModal")?.classList.add("hidden");
  $("#dunsModal")?.classList.add("hidden");
  document.body.style.overflow = "";
}

function initHeroPanel() {
  const p = PROPERTIES[0];
  if (!p) return;
  if ($("#heroPanelImg")) {
    $("#heroPanelImg").src = p.image;
    $("#heroPanelImg").alt = p.title;
  }
  if ($("#heroPanelTitle")) $("#heroPanelTitle").textContent = p.title;
  if ($("#heroPanelLoc")) $("#heroPanelLoc").textContent = `📍 ${p.location}`;
  if ($("#heroPanelBb")) $("#heroPanelBb").textContent = formatUSD(p.blueBook);
  if ($("#heroPanelOffer")) $("#heroPanelOffer").textContent = formatUSD(p.offer);
  const view = $("#heroPanelView");
  const btc = $("#heroPanelBtc");
  if (view) view.dataset.view = p.id;
  if (btc) btc.dataset.btc = p.id;
}

function initDunsGuide() {
  const open = () => {
    $("#dunsModal")?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  };
  const close = () => {
    $("#dunsModal")?.classList.add("hidden");
    document.body.style.overflow = "";
  };
  $("#openDunsGuide")?.addEventListener("click", open);
  $("#closeDunsModal")?.addEventListener("click", close);
  $("#dunsModal")?.addEventListener("click", (e) => {
    if (e.target.id === "dunsModal") close();
  });

  // Persist checklist checks
  $$("#dunsChecklist input[type=checkbox]").forEach((box) => {
    const key = `sru_${box.id}`;
    box.checked = localStorage.getItem(key) === "1";
    box.addEventListener("change", () => {
      localStorage.setItem(key, box.checked ? "1" : "0");
    });
  });
}

// ---------- Blue Book ----------
function initBlueBook() {
  $("#blueBookForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const address = $("#bbAddress").value.trim();
    const beds = $("#bbBeds").value;
    const baths = $("#bbBaths").value;
    const sqft = Number($("#bbSqft").value) || 4000;

    // Deterministic demo valuation from inputs
    const base = 420 + (sqft % 180);
    const bedMult = { 3: 0.92, 4: 1, 5: 1.12, "6+": 1.28 }[beds] || 1;
    const bathMult = { 2: 0.95, 3: 1, 4: 1.08, "5+": 1.18 }[baths] || 1;
    const locBoost = /vegas|nv|las/i.test(address) ? 1.18 : /beverly|atherton|malibu|ca/i.test(address) ? 1.45 : 1.05;
    const blueBook = Math.round(sqft * base * bedMult * bathMult * locBoost);
    const list = Math.round(blueBook * 1.08);
    const offer = Math.round(blueBook * 0.96);
    const save = list - offer;

    const result = $("#bbResult");
    result?.classList.remove("hidden");
    // Animate count-up for interactivity
    animateCount($("#bbValue"), blueBook, formatUSD);
    animateCount($("#bbOffer"), offer, formatUSD);
    animateCount($("#bbSavings"), save, formatUSD);
    result?.classList.add("bb-pop");
    setTimeout(() => result?.classList.remove("bb-pop"), 600);
    toast("Your free House Blue Book estimate is ready.");
    // Live BTC for this estimate
    if (btcRate) {
      const btcLine = document.getElementById("bbBtcLine");
      if (btcLine) {
        btcLine.textContent = `≈ ${formatBTC(offer / btcRate)} at live rate ${formatUsdPrecise(btcRate)}/BTC`;
        btcLine.classList.remove("hidden");
      }
    }
  });
}

function animateCount(el, target, formatter, ms = 650) {
  if (!el) return;
  const start = performance.now();
  const from = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + (target - from) * eased);
    el.textContent = formatter(val);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = formatter(target);
  };
  requestAnimationFrame(step);
}

// ---------- Bitcoin checkout (WebSocket stream + REST) ----------
let quoteSecondsLeft = QUOTE_SECONDS;
let quoteTimerId = null;
let rateRefreshId = null;
let geckoRefreshId = null;
let btcSocket = null;
let btcWsRetries = 0;
let lastStreamAt = 0;

function populateBtcSelect() {
  const sel = $("#btcProperty");
  if (!sel) return;
  sel.innerHTML = PROPERTIES.map(
    (p) => `<option value="${p.id}">${p.title} — ${formatUSD(p.offer)}</option>`
  ).join("");
}

function formatUsdPrecise(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function updateBtcQuote({ direction = null } = {}) {
  const id = $("#btcProperty")?.value;
  const p = PROPERTIES.find((x) => x.id === id);
  if (!p) return;

  if ($("#btcUsd")) $("#btcUsd").textContent = formatUSD(p.offer);

  if (!btcRate) {
    if ($("#btcRateGecko")) $("#btcRateGecko").textContent = "Loading…";
    if ($("#btcRateCoinbase")) $("#btcRateCoinbase").textContent = "Loading…";
    if ($("#btcSpread")) $("#btcSpread").textContent = "—";
    if ($("#btcRate")) $("#btcRate").textContent = "Fetching…";
    if ($("#btcChange")) $("#btcChange").textContent = "—";
    if ($("#btcAmount")) $("#btcAmount").textContent = "—";
    if ($("#btcUsdCheck")) $("#btcUsdCheck").textContent = "—";
    return;
  }

  const btcAmount = p.offer / btcRate;
  const usdCheck = btcAmount * btcRate;
  const spreadAbs = Math.abs((btcRateGecko || btcRate) - (btcRateCoinbase || btcRate));
  const spreadPct =
    btcRateGecko && btcRateCoinbase
      ? (spreadAbs / ((btcRateGecko + btcRateCoinbase) / 2)) * 100
      : 0;

  if ($("#btcRateGecko")) {
    $("#btcRateGecko").textContent = btcRateGecko
      ? `${formatUsdPrecise(btcRateGecko)} / BTC`
      : "Waiting…";
  }
  if ($("#btcRateCoinbase")) {
    const el = $("#btcRateCoinbase");
    el.textContent = btcRateCoinbase
      ? `${formatUsdPrecise(btcRateCoinbase)} / BTC`
      : "Streaming…";
    if (direction) flashPriceEl(el, direction);
  }
  if ($("#btcSpread")) {
    $("#btcSpread").textContent =
      btcRateGecko && btcRateCoinbase
        ? `${formatUsdPrecise(spreadAbs)} (${spreadPct.toFixed(3)}%)`
        : "—";
  }
  if ($("#btcRate")) {
    setLivePriceText($("#btcRate"), `${formatUsdPrecise(btcRate)} / BTC`, direction);
  }
  if ($("#btcAmount")) {
    setLivePriceText($("#btcAmount"), formatBTC(btcAmount), direction || "up");
  }
  if ($("#btcUsdCheck")) $("#btcUsdCheck").textContent = formatUsdPrecise(usdCheck);

  if (btcChange24h != null && $("#btcChange")) {
    const up = btcChange24h >= 0;
    const el = $("#btcChange");
    el.textContent = `${up ? "▲" : "▼"} ${Math.abs(btcChange24h).toFixed(2)}% (24h)`;
    el.style.color = up ? "var(--success)" : "var(--danger)";
  } else if ($("#btcChange")) {
    $("#btcChange").textContent = "—";
  }

  const note = $("#btcSourceNote");
  if (note && btcLastUpdated) {
    note.textContent =
      btcStreamMode === "live"
        ? `Coinbase WebSocket live · CoinGecko reference · ${btcLastUpdated.toLocaleTimeString()}`
        : `Market rates · ${btcStreamMode} · ${btcLastUpdated.toLocaleTimeString()}`;
  }
}

function updateAffordCalculator() {
  const input = $("#affordBtc");
  const usdEl = $("#affordUsd");
  const homesEl = $("#affordHomes");
  if (!input || !usdEl || !homesEl) return;
  const btcAmt = Math.max(0, Number(input.value) || 0);
  if (!btcRate) {
    usdEl.textContent = "Waiting for live rate…";
    homesEl.innerHTML = "";
    return;
  }
  const power = btcAmt * btcRate;
  usdEl.textContent = formatUSD(power);
  const affordable = PROPERTIES.filter((p) => p.offer <= power)
    .sort((a, b) => b.offer - a.offer)
    .slice(0, 4);
  if (!affordable.length) {
    homesEl.innerHTML = `<p class="afford-empty">No listings fully covered yet — try more BTC or a lower-priced market.</p>`;
    return;
  }
  homesEl.innerHTML = affordable
    .map((p) => {
      const need = p.offer / btcRate;
      return `<button type="button" class="afford-chip" data-view="${p.id}" data-btc="${p.id}">
        <img src="${p.image}" alt="" />
        <span>
          <strong>${p.title}</strong>
          <small>${formatUSD(p.offer)} · needs ₿ ${need.toFixed(3)}</small>
        </span>
      </button>`;
    })
    .join("");
}

let restPollIndex = 0;

async function fetchPriceCoinbase() {
  const res = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return Number(data?.data?.amount) || null;
}

async function fetchPriceKraken() {
  const res = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD", { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  const key = data?.result && Object.keys(data.result)[0];
  const last = key ? Number(data.result[key]?.c?.[0]) : null;
  return last || null;
}

async function fetchPriceBlockchain() {
  const res = await fetch("https://blockchain.info/ticker", { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return Number(data?.USD?.last) || null;
}

async function fetchPriceCoinbaseExchange() {
  try {
    const res = await fetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const last = Number(data.price);
    const bid = Number(data.bid);
    const ask = Number(data.ask);
    if (bid > 0 && ask > 0) return (bid + ask) / 2;
    return last || null;
  } catch (_) {
    return null;
  }
}

const PRICE_FETCHERS = [
  { name: "coinbase", fn: fetchPriceCoinbase },
  { name: "kraken", fn: fetchPriceKraken },
  { name: "blockchain", fn: fetchPriceBlockchain },
  { name: "coinbase", fn: fetchPriceCoinbaseExchange },
];

/** Rotate venues so the displayed number keeps moving (~1/sec) */
async function pollCoinbaseSpot() {
  // If a WebSocket just ticked, skip one REST cycle to avoid fighting the stream
  if (btcStreamMode === "live" && Date.now() - lastStreamAt < 800) return true;

  const n = PRICE_FETCHERS.length;
  for (let i = 0; i < n; i++) {
    const fetcher = PRICE_FETCHERS[(restPollIndex + i) % n];
    try {
      const price = await fetcher.fn();
      if (price > 0) {
        restPollIndex = (restPollIndex + i + 1) % n;
        applyLiveSpot(price, "rest");
        btcLastSource = fetcher.name;
        return true;
      }
    } catch (_) {
      /* try next */
    }
  }
  return false;
}

async function fetchLiveBtcRates({ silent = false, geckoOnly = false } = {}) {
  const note = $("#btcSourceNote");
  if (note && !silent) note.textContent = "Fetching market prices…";

  if (!geckoOnly) {
    const ok = await pollCoinbaseSpot();
    if (!ok && !btcRate) {
      try {
        const res = await fetch("https://blockchain.info/ticker", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const price = Number(data?.USD?.last);
          if (price > 0) applyLiveSpot(price, "rest");
        }
      } catch (_) {
        /* ignore */
      }
    }
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      const gecko = Number(data?.bitcoin?.usd);
      const change = data?.bitcoin?.usd_24h_change;
      if (change != null) btcChange24h = Number(change);
      if (gecko > 0) applyLiveSpot(gecko, "gecko");
    }
  } catch (_) {
    /* ignore */
  }

  if (!btcRate) {
    applyLiveSpot(97450, "rest");
    btcStreamMode = "offline";
    updateStreamBadge();
    if (note) note.textContent = "Offline fallback rate — check network.";
    if (!silent) toast("Could not reach market APIs — using fallback rate.");
  } else if (!silent) {
    toast("Market rates refreshed.");
  }
}

let btcSocketBinance = null;

function connectCoinbaseWs() {
  if (btcSocket && (btcSocket.readyState === WebSocket.OPEN || btcSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    btcSocket = new WebSocket(WS_COINBASE);
  } catch (_) {
    return;
  }

  btcSocket.addEventListener("open", () => {
    btcWsRetries = 0;
    btcSocket.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: ["BTC-USD"],
        channels: ["ticker"],
      })
    );
    const note = $("#btcSourceNote");
    if (note) note.textContent = "Coinbase + Binance streams connecting…";
  });

  btcSocket.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "ticker" && (msg.product_id === "BTC-USD" || msg.product_id === "BTC-USDT")) {
        const price = Number(msg.price || msg.best_bid || msg.best_ask);
        if (price > 0) {
          if (btcStreamMode !== "live") {
            btcStreamMode = "live";
            updateStreamBadge();
          }
          applyLiveSpot(price, "coinbase");
        }
      }
    } catch (_) {
      /* ignore */
    }
  });

  btcSocket.addEventListener("close", () => {
    const delay = Math.min(20000, 1000 * Math.pow(1.5, btcWsRetries++));
    setTimeout(connectCoinbaseWs, delay);
  });

  btcSocket.addEventListener("error", () => {
    try {
      btcSocket.close();
    } catch (_) {
      /* ignore */
    }
  });
}

function connectBinanceWs() {
  if (
    btcSocketBinance &&
    (btcSocketBinance.readyState === WebSocket.OPEN || btcSocketBinance.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  try {
    btcSocketBinance = new WebSocket(WS_BINANCE);
  } catch (_) {
    return;
  }

  // Throttle UI to ~8 fps max so it flickers but doesn't melt the tab
  let lastUi = 0;
  let pending = null;

  btcSocketBinance.addEventListener("open", () => {
    btcWsRetries = 0;
    const note = $("#btcSourceNote");
    if (note) note.textContent = "Binance trade stream live — prices tick per trade.";
    if (btcStreamMode !== "live") {
      btcStreamMode = "live";
      updateStreamBadge();
      toast("₿ Live trade stream connected.");
    }
  });

  btcSocketBinance.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      // trade stream: { p: "price", ... }
      const price = Number(msg.p || msg.price || msg.c);
      if (!(price > 0)) return;
      pending = price;
      const now = performance.now();
      if (now - lastUi < 120) return; // ~8 updates/sec — visible flicker
      lastUi = now;
      const p = pending;
      pending = null;
      applyLiveSpot(p, "binance");
    } catch (_) {
      /* ignore */
    }
  });

  btcSocketBinance.addEventListener("close", () => {
    setTimeout(connectBinanceWs, 2000);
  });

  btcSocketBinance.addEventListener("error", () => {
    try {
      btcSocketBinance.close();
    } catch (_) {
      /* ignore */
    }
  });
}

function connectBtcWebSocket() {
  btcStreamMode = "connecting";
  updateStreamBadge();
  connectBinanceWs();
  connectCoinbaseWs();
}

function formatTimer(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function startQuoteTimer() {
  clearInterval(quoteTimerId);
  quoteSecondsLeft = QUOTE_SECONDS;
  if ($("#btcTimer")) $("#btcTimer").textContent = formatTimer(quoteSecondsLeft);
  quoteTimerId = setInterval(() => {
    quoteSecondsLeft -= 1;
    if (quoteSecondsLeft <= 0) {
      quoteSecondsLeft = QUOTE_SECONDS;
      // lock rolls — rate already live; soft toast
      toast("15-min quote window rolled — still on live stream rate.");
    }
    if ($("#btcTimer")) $("#btcTimer").textContent = formatTimer(quoteSecondsLeft);
  }, 1000);
}

function initBitcoin() {
  populateBtcSelect();
  updateBtcQuote();
  updateAffordCalculator();
  updateStreamBadge();
  fetchLiveBtcRates({ silent: true });
  connectBtcWebSocket();
  startQuoteTimer();

  clearInterval(rateRefreshId);
  clearInterval(geckoRefreshId);

  // Fast REST poll — keeps cents moving even when WebSockets are blocked
  rateRefreshId = setInterval(() => {
    pollCoinbaseSpot();
  }, FAST_POLL_MS);

  geckoRefreshId = setInterval(() => fetchLiveBtcRates({ silent: true, geckoOnly: true }), GECKO_REFRESH_MS);

  // Heartbeat: re-flash last price every 2s so UI feels alive even on quiet markets
  setInterval(() => {
    if (!btcRate) return;
    const el = $("#tickerBtcPrice");
    if (el && btcStreamMode === "live") {
      el.classList.remove("flash-tick");
      void el.offsetWidth;
      el.classList.add("flash-tick");
    }
    const updated = $("#tickerUpdated");
    if (updated && btcLastUpdated) {
      const age = Math.round((Date.now() - btcLastUpdated.getTime()) / 1000);
      updated.textContent = `${btcStreamMode} · ${btcLastSource} · ${age}s ago · ${btcTickCount} ticks`;
    }
  }, 2000);

  $("#btcProperty")?.addEventListener("change", () => {
    updateBtcQuote();
    quoteSecondsLeft = QUOTE_SECONDS;
  });

  $("#refreshBtcRates")?.addEventListener("click", () => {
    fetchLiveBtcRates({ silent: false });
    connectBtcWebSocket();
    quoteSecondsLeft = QUOTE_SECONDS;
  });

  $("#tickerRefresh")?.addEventListener("click", () => {
    pollCoinbaseSpot();
    fetchLiveBtcRates({ silent: false });
    connectBtcWebSocket();
  });

  $("#affordBtc")?.addEventListener("input", updateAffordCalculator);

  // Preset buttons via double-click on board price → scroll already there
  $("#boardBtcPrice")?.addEventListener("click", () => {
    const a = $("#affordBtc");
    if (a) {
      a.value = "1";
      updateAffordCalculator();
      a.focus();
    }
  });

  $("#copyBtcAddr")?.addEventListener("click", async () => {
    const addr = $("#btcAddress")?.textContent;
    try {
      await navigator.clipboard.writeText(addr);
      toast("Demo escrow address copied.");
    } catch {
      toast("Copy failed — select the address manually.");
    }
  });

  $("#simulateBtcPay")?.addEventListener("click", () => {
    requireSoftAuth("btc", () => {
      const id = $("#btcProperty")?.value;
      const p = PROPERTIES.find((x) => x.id === id);
      if (!p) {
        toast("Pick a home for Bitcoin checkout first.");
        return;
      }
      if (!btcRate) {
        toast("Waiting for live BTC rate…");
        return;
      }
      const amount = p.offer / btcRate;
      const btc = formatBTC(amount);
      $("#btcCheckout")?.classList.add("pay-flash");
      setTimeout(() => $("#btcCheckout")?.classList.remove("pay-flash"), 800);
      toast(`Demo payment initiated: ${btc} for ${p.title} @ ${formatUsdPrecise(btcRate)}/BTC.`);
      track("btc_pay_simulate", { id: p.id });
      openChat(
        `I just simulated a Bitcoin payment of ${btc} (live rate ${formatUsdPrecise(btcRate)}/BTC, stream=${btcStreamMode}) for ${p.title}. Can a settlement specialist confirm next steps?`
      );
    });
  });

  // Clicking top ticker scrolls to checkout
  $("#btcTicker")?.addEventListener("click", (e) => {
    if (e.target.closest("button, a")) return;
    document.getElementById("bitcoin")?.scrollIntoView({ behavior: "smooth" });
  });
}

function jumpToBtc(id) {
  if ($("#btcProperty")) $("#btcProperty").value = id;
  updateBtcQuote();
  quoteSecondsLeft = QUOTE_SECONDS;
  document.getElementById("bitcoin")?.scrollIntoView({ behavior: "smooth" });
  toast("Bitcoin checkout loaded with live stream rates.");
}

// ---------- Analytics helper ----------
function track(event, props) {
  try {
    window.SRU_ANALYTICS?.track?.(event, props);
  } catch {
    /* ignore */
  }
}

// ---------- Auth gate (accounts + demo password + open public landing) ----------
const SOFT_GUEST_KEY = "sru_soft_guest_ok";
const OPEN_BANNER_KEY = "sru_open_banner_dismissed";
const SAVE_HINT_KEY = "sru_save_hint_shown";
let softAuthPending = null;

function unlockSite() {
  const gate = $("#demoGate");
  if (gate) {
    gate.classList.add("unlocked");
    document.body.classList.add("gate-open");
  }
  updateHeaderUser();
  track("site_unlocked");
}

function authMode() {
  return (window.SRU_CONFIG && window.SRU_CONFIG.auth && window.SRU_CONFIG.auth.mode) || "accounts";
}

function softGateConfig() {
  const auth = (window.SRU_CONFIG && window.SRU_CONFIG.auth) || {};
  const sg = auth.softGate || {};
  return {
    enabled: sg.enabled !== false,
    actions: Array.isArray(sg.actions) ? sg.actions : ["btc", "rent"],
    allowGuest: sg.allowGuest !== false,
    saveHint: sg.saveHint !== false,
  };
}

function isSignedInUser() {
  return !!(window.SRU_AUTH && window.SRU_AUTH.isSignedIn && window.SRU_AUTH.isSignedIn());
}

function isSoftGuestOk() {
  return sessionStorage.getItem(SOFT_GUEST_KEY) === "1";
}

function markSoftGuestOk() {
  sessionStorage.setItem(SOFT_GUEST_KEY, "1");
  sessionStorage.setItem(DEMO_GATE_KEY, "1");
}

function requireSoftAuth(action, onAllow) {
  if (authMode() !== "open") {
    onAllow();
    return true;
  }
  const sg = softGateConfig();
  if (!sg.enabled || !sg.actions.includes(action)) {
    onAllow();
    return true;
  }
  if (isSignedInUser() || isSoftGuestOk()) {
    onAllow();
    return true;
  }
  openSoftAuthSheet(action, onAllow);
  return false;
}

function softAuthCopy(action) {
  if (action === "btc") {
    return {
      eyebrow: "Bitcoin checkout",
      title: "Almost ready to buy with ₿",
      body: "Sign in or create a free account to lock a live Bitcoin quote. Guests can still try the demo checkout on this device.",
    };
  }
  if (action === "rent") {
    return {
      eyebrow: "Try-Before-Buy",
      title: "Book a preview stay",
      body: "Accounts keep your reservation details handy. Continue as guest to simulate a stay booking in this demo.",
    };
  }
  return {
    eyebrow: "Member action",
    title: "Sign in to continue",
    body: "Create a free account or continue as a guest for this demo session.",
  };
}

function openSoftAuthSheet(action, onAllow) {
  softAuthPending = { action, onAllow };
  const copy = softAuthCopy(action);
  const eyebrow = $("#softAuthEyebrow");
  const title = $("#softAuthTitle");
  const body = $("#softAuthBody");
  const guest = $("#softAuthGuest");
  if (eyebrow) eyebrow.textContent = copy.eyebrow;
  if (title) title.textContent = copy.title;
  if (body) body.textContent = copy.body;
  if (guest) guest.classList.toggle("hidden", !softGateConfig().allowGuest);
  const next = encodeURIComponent("index.html");
  if ($("#softAuthSignup")) $("#softAuthSignup").href = `signup.html?next=${next}`;
  if ($("#softAuthSignin")) $("#softAuthSignin").href = `auth.html?tab=signin&next=${next}`;
  const overlay = $("#softAuthOverlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }
  track("soft_auth_prompt", { action });
}

function closeSoftAuthSheet(runAllow) {
  const overlay = $("#softAuthOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
  const pending = softAuthPending;
  softAuthPending = null;
  if (runAllow && pending && typeof pending.onAllow === "function") {
    pending.onAllow();
  }
}

function initSoftAuthSheet() {
  $("#softAuthClose")?.addEventListener("click", () => closeSoftAuthSheet(false));
  $("#softAuthOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeSoftAuthSheet(false);
  });
  $("#softAuthGuest")?.addEventListener("click", () => {
    markSoftGuestOk();
    track("soft_auth_guest", { action: softAuthPending?.action });
    toast("Continuing as guest for this session.");
    closeSoftAuthSheet(true);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#softAuthOverlay")?.classList.contains("hidden")) {
      closeSoftAuthSheet(false);
    }
  });
}

function maybeSaveHint() {
  if (authMode() !== "open") return;
  if (!softGateConfig().saveHint) return;
  if (isSignedInUser()) return;
  if (sessionStorage.getItem(SAVE_HINT_KEY) === "1") return;
  sessionStorage.setItem(SAVE_HINT_KEY, "1");
  toast("Saved on this device. Sign in to sync across devices.");
}

function initOpenLandingBanner() {
  const banner = $("#openLandingBanner");
  if (!banner) return;
  if (authMode() !== "open") {
    banner.classList.add("hidden");
    return;
  }
  if (sessionStorage.getItem(OPEN_BANNER_KEY) === "1" || isSignedInUser()) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  document.body.classList.add("has-open-banner");
  $("#dismissOpenBanner")?.addEventListener("click", () => {
    sessionStorage.setItem(OPEN_BANNER_KEY, "1");
    banner.classList.add("hidden");
    document.body.classList.remove("has-open-banner");
  });
}

function updateHeaderUser() {
  const box = $("#headerUser");
  const nav = $("#signInNav");
  const signUp = $("#signUpNav");
  const nameEl = $("#headerUserName");
  const user =
    (window.SRU_AUTH && window.SRU_AUTH.getUser && window.SRU_AUTH.getUser()) || null;
  if (user && box && nameEl) {
    const first = (user.name || "Member").split(" ")[0];
    nameEl.textContent = first;
    box.classList.remove("hidden");
    if (nav) nav.classList.add("hidden");
    if (signUp) signUp.classList.add("hidden");
  } else {
    if (box) box.classList.add("hidden");
    if (nav) nav.classList.remove("hidden");
    if (signUp) signUp.classList.remove("hidden");
  }
}

function initDemoGate() {
  const gate = $("#demoGate");
  const mode = authMode();

  if (mode === "open") {
    // Public landing: no password wall; soft-gate member actions instead
    if (gate) gate.classList.add("unlocked");
    document.body.classList.add("gate-open", "auth-open-mode");
    document.documentElement.classList.add("auth-open-boot");
    initOpenLandingBanner();
    initSoftAuthSheet();
    updateHeaderUser();
    track("gate_open_mode");
    $("#signOutBtn")?.addEventListener("click", () => {
      if (window.SRU_AUTH) window.SRU_AUTH.logout();
      sessionStorage.removeItem(DEMO_GATE_KEY);
      sessionStorage.removeItem(SOFT_GUEST_KEY);
      location.href = "index.html";
    });
    return;
  }

  if (!gate) return;

  // Valid account / demo session?
  const hasToken = window.SRU_AUTH && window.SRU_AUTH.isSignedIn && window.SRU_AUTH.isSignedIn();
  const legacy = sessionStorage.getItem(DEMO_GATE_KEY) === "1";

  if (hasToken || legacy) {
    // Soft-verify with API when available
    if (window.SRU_AUTH && window.SRU_AUTH.me) {
      window.SRU_AUTH.me().then((user) => {
        if (user || legacy) {
          unlockSite();
          if (user && user.role !== "demo") {
            toast(`Welcome back, ${(user.name || "member").split(" ")[0]}.`);
          }
        } else {
          document.body.classList.remove("gate-open");
          gate.classList.remove("unlocked");
        }
      });
    } else {
      unlockSite();
    }
  } else {
    document.body.classList.remove("gate-open");
    gate.classList.remove("unlocked");
  }

  const form = $("#gateForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const entered = $("#gatePassword").value;
      const err = $("#gateError");
      try {
        if (!window.SRU_AUTH || !window.SRU_AUTH.demoLogin) {
          throw new Error("Authentication service unavailable");
        }
        await window.SRU_AUTH.demoLogin(entered, false);
        if (err) err.classList.add("hidden");
        unlockSite();
        toast("Demo unlocked. Welcome to Smart Realty USA.");
      } catch {
        if (err) err.classList.remove("hidden");
        $("#gatePassword").value = "";
        $("#gatePassword").focus();
      }
    });
  }

  const signOut = $("#signOutBtn");
  if (signOut) {
    signOut.addEventListener("click", () => {
      if (window.SRU_AUTH) window.SRU_AUTH.logout();
      sessionStorage.removeItem(DEMO_GATE_KEY);
      location.href = "auth.html?next=index.html";
    });
  }

  updateHeaderUser();
}

// ---------- Live chat (human-style responses) ----------
const AGENT_REPLIES = [
  "Absolutely — I’m Maya, a real Smart Realty concierge. I’ll stay with you on this.",
  "Great question. Our House Blue Book is free and shows fair market value next to our lowest offer with zero hidden fees.",
  "Yes — Bitcoin checkout locks a 15-minute quote and moves funds into multi-sig escrow until title clears.",
  "Try-Before-Buy lets you stay like Airbnb. Up to 100% of eligible stay costs can credit toward purchase.",
  "I can also connect you by phone at 1-800-SMART-USA anytime — a human always answers, 24/7.",
  "Security is monitored around the clock by our engineering SOC. Your documents and payments stay encrypted end-to-end.",
  "Want me to pull a Blue Book estimate, open a BTC quote, or book a preview stay right now?",
];

let replyIndex = 0;

function appendChat(text, who = "agent") {
  const box = $("#chatMessages");
  const div = document.createElement("div");
  div.className = `chat-msg ${who}`;
  const label = who === "agent" ? "Maya · Human" : "You";
  div.innerHTML = `<span class="meta">${label}</span>${escapeHtml(text)}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openChat(prefill) {
  $("#chatPanel").classList.remove("hidden");
  if (!$("#chatMessages").children.length) {
    appendChat(
      "Hi! I’m Maya — a real person on the Smart Realty USA team. Phone or chat, we’re here 24/7. How can I help?"
    );
  }
  if (prefill) {
    $("#chatInput").value = prefill;
    $("#chatInput").focus();
  } else {
    $("#chatInput").focus();
  }
}

function closeChat() {
  $("#chatPanel").classList.add("hidden");
}

function initChat() {
  const openers = ["#chatFab", "#openChatBtn", "#openChatBtn2", "#openChatBtn3", "#openChatBtn4"];
  openers.forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener("click", () => openChat());
  });
  $("#closeChat").addEventListener("click", closeChat);

  $("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chatInput");
    const text = input.value.trim();
    if (!text) return;
    appendChat(text, "user");
    input.value = "";

    const typing = document.createElement("div");
    typing.className = "chat-typing";
    typing.id = "typingIndicator";
    typing.textContent = "Maya is typing…";
    $("#chatMessages").appendChild(typing);
    $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;

    const delay = 900 + Math.random() * 900;
    setTimeout(() => {
      $("#typingIndicator")?.remove();
      // Contextual-ish replies
      let reply = AGENT_REPLIES[replyIndex % AGENT_REPLIES.length];
      replyIndex += 1;
      const lower = text.toLowerCase();
      if (lower.includes("bitcoin") || lower.includes("btc") || lower.includes("crypto")) {
        reply =
          btcRate
            ? `Bitcoin is fully supported at the live market rate of ${formatUsdPrecise(btcRate)}/BTC (we compare CoinGecko + Coinbase). Lock the quote in checkout and send to multi-sig escrow — I can stay on the line through settlement.`
            : "Bitcoin is fully supported. Pick a listing, lock the live quote in our checkout, and send to multi-sig escrow. I can stay on the line through settlement.";
      } else if (lower.includes("rent") || lower.includes("stay") || lower.includes("airbnb") || lower.includes("try")) {
        reply =
          "Try-Before-Buy is available on most estates. Book a furnished stay, live in the home, and apply eligible nights toward your purchase. I’ll hold inventory if you like.";
      } else if (lower.includes("blue book") || lower.includes("value") || lower.includes("price")) {
        reply =
          "Our free House Blue Book is like a Kelley Blue Book for homes — fair market value, comps, and our lowest transparent offer with no surprise fees.";
      } else if (lower.includes("phone") || lower.includes("call")) {
        reply = "Call us anytime at 1-800-SMART-USA (1-800-762-7887). A real human answers 24 hours a day, 7 days a week.";
      } else if (lower.includes("security") || lower.includes("safe") || lower.includes("hack")) {
        reply =
          "We run 24/7 security with elite engineers — zero-trust access, multi-sig crypto escrow, encrypted title vaults, and continuous penetration testing.";
      }
      appendChat(reply, "agent");
    }, delay);
  });
}

// ---------- Header / nav / filters ----------
function initScrollSpy() {
  const sections = ["home", "listings", "bluebook", "bitcoin", "rentals", "security", "support"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const links = $$(".nav-link");
  if (!sections.length || !links.length) return;

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        links.forEach((a) => {
          const href = a.getAttribute("href") || "";
          a.classList.toggle("active", href === `#${id}`);
        });
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((s) => spy.observe(s));
}

function initUI() {
  const header = $("#header");
  window.addEventListener(
    "scroll",
    () => {
      header?.classList.toggle("scrolled", window.scrollY > 20);
    },
    { passive: true }
  );

  $("#menuToggle")?.addEventListener("click", () => {
    $("#nav")?.classList.toggle("open");
  });

  $$(".nav-link").forEach((link) => {
    link.addEventListener("click", () => $("#nav")?.classList.remove("open"));
  });

  $$("#styleFilters .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#styleFilters .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      renderActiveFilters();
      renderListings();
    });
  });

  $("#openBlueBookBtn")?.addEventListener("click", () => {
    document.getElementById("bluebook")?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => $("#bbAddress")?.focus(), 400);
  });

  $("#openFavDrawer")?.addEventListener("click", openFavDrawer);
  $("#closeFavDrawer")?.addEventListener("click", closeFavDrawer);
  $("#drawerBackdrop")?.addEventListener("click", closeFavDrawer);

  document.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.preventDefault();
      const id = fav.dataset.fav;
      if (favorites.has(id)) {
        favorites.delete(id);
        toast("Removed from saved.");
        track("unsave_listing", { id });
      } else {
        favorites.add(id);
        toast("Saved to your shortlist.");
        track("save_listing", { id });
        maybeSaveHint();
      }
      localStorage.setItem("sru_favs", JSON.stringify([...favorites]));
      if (window.SRU_AUTH && window.SRU_AUTH.isMemberAccount && window.SRU_AUTH.isMemberAccount()) {
        window.SRU_AUTH.saveFavorites([...favorites]).catch(() => {});
      }
      updateFavBadge();
      renderListings();
      if ($("#favDrawer")?.classList.contains("open")) renderFavoritesDrawer();
      const modalFav = $("#favFromModal");
      if (modalFav && modalFav.dataset.fav === id) {
        modalFav.textContent = favorites.has(id) ? "♥ Saved" : "♡ Save";
      }
      return;
    }

    const cmpInput = e.target.closest("input[data-compare]");
    if (cmpInput) {
      const id = cmpInput.dataset.compare;
      if (cmpInput.checked) {
        if (compareSet.size >= MAX_COMPARE && !compareSet.has(id)) {
          cmpInput.checked = false;
          toast(`Compare up to ${MAX_COMPARE} homes — remove one first.`);
          return;
        }
        compareSet.add(id);
      } else {
        compareSet.delete(id);
      }
      persistCompare();
      updateCompareBar();
      updateFavBadge();
      cmpInput.closest(".compare-check")?.classList.toggle("on", cmpInput.checked);
      return;
    }

    const cmpRemove = e.target.closest("[data-compare-remove]");
    if (cmpRemove) {
      compareSet.delete(cmpRemove.dataset.compareRemove);
      persistCompare();
      updateCompareBar();
      updateFavBadge();
      renderListings();
      return;
    }

    if (e.target.closest("#clearCompare")) {
      compareSet.clear();
      persistCompare();
      updateCompareBar();
      updateFavBadge();
      renderListings();
      return;
    }

    if (e.target.closest("#openCompareModal")) {
      openCompareModal();
      return;
    }

    if (e.target.closest("#favBrowse")) {
      closeFavDrawer();
    }

    const view = e.target.closest("[data-view]");
    if (view) {
      closeFavDrawer();
      openProperty(view.dataset.view);
      return;
    }
    const btc = e.target.closest("[data-btc]");
    if (btc) {
      const id = btc.dataset.btc;
      requireSoftAuth("btc", () => {
        closeModals();
        closeFavDrawer();
        jumpToBtc(id);
      });
      return;
    }
    const rent = e.target.closest("[data-rent]");
    if (rent) {
      const id = rent.dataset.rent;
      requireSoftAuth("rent", () => {
        closeModals();
        openRental(id);
      });
      return;
    }
    if (e.target.classList.contains("modal-overlay")) {
      closeModals();
    }
  });

  $("#closePropertyModal")?.addEventListener("click", closeModals);
  $("#closeRentalModal")?.addEventListener("click", closeModals);
  $("#closeCompareModal")?.addEventListener("click", closeModals);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModals();
      closeChat();
      closeFavDrawer();
    }
  });

  initScrollSpy();
  updateFavBadge();
  updateCompareBar();
}

// ---------- Scroll reveal ----------
let revealObserver;
function observeReveals() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
  }
  $$(".reveal:not(.visible)").forEach((el) => revealObserver.observe(el));
}

function markSectionsReveal() {
  $$(".trust-item, .btc-step, .sec-card, .support-card, .rental-how, .bluebook-card, .btc-checkout").forEach(
    (el) => el.classList.add("reveal")
  );
}

// ---------- Domain config + presenter panel ----------
function getConfig() {
  return (
    window.SRU_CONFIG || {
      siteName: "Smart Realty USA",
      siteUrl: "https://smartrealty.us",
      canonicalHost: "smartrealty.us",
      contactEmail: "ai@smartrealty.us",
      phoneDisplay: "1-800-SMART-USA",
      phoneTel: "+18007627879",
      isPrivateDemo: true,
      presenterMode: true,
    }
  );
}

function applyDomainConfig() {
  const cfg = getConfig();
  const email = cfg.contactEmail || "ai@smartrealty.us";
  const siteUrl = (cfg.siteUrl || "").replace(/\/$/, "");
  const seo = cfg.seo || {};
  // Public index when seo.index === true (explicit flip)
  const publicIndex = seo.index === true;

  // Mailto + visible email surfaces
  $$('a[href^="mailto:"]').forEach((a) => {
    a.href = `mailto:${email}`;
    if (a.matches("[data-contact-email]") || /ai@/i.test(a.textContent)) {
      a.textContent = email;
    }
  });
  $$("[data-contact-email-text]").forEach((el) => {
    el.textContent = email;
  });

  // Live-on footer line when not file://
  const liveLine = $("#liveOnLine");
  const liveLink = $("#liveOnLink");
  if (liveLine && liveLink && siteUrl) {
    liveLink.href = siteUrl;
    liveLink.textContent = cfg.canonicalHost || siteUrl.replace(/^https?:\/\//, "");
    liveLine.classList.remove("hidden");
  }

  // ---- Public SEO flip ----
  const robots = $("#metaRobots") || document.querySelector('meta[name="robots"]');
  if (robots) {
    robots.setAttribute("content", publicIndex ? "index, follow" : "noindex, nofollow");
  }
  const canon = $("#canonicalLink") || document.querySelector('link[rel="canonical"]');
  if (siteUrl && canon) canon.setAttribute("href", siteUrl + "/");
  const ogUrl = $("#ogUrl");
  if (ogUrl && siteUrl) ogUrl.setAttribute("content", siteUrl + "/");
  const ogImage = seo.ogImage || (siteUrl ? siteUrl + "/images/hero-bg.jpg" : "");
  if (ogImage) {
    $("#ogImage")?.setAttribute("content", ogImage);
    $("#twImage")?.setAttribute("content", ogImage);
  }
  if (seo.twitterHandle) {
    let tw = document.querySelector('meta[name="twitter:site"]');
    if (!tw) {
      tw = document.createElement("meta");
      tw.name = "twitter:site";
      document.head.appendChild(tw);
    }
    tw.content = seo.twitterHandle.startsWith("@")
      ? seo.twitterHandle
      : `@${seo.twitterHandle}`;
  }

  // JSON-LD RealEstateAgent + ItemList of homes (public SEO)
  const ld = $("#jsonLdOrg");
  if (ld && publicIndex) {
    const org = {
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: cfg.siteName || "Smart Realty USA",
      url: siteUrl || "https://smartrealty.us",
      email,
      telephone: cfg.phoneTel || "+1-800-762-7879",
      description: cfg.tagline || "Transparent homes. Bitcoin ready.",
      areaServed: "US",
      numberOfEmployees: 1,
      address: cfg.businessAddress
        ? { "@type": "PostalAddress", streetAddress: cfg.businessAddress, addressRegion: cfg.formationState || "KY", addressCountry: "US" }
        : undefined,
    };
    if (cfg.dunsNumber) org.identifier = cfg.dunsNumber;
    const list = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Smart Realty USA curated listings",
      numberOfItems: typeof PROPERTIES !== "undefined" ? PROPERTIES.length : 0,
      itemListElement: (typeof PROPERTIES !== "undefined" ? PROPERTIES : []).slice(0, 24).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Residence",
          name: p.title,
          description: p.desc,
          address: p.location,
          url: `${siteUrl || ""}/?home=${p.id}#listings`,
        },
      })),
    };
    ld.textContent = JSON.stringify([org, list]);
  } else if (ld && !publicIndex) {
    ld.remove();
  }

  // Soft-hide heavy DEMO chrome when presenting publicly (badges still if isPrivateDemo)
  document.body.classList.toggle("seo-public", publicIndex);
  document.body.classList.toggle("demo-private", !!cfg.isPrivateDemo);
}

function buildShareEmailText() {
  const cfg = getConfig();
  const url = (cfg.siteUrl || "https://YOURDOMAIN.com").replace(/\/$/, "");
  return `Subject: Smart Realty USA — Private Demo Access

Hi —

Here's private access to the Smart Realty USA demo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
URL:      ${url}

Demo password:  Provided separately by the site administrator

If the browser asks for a second login first:
  Use the server credentials provided separately by the site administrator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Suggested walkthrough (5–7 minutes):
  1. Unlock the demo
  2. Note the live Bitcoin ticker at the top
  3. Go to Listings — try search "Las Vegas" or "Austin"
  4. Toggle Grid / List / Map views
  5. Open any home — see Blue Book stack + live ₿ price
  6. Try Free Blue Book on the form
  7. Optional: Simulate Bitcoin checkout or book a Try-Before-Buy stay
  8. Live Chat (Maya) or call 1-800-SMART-USA

Official contact: ${cfg.contactEmail || "ai@smartrealty.us"}

—
Demo Version · All Rights Reserved © 2026 Smart Realty USA
Not a live brokerage transaction platform. For demonstration only.
`;
}

function initDomainPanel() {
  const cfg = getConfig();
  const openBtn = $("#openDomainPanel");
  const panel = $("#domainPanel");
  if (!panel) return;

  if (cfg.presenterMode && openBtn) {
    openBtn.classList.remove("hidden");
  }

  const siteUrl = (cfg.siteUrl || "").replace(/\/$/, "");
  if ($("#credUrl")) $("#credUrl").textContent = siteUrl || "—";
  if ($("#shareEmailDraft")) $("#shareEmailDraft").value = buildShareEmailText();
  if ($("#openLiveUrl") && siteUrl) $("#openLiveUrl").href = siteUrl;

  const open = () => {
    if ($("#shareEmailDraft")) $("#shareEmailDraft").value = buildShareEmailText();
    panel.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  };
  const close = () => {
    panel.classList.add("hidden");
    document.body.style.overflow = "";
  };

  openBtn?.addEventListener("click", open);
  $("#closeDomainPanel")?.addEventListener("click", close);
  panel.addEventListener("click", (e) => {
    if (e.target === panel) close();
  });

  // Copy helpers
  panel.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const sel = btn.getAttribute("data-copy");
    const el = sel ? document.querySelector(sel) : null;
    const text = el?.textContent?.trim() || "";
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied.");
    } catch {
      toast("Copy failed — select the text manually.");
    }
  });

  $("#copyShareEmail")?.addEventListener("click", async () => {
    const text = $("#shareEmailDraft")?.value || buildShareEmailText();
    try {
      await navigator.clipboard.writeText(text);
      toast("Invite email copied — paste into Mail.");
    } catch {
      toast("Select the textarea and copy manually.");
    }
  });

  $("#copyLiveUrl")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(siteUrl || window.location.href);
      toast("Live URL copied.");
    } catch {
      toast("Copy failed.");
    }
  });

  // Keyboard: Ctrl/Cmd + Shift + D opens presenter panel
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
      if (cfg.presenterMode) {
        e.preventDefault();
        open();
      }
    }
    if (e.key === "Escape" && !panel.classList.contains("hidden")) {
      close();
    }
  });
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  applyDomainConfig();
  initDemoGate();
  initHeroPanel();
  initDunsGuide();
  initMarketplace();
  setViewMode("grid");
  renderListings();
  renderRentals();
  initUI();
  initBlueBook();
  initBitcoin();
  initChat();
  initDomainPanel();
  markSectionsReveal();
  observeReveals();

  // Hero count reflects live inventory
  const stat = $("#statListings");
  if (stat) stat.textContent = `${PROPERTIES.length}+`;

  initGrowthMarkets();
  initWaitlist();
  initContactLeadForm();
  renderRecentViews();
  $("#clearRecentViews")?.addEventListener("click", () => {
    localStorage.removeItem(RECENT_VIEWS_KEY);
    renderRecentViews();
    toast("Recent views cleared.");
  });
  openDeepLinkedHome();

  // Show DUNS in footer if configured
  const cfg = getConfig();
  if (cfg.dunsNumber && $("#liveOnLine")) {
    const d = document.createElement("p");
    d.className = "live-on";
    d.textContent = `D‑U‑N‑S® ${cfg.dunsNumber}`;
    $("#liveOnLine").after(d);
  }
});
