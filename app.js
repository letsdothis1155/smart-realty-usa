/* ============================================
   Smart Realty USA — Interactive Application
   ============================================ */

// Inventory lives in data/listings.json (loaded by js/listings.js)
const PROPERTIES = window.SRU_PROPERTIES || [];
const DEFAULT_COORDS = window.SRU_DEFAULT_COORDS || {};
if (!PROPERTIES.length) {
  console.warn("[Smart Realty] js/listings.js missing or empty — load it before app.js");
}



const RECENT_KEY = "sru_recent_searches";
const POPULAR_MARKETS = [
  "Louisville",
  "Jeffersonville, IN",
  "New Albany, IN",
  "Utica, IN",
  "Lexington",
  "Las Vegas",
  "Austin",
  "Miami",
  "Nashville",
  "Chicago",
  "Denver",
];

// Enrich inventory with demo amenities / facts (does not rewrite base objects)
const AMENITY_POOL = {
  mansion: ["Chef kitchen", "Wine cellar", "Home theater", "Pool", "Smart home", "Guest wing"],
  vegas: ["Infinity pool", "Strip views", "Outdoor kitchen", "EV chargers", "Spa", "Club room"],
  modern: ["Floor-to-ceiling glass", "Radiant floors", "Solar ready", "Office loft", "Rooftop deck"],
  family: ["Fenced yard", "Garage", "Near schools", "Updated kitchen", "Laundry room", "Quiet street"],
  waterfront: ["Water views", "Dock access", "Balcony", "Elevator", "Concierge", "Gym"],
};

function isUsableListingPhoto(src, p) {
  if (!src) return false;
  if (/maps\.googleapis\.com\/maps\/api\/streetview/i.test(src)) return false;
  if (/NoImage|placeholder|photo-unavailable/i.test(src)) return false;
  if (p && p.imageSource === "street_view" && src === p.image) return false;
  return true;
}

function propertyGallery(p) {
  const list = Array.isArray(p.images) && p.images.length ? p.images.slice() : [];
  if (p.image && !list.includes(p.image)) list.unshift(p.image);
  if (!list.length && p.image) list.push(p.image);
  const seen = new Set();
  return list.filter((src) => {
    if (!src || seen.has(src) || !isUsableListingPhoto(src, p)) return false;
    seen.add(src);
    return true;
  });
}

function displayPhoto(p) {
  if (p.displayImage && p.displayImage.src) return p.displayImage;
  const photos = propertyGallery(p);
  if (photos.length) {
    return { src: photos[0], source: p.primaryImageSource || "listing", label: "", attribution: "" };
  }
  if (p.streetViewAvailable || p.primaryImageSource === "street_view") {
    const base = (window.SRU_AUTH && window.SRU_AUTH.apiBase && window.SRU_AUTH.apiBase()) || "";
    return {
      src: `${base}/api/listings/${encodeURIComponent(p.id)}/street-view`,
      source: "street_view",
      label: "Street View",
      attribution: "© Google",
    };
  }
  return { src: "/images/photo-unavailable.svg", source: "placeholder", label: "Photo unavailable", attribution: "" };
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

const DEMO_GATE_KEY = "sru_demo_unlocked";

function getBtcRate() {
  return (window.SRU_BTC && window.SRU_BTC.getSpot && window.SRU_BTC.getSpot()) || 0;
}

function formatBTC(n) {
  if (window.SRU_BTC && window.SRU_BTC.formatBTC) return window.SRU_BTC.formatBTC(n);
  return `${Number(n).toFixed(6)} BTC`;
}

function formatUsdPrecise(n) {
  if (window.SRU_BTC && window.SRU_BTC.formatUsdPrecise) return window.SRU_BTC.formatUsdPrecise(n);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function btcForOffer(offer) {
  if (window.SRU_BTC && window.SRU_BTC.btcForOffer) return window.SRU_BTC.btcForOffer(offer);
  const rate = getBtcRate();
  if (!rate) return null;
  return offer / rate;
}

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
  baths: 0,
  propertyType: "",
  rentableOnly: false,
  sort: "featured",
  page: 1,
  origin: { lat: 38.2527, lng: -85.7585 },
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
  if (p.lat != null && p.lng != null) return { lat: Number(p.lat), lng: Number(p.lng) };
  if (p.latitude != null && p.longitude != null) return { lat: Number(p.latitude), lng: Number(p.longitude) };
  return DEFAULT_COORDS[p.id] || { lat: 38.194, lng: -85.564 };
}

function listingMarketName(p) {
  const parts = String(p.location || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2 && /^[A-Z]{2}(\s+\d{5})?$/i.test(parts[1])) return parts[0];
  return parts[0] || "";
}

function listingSearchText(p) {
  const loc = p.location || "";
  const extra = [];
  if (/\bKY\b|Louisville|Lexington/i.test(loc)) {
    extra.push("Kentucky", "Kentuckiana", "KY");
  }
  if (/Louisville/i.test(loc)) extra.push("Louisville metro");
  return `${p.title} ${loc} ${p.desc || ""} ${(p.tags || []).join(" ")} ${extra.join(" ")}`.toLowerCase();
}

function queryMatchesListing(p, q) {
  const t = String(q || "").trim().toLowerCase();
  if (!t) return true;
  const hay = listingSearchText(p);
  if (t.length <= 2) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("\\b" + escaped + "\\b", "i").test(hay);
  }
  return hay.includes(t);
}

function getFilteredProperties() {
  const parsed = window.SRUSearch ? SRUSearch.parseQuery(searchState.query) : { text: searchState.query.toLowerCase(), priceMin: 0, priceMax: 0, beds: 0, baths: 0, rentable: false };
  const extra = {
    tag: activeFilter,
    rentable: searchState.rentableOnly || activeFilter === "rentable",
    priceMin: searchState.priceMin || parsed.priceMin,
    priceMax: searchState.priceMax || parsed.priceMax,
    beds: searchState.beds || parsed.beds,
    baths: searchState.baths || parsed.baths,
    propertyType: searchState.propertyType || parsed.propertyType,
  };
  let list = window.SRUSearch
    ? SRUSearch.filterListings(PROPERTIES, parsed, extra)
    : PROPERTIES.filter((p) => {
        if (activeFilter === "rentable") {
          if (!p.rentable) return false;
        } else if (activeFilter === "deals") {
          if (!(p.deals && p.deals.length)) return false;
        } else if (activeFilter !== "all" && !(p.tags || []).includes(activeFilter)) {
          return false;
        }
        if (searchState.rentableOnly && !p.rentable) return false;
        if (searchState.beds && p.beds < searchState.beds) return false;
        if (searchState.baths && p.baths < searchState.baths) return false;
        if (searchState.priceMin && p.offer < searchState.priceMin) return false;
        if (searchState.priceMax && p.offer > searchState.priceMax) return false;
        if (searchState.propertyType && window.SRUSearch && !SRUSearch.propertyTypeMatches(p, searchState.propertyType)) return false;
        if (searchState.query && !queryMatchesListing(p, searchState.query)) return false;
        return true;
      });

  if (window.SRUScore) {
    list = list.map((p) => (p.smartScore ? p : SRUScore.decorate(p, PROPERTIES)));
  }
  if (activeFilter === "deals") {
    list = list.filter((p) => p.deals && p.deals.length);
  }

  if (window.SRUSearch && (!searchState.sort || searchState.sort === "featured")) {
    const city = parsed.city && SRUSearch.cityCoords(parsed.city);
    const origin = parsed.nearMe || city ? { lat: (city && city.lat) || searchState.origin.lat, lng: (city && city.lng) || searchState.origin.lng } : searchState.origin;
    list = SRUSearch.rankListings(list, parsed, origin);
  } else {
    const sort = searchState.sort;
    list = [...list].sort((a, b) => {
      if (sort === "price-asc") return (a.offer || a.listPrice || 0) - (b.offer || b.listPrice || 0);
      if (sort === "price-desc") return (b.offer || b.listPrice || 0) - (a.offer || a.listPrice || 0);
      if (sort === "beds") return (b.beds || 0) - (a.beds || 0);
      if (sort === "baths") return (b.baths || 0) - (a.baths || 0);
      if (sort === "sqft") return (b.sqft || 0) - (a.sqft || 0);
      if (sort === "newest") return Date.parse(b.listingDate || 0) - Date.parse(a.listingDate || 0);
      if (sort === "distance") return (a._searchDist || 0) - (b._searchDist || 0);
      if (sort === "savings") return savings(b) - savings(a);
      return savingsPct(b) - savingsPct(a) || a.offer - b.offer;
    });
  }
  return list;
}

function listingStatusLabel(p) {
  const raw = String(p.status || p.provider || "demo").toLowerCase();
  if (raw === "demo" || raw === "mock" || raw === "sample") return "Demo catalog";
  if (raw === "hud") return "HUD";
  if (raw === "active" || raw === "for_sale" || raw === "for-sale") return "For sale";
  return p.status || "Listing";
}

function simulatorHrefFor(p) {
  const photo = propertyGallery(p)[0] || "";
  if (window.SRUSearch && SRUSearch.roomSimulatorHref) {
    return SRUSearch.roomSimulatorHref(p, {
      photo,
      from: `${location.pathname}${location.search}#listings`,
    });
  }
  if (!(window.SRUSearch && SRUSearch.hasUsableRoomPhoto(p) && photo)) return "";
  return `/room-builder/?listing=${encodeURIComponent(p.id)}&photo=${encodeURIComponent(photo)}`;
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
  const photo = displayPhoto(p);
  const simHref = simulatorHrefFor(p);
  const status = listingStatusLabel(p);
  return `
      <article class="listing-card reveal" data-id="${p.id}">
        <div class="listing-media">
          <img src="${photo.src}" alt="${escapeHtml(p.address || p.title || "Home")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/photo-unavailable.svg'" />
          ${
            photo.source === "street_view"
              ? `<span class="sv-badge">Street View</span><span class="sv-attr">${photo.attribution || "© Google"}</span>`
              : photo.source === "placeholder"
                ? `<span class="sv-badge">${photo.label}</span>`
                : ""
          }
          <div class="listing-badges">
            <span class="badge status">${escapeHtml(status)}</span>
            <span class="badge gold">Blue Book</span>
            ${simHref ? `<span class="badge sim">3D ready</span>` : ""}
            ${p.smartScore ? `<span class="badge">Score ${p.smartScore.score}</span>` : ""}
            ${(p.deals || []).slice(0, 2).map((d) => `<span class="badge rent">${d.label}</span>`).join("")}
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
          <div class="listing-loc">📍 ${escapeHtml(p.location)}</div>
          <h3 class="listing-title">${escapeHtml(p.title)}</h3>
          <div class="listing-type">${escapeHtml(p.propertyType || "Home")} · ${p.beds} bd · ${p.baths} ba · ${Number(p.sqft || 0).toLocaleString()} sqft</div>
          <div class="listing-meta">
            <span>🛏 ${p.beds} beds</span>
            <span>🛁 ${p.baths} baths</span>
            <span>📐 ${Number(p.sqft || 0).toLocaleString()} sqft</span>
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
            <button class="btn btn-ghost" type="button" data-view="${p.id}">View details</button>
            ${simHref ? `<a class="btn btn-outline btn-sim" href="${simHref}">Visualize this home</a>` : ""}
            ${
              Array.isArray(p.publicRecords) && p.publicRecords.length
                ? `<span class="badge">Public records attached</span>`
                : ""
            }
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
    ["BTC (live)", (p) => (getBtcRate() ? formatBTC(p.offer / getBtcRate()) : "…")],
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
  const url = p.slug ? `${base}/property/${p.id}-${p.slug}/` : `${base}/?home=${encodeURIComponent(p.id)}#listings`;
  const btc = getBtcRate() ? ` · ${formatBTC(p.offer / getBtcRate())}` : "";
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

  const featured = ["Louisville", "Jeffersonville", "New Albany", "Utica", "Lexington"];
  const rest = [
    ...new Set(PROPERTIES.map(listingMarketName).filter(Boolean)),
  ].filter((c) => !featured.includes(c));
  const cities = [...featured.filter((c) => PROPERTIES.some((p) => listingMarketName(p) === c)), ...rest].slice(
    0,
    14
  );

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
    const saveLocal = () => {
      const key = "sru_waitlist_local";
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      if (!list.includes(email)) list.push(email);
      localStorage.setItem(key, JSON.stringify(list));
      msg.textContent = "You're on the list on this device.";
    };
    try {
      const live =
        window.SRU_AUTH?.hasLiveApi ? await window.SRU_AUTH.hasLiveApi() : false;
      if (live && window.SRU_AUTH.submitLead) {
        const data = await window.SRU_AUTH.submitLead({
          email,
          name,
          source: "homepage_waitlist",
          interest: "launch_updates",
        });
        msg.textContent = data.message || "You're on the list.";
      } else {
        saveLocal();
      }
      msg.classList.remove("hidden");
      msg.classList.add("ok");
      form.reset();
      toast("Waitlist joined.");
      track("waitlist_join", { email_domain: (email.split("@")[1] || "").slice(0, 40) });
    } catch (err) {
      if (err && (err.code === "NO_API" || err.status === 405 || err.status === 503)) {
        saveLocal();
        msg.classList.remove("hidden");
        msg.classList.add("ok");
        form.reset();
        toast("Waitlist joined.");
        track("waitlist_join", { email_domain: (email.split("@")[1] || "").slice(0, 40) });
      } else {
        msg.textContent = err.message || "Could not join — try again.";
        msg.classList.remove("hidden");
        msg.classList.remove("ok");
        track("waitlist_error");
      }
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

  if (sruMapLayerMode === "earth3d") {
    showEarth3d(filtered);
    return;
  }
  const earthHost = document.getElementById("earthHost");
  if (earthHost) earthHost.classList.add("hidden");
  canvas.classList.remove("hidden");

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

let sruMapLayerMode = "streets";
let sruStreetTiles = null;
let sruSatTiles = null;
let sruEarthView = null;

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
    if (!host.querySelector("#searchThisArea")) {
      const btn = document.createElement("button");
      btn.id = "searchThisArea";
      btn.type = "button";
      btn.className = "btn btn-ghost btn-sm";
      btn.textContent = "Search this map area";
      btn.style.cssText = "position:absolute;z-index:500;top:10px;left:50%;transform:translateX(-50%)";
      host.appendChild(btn);
      btn.addEventListener("click", async () => {
        const b = sruLeafletMap.getBounds();
        const qs = new URLSearchParams({
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
          limit: "40",
        });
        try {
          const base = window.SRU_AUTH?.apiBase?.() || "";
          const res = await fetch(`${base}/api/listings?${qs}`);
          const data = await res.json();
          if (data.ok && Array.isArray(data.listings) && typeof renderListings === "function") {
            window.SRU_MAP_RESULTS = data.listings;
            searchState.query = searchState.query || "map area";
            renderListings();
          }
        } catch {
          /* keep current pins */
        }
      });
    }
    sruStreetTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    });
    sruSatTiles = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles © Esri, Maxar, Earthstar Geographics",
      }
    );
    (sruMapLayerMode === "satellite" ? sruSatTiles : sruStreetTiles).addTo(sruLeafletMap);
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
    sub.textContent =
      sruMapLayerMode === "satellite"
        ? `${filtered.length} pin${filtered.length === 1 ? "" : "s"} · satellite`
        : `${filtered.length} pin${filtered.length === 1 ? "" : "s"} · streets`;
  }
}

async function showEarth3d(filtered) {
  const canvas = $("#mapCanvas");
  const earthHost = document.getElementById("earthHost");
  const sub = $("#mapSub");
  const foot = document.getElementById("mapFootnote");
  if (!earthHost) return;
  canvas.classList.add("hidden");
  earthHost.classList.remove("hidden");
  const first = filtered[0];
  const coords = first ? getCoords(first) : { lat: 38.194, lng: -85.564 };
  try {
    const { initEarthOverhead } = await import("/js/earth-overhead.js");
    if (!sruEarthView) {
      sruEarthView = await initEarthOverhead(earthHost, {
        lat: coords.lat,
        lng: coords.lng,
        title: first ? first.title : "Louisville, KY",
        height: 520,
        pitch: -68,
      });
    } else {
      sruEarthView.flyTo(coords.lat, coords.lng, first ? first.title : "Listings");
    }
    if (sub) sub.textContent = `${filtered.length} listing${filtered.length === 1 ? "" : "s"} · ${sruEarthView.credit}`;
    if (foot) foot.textContent = sruEarthView.credit;
  } catch {
    if (sub) sub.textContent = "Earth 3D failed to load";
  }
}

function initMapLayers() {
  document.querySelectorAll("[data-map-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-map-layer]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      sruMapLayerMode = btn.getAttribute("data-map-layer") || "streets";
      if (sruLeafletMap && sruStreetTiles && sruSatTiles && sruMapLayerMode !== "earth3d") {
        if (sruMapLayerMode === "satellite") {
          if (sruLeafletMap.hasLayer(sruStreetTiles)) sruLeafletMap.removeLayer(sruStreetTiles);
          if (!sruLeafletMap.hasLayer(sruSatTiles)) sruSatTiles.addTo(sruLeafletMap);
        } else {
          if (sruLeafletMap.hasLayer(sruSatTiles)) sruLeafletMap.removeLayer(sruSatTiles);
          if (!sruLeafletMap.hasLayer(sruStreetTiles)) sruStreetTiles.addTo(sruLeafletMap);
        }
      }
      renderMap(getFilteredProperties());
    });
  });
}

function renderListings() {
  const grid = $("#listingsGrid");
  if (!grid) return;

  const filtered = getFilteredProperties();
  const pageSize = (window.SRUSearch && SRUSearch.PAGE_SIZE) || 12;
  const page = Math.max(1, searchState.page || 1);
  const visible = filtered.slice(0, page * pageSize);
  const countEl = $("#resultsCount");
  if (countEl) {
    countEl.textContent = `${filtered.length} home${filtered.length === 1 ? "" : "s"}`;
  }
  const more = $("#loadMoreListings");
  if (more) {
    more.hidden = visible.length >= filtered.length;
    more.textContent = `Load more homes (${visible.length}/${filtered.length})`;
  }
  // Update the URL before rendering cards so every 3D link carries the
  // current search/filter state in its return path.
  persistSearchUrl();

  if (!filtered.length) {
    const searchedMarket = (searchState.query || "this search").trim();
    grid.innerHTML = `
      <div class="empty-results glass">
        <h3>No active homes found</h3>
        <p>There is no matching inventory for <strong>${escapeHtml(searchedMarket)}</strong> in the current source feed. Try Louisville or clear the filters; Smart Realty will not substitute courthouse records or unrelated cities.</p>
        <div class="empty-actions">
          <button type="button" class="btn btn-primary" id="clearFiltersBtn">Clear filters</button>
          <button type="button" class="btn btn-ghost" data-search="Louisville">Try Louisville</button>
          <a class="btn btn-outline" href="new-listings/?q=${encodeURIComponent(searchState.query || "Louisville")}">Search live HUD listings</a>
        </div>
      </div>`;
    renderMap([]);
    $("#clearFiltersBtn")?.addEventListener("click", clearMarketFilters);
    return;
  }

  grid.innerHTML = visible.map(listingCardHtml).join("");
  renderMap(visible);
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
    baths: 0,
    propertyType: "",
    rentableOnly: false,
    sort: "featured",
    page: 1,
    origin: searchState.origin || { lat: 38.2527, lng: -85.7585 },
  };
  activeFilter = "all";
  const q = $("#searchQuery");
  if (q) q.value = "";
  if ($("#heroLocation")) $("#heroLocation").value = "";
  if ($("#heroPrice")) $("#heroPrice").value = "0";
  if ($("#heroType")) $("#heroType").value = "";
  if ($("#heroBeds")) $("#heroBeds").value = "0";
  if ($("#heroBaths")) $("#heroBaths").value = "0";
  if ($("#filterPriceMin")) $("#filterPriceMin").value = "0";
  if ($("#filterPriceMax")) $("#filterPriceMax").value = "0";
  if ($("#filterBeds")) $("#filterBeds").value = "0";
  if ($("#filterBaths")) $("#filterBaths").value = "0";
  if ($("#filterType")) $("#filterType").value = "";
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
  if (searchState.baths) pills.push({ key: "baths", label: `${searchState.baths}+ baths` });
  if (searchState.propertyType) {
    const typeLabels = { house: "House", condo: "Condo / loft", town: "Townhome", estate: "Estate" };
    pills.push({ key: "type", label: typeLabels[searchState.propertyType] || searchState.propertyType });
  }
  if (searchState.rentableOnly) pills.push({ key: "rent", label: "Try Before Buy" });
  if (searchState.sort && searchState.sort !== "featured") {
    const sortLabels = {
      "price-asc": "Price ↑",
      "price-desc": "Price ↓",
      savings: "Biggest savings",
      sqft: "Largest",
      beds: "Beds",
      baths: "Baths",
      newest: "Newest",
      distance: "Distance",
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
    if ($("#heroLocation")) $("#heroLocation").value = "";
  } else if (key === "style") {
    activeFilter = "all";
    $$("#styleFilters .filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "all"));
  } else if (key === "min") {
    searchState.priceMin = 0;
    if ($("#filterPriceMin")) $("#filterPriceMin").value = "0";
  } else if (key === "max") {
    searchState.priceMax = 0;
    if ($("#filterPriceMax")) $("#filterPriceMax").value = "0";
    if ($("#heroPrice")) $("#heroPrice").value = "0";
  } else if (key === "beds") {
    searchState.beds = 0;
    if ($("#filterBeds")) $("#filterBeds").value = "0";
    if ($("#heroBeds")) $("#heroBeds").value = "0";
  } else if (key === "baths") {
    searchState.baths = 0;
    if ($("#filterBaths")) $("#filterBaths").value = "0";
    if ($("#heroBaths")) $("#heroBaths").value = "0";
  } else if (key === "type") {
    searchState.propertyType = "";
    if ($("#filterType")) $("#filterType").value = "";
    if ($("#heroType")) $("#heroType").value = "";
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

function initDealFinder() {
  const box = $("#dealFinder");
  const chips = $("#dealFinderChips");
  if (!box || !chips) return;
  const all = PROPERTIES.map((p) => (window.SRUScore && !p.smartScore ? SRUScore.decorate(p, PROPERTIES) : p));
  const groups = {};
  all.forEach((p) => {
    (p.deals || []).forEach((d) => {
      if (!groups[d.id]) groups[d.id] = { id: d.id, label: d.label, n: 0 };
      groups[d.id].n += 1;
    });
  });
  const items = Object.values(groups);
  if (!items.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  chips.innerHTML = items
    .map((g) => `<button type="button" class="chip" data-deal="${g.id}">${g.label} (${g.n})</button>`)
    .join("");
  chips.querySelectorAll("[data-deal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = "deals";
      searchState.query = "";
      $$("#styleFilters .filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "deals"));
      renderListings();
      toast(`${btn.textContent} — catalog signals only.`);
    });
  });
}

function initAlertsBar() {
  const emailEl = $("#alertEmail");
  if (emailEl && !emailEl.value) {
    try {
      emailEl.value = localStorage.getItem("sru_alert_email") || "";
    } catch {
      /* ignore */
    }
  }
  $("#saveSearchBtn")?.addEventListener("click", async () => {
    const email = ($("#alertEmail")?.value || "").trim();
    const q = ($("#searchQuery")?.value || "").trim() || "active homes";
    const msg = $("#alertMsg");
    try {
      localStorage.setItem("sru_alert_email", email);
      const res = await fetch("/api/alerts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, query: q }),
      });
      const data = await res.json();
      if (msg) msg.textContent = data.message || data.error || "Saved.";
    } catch {
      if (msg) msg.textContent = "Could not reach the alerts API. Start the Smart Realty server locally.";
    }
  });
  $("#viewAlertsBtn")?.addEventListener("click", async () => {
    const email = ($("#alertEmail")?.value || "").trim();
    const msg = $("#alertMsg");
    try {
      const res = await fetch("/api/alerts?email=" + encodeURIComponent(email));
      const data = await res.json();
      const notes = data.notifications || [];
      if (msg) {
        msg.textContent = notes.length
          ? notes.slice(0, 3).map((n) => n.message).join(" · ")
          : "No alerts yet. Hourly sync writes new matches here.";
      }
    } catch {
      if (msg) msg.textContent = "Alerts API offline.";
    }
  });
}

function searchQueryString() {
  const qs = new URLSearchParams();
  if (searchState.query) qs.set("q", searchState.query);
  if (searchState.priceMin) qs.set("min", String(searchState.priceMin));
  if (searchState.priceMax) qs.set("max", String(searchState.priceMax));
  if (searchState.beds) qs.set("beds", String(searchState.beds));
  if (searchState.baths) qs.set("baths", String(searchState.baths));
  if (searchState.propertyType) qs.set("type", searchState.propertyType);
  if (searchState.sort && searchState.sort !== "featured") qs.set("sort", searchState.sort);
  if (searchState.rentableOnly) qs.set("rent", "1");
  if (activeFilter && activeFilter !== "all") qs.set("style", activeFilter);
  return qs;
}

function persistSearchUrl() {
  if (!$("#marketSearchForm")) return;
  const qs = searchQueryString();
  const hash = location.hash && location.hash !== "#home" ? location.hash : (qs.toString() ? "#listings" : location.hash);
  const next = `${location.pathname}${qs.toString() ? `?${qs.toString()}` : ""}${hash || ""}`;
  if (`${location.pathname}${location.search}${location.hash}` !== next) {
    history.replaceState({}, "", next);
  }
  const live = $("#heroLiveListings");
  if (live) {
    const liveQs = new URLSearchParams();
    if (searchState.query) liveQs.set("q", searchState.query);
    if (searchState.priceMax) liveQs.set("maxPrice", String(searchState.priceMax));
    if (searchState.beds) liveQs.set("minBeds", String(searchState.beds));
    if (searchState.baths) liveQs.set("minBaths", String(searchState.baths));
    if (searchState.propertyType) liveQs.set("propertyType", searchState.propertyType);
    live.href = `new-listings/${liveQs.toString() ? `?${liveQs.toString()}` : ""}`;
  }
}

function applySearchStateToForms() {
  if ($("#searchQuery")) $("#searchQuery").value = searchState.query || "";
  if ($("#filterPriceMin")) $("#filterPriceMin").value = String(searchState.priceMin || 0);
  if ($("#filterPriceMax")) $("#filterPriceMax").value = String(searchState.priceMax || 0);
  if ($("#filterBeds")) $("#filterBeds").value = String(searchState.beds || 0);
  if ($("#filterBaths")) $("#filterBaths").value = String(searchState.baths || 0);
  if ($("#filterType")) $("#filterType").value = searchState.propertyType || "";
  if ($("#sortBy")) $("#sortBy").value = searchState.sort || "featured";
  if ($("#filterRentable")) $("#filterRentable").checked = Boolean(searchState.rentableOnly);
  $$("#styleFilters .filter-btn").forEach((b) => b.classList.toggle("active", (b.dataset.filter || "all") === (activeFilter || "all")));
  syncHeroFromSearchState();
  updateSearchClearBtn();
}

function syncHeroFromSearchState() {
  if ($("#heroLocation")) $("#heroLocation").value = searchState.query || "";
  if ($("#heroPrice")) $("#heroPrice").value = String(searchState.priceMax || 0);
  if ($("#heroType")) $("#heroType").value = searchState.propertyType || "";
  if ($("#heroBeds")) $("#heroBeds").value = String(searchState.beds || 0);
  if ($("#heroBaths")) $("#heroBaths").value = String(searchState.baths || 0);
}

function restoreSearchFromUrl() {
  const params = new URLSearchParams(location.search);
  if (![...params.keys()].length) return;
  if (params.get("q")) searchState.query = params.get("q");
  if (params.get("min")) searchState.priceMin = Number(params.get("min")) || 0;
  if (params.get("max")) searchState.priceMax = Number(params.get("max")) || 0;
  if (params.get("beds")) searchState.beds = Number(params.get("beds")) || 0;
  if (params.get("baths")) searchState.baths = Number(params.get("baths")) || 0;
  if (params.get("type")) searchState.propertyType = params.get("type") || "";
  if (params.get("sort")) searchState.sort = params.get("sort") || "featured";
  if (params.get("rent") === "1") searchState.rentableOnly = true;
  if (params.get("style")) activeFilter = params.get("style");
  applySearchStateToForms();
}

function initHeroSearch() {
  const form = $("#heroSearchForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    searchState.query = $("#heroLocation")?.value || "";
    searchState.priceMax = Number($("#heroPrice")?.value || 0);
    searchState.propertyType = $("#heroType")?.value || "";
    searchState.beds = Number($("#heroBeds")?.value || 0);
    searchState.baths = Number($("#heroBaths")?.value || 0);
    searchState.page = 1;
    applySearchStateToForms();
    if (searchState.query.trim()) saveRecentSearch(searchState.query);
    renderActiveFilters();
    renderListings();
    const listings = $("#listings");
    if (listings) listings.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    toast(`Showing homes for “${searchState.query || "all markets"}”.`);
  });
}

function compactListingCard(p) {
  enrichProperty(p);
  const photo = displayPhoto(p);
  const simHref = simulatorHrefFor(p);
  return `
    <article class="listing-card reveal" data-id="${p.id}">
      <div class="listing-media">
        <img src="${photo.src}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/photo-unavailable.svg'" />
        <div class="listing-badges">
          <span class="badge status">${escapeHtml(listingStatusLabel(p))}</span>
          ${simHref ? `<span class="badge sim">3D ready</span>` : ""}
        </div>
      </div>
      <div class="listing-body">
        <div class="listing-loc">${escapeHtml(p.location)}</div>
        <h3 class="listing-title">${escapeHtml(p.title)}</h3>
        <div class="listing-type">${escapeHtml(p.propertyType || "Home")} · ${p.beds} bd · ${p.baths} ba · ${Number(p.sqft || 0).toLocaleString()} sqft</div>
        <div class="price-stack">
          <div class="price-row offer"><span>Lowest offer</span><strong>${formatUSD(p.offer)}</strong></div>
        </div>
        <div class="listing-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-view="${p.id}">Details</button>
          ${simHref ? `<a class="btn btn-outline btn-sm btn-sim" href="${simHref}">Visualize this home</a>` : ""}
        </div>
      </div>
    </article>`;
}

function renderHomeRails() {
  const featured = [...PROPERTIES].sort((a, b) => (b.listPrice || 0) - (a.listPrice || 0)).slice(0, 4);
  const family = PROPERTIES.filter((p) => (p.tags || []).includes("family")).slice(0, 4);
  const featuredEl = $("#featuredRail");
  const recentEl = $("#recentRail");
  if (featuredEl) featuredEl.innerHTML = featured.map(compactListingCard).join("");
  if (recentEl) recentEl.innerHTML = (family.length ? family : PROPERTIES.slice(-4)).map(compactListingCard).join("");
}

function initMarketplace() {
  const form = $("#marketSearchForm");
  if (!form) return;

  renderQuickCities();
  renderRecentSearches();
  renderActiveFilters();
  initDealFinder();
  initAlertsBar();

  const syncFromForm = () => {
    searchState.query = $("#searchQuery")?.value || "";
    searchState.priceMin = Number($("#filterPriceMin")?.value || 0);
    searchState.priceMax = Number($("#filterPriceMax")?.value || 0);
    searchState.beds = Number($("#filterBeds")?.value || 0);
    searchState.baths = Number($("#filterBaths")?.value || 0);
    searchState.propertyType = $("#filterType")?.value || "";
    searchState.rentableOnly = Boolean($("#filterRentable")?.checked);
    searchState.sort = $("#sortBy")?.value || "featured";
    searchState.page = 1;
    syncHeroFromSearchState();
    const parsed = window.SRUSearch ? SRUSearch.parseQuery(searchState.query) : {};
    if (parsed.nearMe && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          searchState.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          renderListings();
        },
        () => {},
        { maximumAge: 600000, timeout: 4000 },
      );
    }
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

  $("#loadMoreListings")?.addEventListener("click", () => {
    searchState.page = (searchState.page || 1) + 1;
    renderListings();
  });

  ["filterPriceMin", "filterPriceMax", "filterBeds", "filterBaths", "filterType", "sortBy", "filterRentable"].forEach((id) => {
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
  const listingPhotos = propertyGallery(p);
  const photo = displayPhoto(p);
  const gallery = listingPhotos.length ? listingPhotos : photo.src ? [photo.src] : [];
  const n = gallery.length;
  const svLabel =
    !listingPhotos.length && photo.source === "street_view"
      ? `<span class="sv-badge">Street View</span><span class="sv-attr">${photo.attribution || "© Google"}</span>`
      : "";
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
      ${svLabel}
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
        ${p.smartScore ? `<span class="badge gold">Smart Realty Score ${p.smartScore.score}</span>` : ""}
        ${(p.deals || []).map((d) => `<span class="badge rent">${escapeHtml(d.label)}</span>`).join("")}
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
      ${
        p.smartScore
          ? `<div class="modal-desc"><h4>Smart Realty Score ${p.smartScore.score}/100</h4><ul>${(p.smartScore.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul><p class="g-fine">${escapeHtml(p.smartScore.disclaimer || "")}</p></div>`
          : ""
      }
      <p class="modal-desc">${p.desc}</p>
      ${
        Array.isArray(p.publicRecords) && p.publicRecords.length
          ? `<div class="modal-desc"><h4>Public records (secondary)</h4><ul>${p.publicRecords.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>`
          : ""
      }
      ${
        simulatorHrefFor(p)
          ? `<div class="pd-cta-row">
              <a class="btn btn-primary" href="${simulatorHrefFor(p)}">Open in 3D Room Simulator</a>
            </div>
            <p class="pd-viz-note">Estimated 3D preview from listing photos — not a scan or a guaranteed layout of this home.</p>`
          : ""
      }
      <div class="amenity-block">
        <h4>Highlights</h4>
        <ul class="amenity-list">${amenityHtml}</ul>
      </div>
      <p class="modal-desc btc-line">
        BTC equivalent (live): <strong style="color:var(--btc)">${
          getBtcRate() ? formatBTC(p.offer / getBtcRate()) : "loading…"
        }</strong>
        ${getBtcRate() ? `at ${formatUsdPrecise(getBtcRate())} / BTC (best live rate)` : "· fetching market rates…"}
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
      <div class="signin-gate modal-contact-gate" data-requires-auth data-gate-title="Unlock listing contact tools" data-gate-copy="Sign in free to contact Smart Realty about this home and watch its price.">
        <div class="signin-gate-content modal-actions">
          <a class="btn btn-primary" href="showing/?property=${encodeURIComponent(p.title + " · " + p.location)}&amp;city=${encodeURIComponent((p.location || "").split(",")[0] || "")}">Request a showing</a>
          <a class="btn btn-outline" href="buy/?property=${encodeURIComponent(p.title)}&amp;city=${encodeURIComponent((p.location || "").split(",")[0] || "")}">Buy inquiry</a>
          <button class="btn btn-outline" type="button" id="watchPriceBtn">Watch price</button>
          <button class="btn btn-ghost" type="button" id="askAboutProperty">Ask about this home</button>
        </div>
      </div>
      <div class="modal-actions">
        <a class="btn btn-ghost" href="invest/?property=${encodeURIComponent(p.title)}">Analyze</a>
        <button class="btn btn-btc" type="button" data-btc="${p.id}">₿ Purchase with Bitcoin</button>
        ${
          p.rentable
            ? `<button class="btn btn-outline" type="button" data-rent="${p.id}">Book Try-Before-Buy Stay</button>`
            : ""
        }
        ${p.slug ? `<a class="btn btn-ghost" href="property/${p.id}-${p.slug}/">View full page</a>` : ""}
        <button class="btn btn-ghost" type="button" id="shareProperty">Share</button>
        <button class="btn btn-ghost" type="button" id="sharePropertyX" title="Share on X">Share 𝕏</button>
        <button class="btn btn-ghost" type="button" id="sharePropertyLink" title="Copy link">Copy link</button>
        <button class="btn btn-ghost" type="button" id="favFromModal" data-fav="${p.id}">${fav ? "♥ Saved" : "♡ Save"}</button>
        <button class="btn btn-ghost" type="button" id="compareFromModal" data-compare-btn="${p.id}">${compareSet.has(p.id) ? "✓ In compare" : "＋ Compare"}</button>
      </div>
    </div>`;
  window.SRU_SUPABASE?.decorateGates(body);
  $("#propertyModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";

  pushRecentView(p.id);
  wirePayEstimator(p.offer);
  wirePropertyGallery(body.querySelector("[data-gallery-root]"));

  $("#watchPriceBtn")?.addEventListener("click", async () => {
    const email = ($("#alertEmail")?.value || prompt("Email for price-drop notices") || "").trim();
    if (!email) return;
    try {
      localStorage.setItem("sru_alert_email", email);
      const res = await fetch("/api/alerts/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, listingId: p.id, listingTitle: p.title, listPrice: p.listPrice || p.offer }),
      });
      const data = await res.json();
      toast(data.message || data.error || "Watch saved.");
    } catch {
      toast("Alerts API offline. Start the Smart Realty server to store watches.");
    }
  });
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
    if (getBtcRate() && monthly > 0) {
      $("#payMonthlyBtc").textContent = formatBTC(monthly / getBtcRate());
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
    const interestLabel = note ? `${interest}: ${note.slice(0, 100)}` : interest;
    const saveLocal = () => {
      const key = "sru_contact_local";
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push({ email, name, interest: interestLabel, at: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(list.slice(-40)));
      msg.textContent = "Saved on this device. We will follow up at this email.";
    };
    try {
      const live = window.SRU_AUTH?.hasLiveApi ? await window.SRU_AUTH.hasLiveApi() : false;
      if (live && window.SRU_AUTH.submitLead) {
        const data = await window.SRU_AUTH.submitLead({
          email,
          name,
          source: "support_contact",
          interest,
          intent: interest,
          message: note,
          consent: true,
        });
        msg.textContent = data.message || "Sent — we’ll be in touch.";
      } else {
        saveLocal();
      }
      msg.classList.remove("hidden");
      msg.classList.add("ok");
      form.reset();
      toast("Request saved.");
      track("contact_submit", { interest });
    } catch (err) {
      if (err && (err.code === "NO_API" || err.status === 405 || err.status === 503)) {
        saveLocal();
        msg.classList.remove("hidden");
        msg.classList.add("ok");
        form.reset();
        toast("Request saved.");
        track("contact_submit", { interest, fallback: true });
      } else {
        msg.textContent = err.message || "Could not send.";
        msg.classList.remove("hidden");
        msg.classList.remove("ok");
      }
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Partner offers (referral revenue) ----------
function renderPartnerOffers() {
  const section = $("#partners");
  const box = $("#partnerCards");
  if (!section || !box) return;

  const partners = (window.SRU_CONFIG && window.SRU_CONFIG.referralPartners) || {};
  const cards = Object.keys(partners)
    .map((key) => partners[key])
    .filter((p) => p && p.enabled && p.url);

  if (!cards.length) {
    section.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  box.innerHTML = cards
    .map(
      (p) => `
    <div class="biz-card glass">
      <strong>${escapeHtml(p.name || "Partner")}</strong>
      <p>${escapeHtml(p.blurb || "")}</p>
      <a class="btn btn-outline btn-sm partner-card-cta" href="${escapeHtml(p.url)}" target="_blank" rel="noopener sponsored" data-partner="${escapeHtml(p.name || "")}">Get started</a>
      <p class="partner-disclosure">${escapeHtml(p.disclosure || "Smart Realty USA may be compensated if you use this partner.")}</p>
    </div>`
    )
    .join("");

  section.classList.remove("hidden");

  box.querySelectorAll("[data-partner]").forEach((a) => {
    a.addEventListener("click", () => track("partner_click", { partner: a.dataset.partner }));
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
  const panel = $("#heroPanel");
  if (panel && panel.getAttribute("data-locked") === "copy") return;
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
  const sim = $("#heroPanel3d");
  if (sim) {
    const href = simulatorHrefFor(p);
    if (href) {
      sim.href = href;
      sim.hidden = false;
    } else {
      sim.hidden = true;
    }
  }
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

// ---------- Blue Book + Bitcoin (js/bluebook.js, js/bitcoin.js) ----------
function initBlueBook() {
  window.SRU_BLUEBOOK?.init({
    toast,
    formatUSD,
    getBtcRate,
    formatBTC,
    formatUsdPrecise,
  });
}

function initBitcoin() {
  window.SRU_BTC?.init({
    toast,
    requireSoftAuth,
    openChat,
    track,
    formatUSD,
    getProperties: () => PROPERTIES,
  });
}

function jumpToBtc(id) {
  if (window.SRU_BTC && window.SRU_BTC.jumpTo) window.SRU_BTC.jumpTo(id);
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
  return !!(
    window.SRU_SUPABASE?.session ||
    (window.SRU_AUTH && window.SRU_AUTH.isSignedIn && window.SRU_AUTH.isSignedIn())
  );
}

function isMemberAccount() {
  return isSignedInUser() || (authMode() === "open" && window.SRU_SUPABASE?.configured !== true);
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
  if ($("#softAuthSignup")) $("#softAuthSignup").href = `account.html?next=${next}`;
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
  if (window.SRU_SUPABASE?.session) return;
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
  const supabaseUser = window.SRU_SUPABASE?.session?.user || null;
  const legacyUser =
    (window.SRU_AUTH && window.SRU_AUTH.getUser && window.SRU_AUTH.getUser()) || null;
  const user = supabaseUser || legacyUser;
  if (user && box && nameEl) {
    const label = supabaseUser
      ? window.SRU_SUPABASE.userLabel(supabaseUser)
      : user.name || "Member";
    const first = label.split(" ")[0];
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
  "This chat is a demo assistant — not a live concierge. For a real reply, email ai@smartrealty.us.",
  "House Blue Book on this demo is a transparent offer next to a fair-value estimate. No hidden fees in the UI.",
  "Bitcoin quotes use live Coinbase/CoinGecko prices. The pay button does not move real funds.",
  "Try-Before-Buy is a product idea on this demo: stay first, then apply eligible nights toward a purchase.",
  "SMART REALTY.US LLC is owner-operated in Louisville. Phone 1-800-762-7879 · ai@smartrealty.us.",
  "This site runs on GitHub Pages, built solo by Andrew in Louisville. Free member access uses passwordless email magic links — we're in public demo now, ahead of full brokerage licensing.",
  "Want a Blue Book, a BTC quote, or a waitlist invite? I can point you to those sections — or email Andrew.",
];

let replyIndex = 0;

function appendChat(text, who = "agent") {
  const box = $("#chatMessages");
  const div = document.createElement("div");
  div.className = `chat-msg ${who}`;
  const label = who === "agent" ? "Demo assistant" : "You";
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
      "Hi — this is the Smart Realty demo assistant. It is not a 24/7 human desk. For Andrew, email ai@smartrealty.us. What do you want to know about the demo?"
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
    typing.textContent = "Assistant is typing…";
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
          getBtcRate()
            ? `Live Bitcoin is about ${formatUsdPrecise(getBtcRate())}/BTC (CoinGecko + Coinbase). Checkout can show a quote. No real funds move on this demo.`
            : "Bitcoin quotes are live market data. Pick a listing and open checkout to see the quote. This demo does not move real funds.";
      } else if (lower.includes("rent") || lower.includes("stay") || lower.includes("airbnb") || lower.includes("try")) {
        reply =
          "Try-Before-Buy is shown on this demo: book a stay on an eligible listing, then apply eligible nights toward a purchase. It is not a live reservation system yet.";
      } else if (lower.includes("blue book") || lower.includes("value") || lower.includes("price")) {
        reply =
          "Our free House Blue Book is like a Kelley Blue Book for homes — fair market value, comps, and our lowest transparent offer with no surprise fees.";
      } else if (lower.includes("phone") || lower.includes("call")) {
        reply = "Call 1-800-762-7879 or email ai@smartrealty.us. This is an owner-operated Louisville LLC — not a 24/7 call center.";
      } else if (lower.includes("security") || lower.includes("safe") || lower.includes("hack")) {
        reply =
          "The public site is static HTTPS on GitHub Pages + Cloudflare. The Bitcoin explorer is a read-only node. We do not run a 24/7 SOC or a live title vault.";
      }
      appendChat(reply, "agent");
    }, delay);
  });
}

// ---------- Header / nav / filters ----------
function initScrollSpy() {
  const sections = ["home", "tools", "listings", "bluebook", "bitcoin", "rentals", "business", "security", "support"]
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

  $$("#nav a").forEach((link) => {
    link.addEventListener("click", () => $("#nav")?.classList.remove("open"));
  });

  const toolsBtn = $("#navToolsBtn");
  const toolsMenu = $("#navToolsMenu");
  toolsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = toolsBtn.getAttribute("aria-expanded") === "true";
    toolsBtn.setAttribute("aria-expanded", open ? "false" : "true");
    if (toolsMenu) toolsMenu.hidden = open;
  });
  document.addEventListener("click", () => {
    if (!toolsBtn || !toolsMenu) return;
    toolsBtn.setAttribute("aria-expanded", "false");
    toolsMenu.hidden = true;
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

  document.addEventListener("click", async (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.preventDefault();
      const id = fav.dataset.fav;
      if (!isMemberAccount()) {
        if (window.SRU_SUPABASE?.configured) {
          window.SRU_SUPABASE.openSignIn({
            title: "Sign in to save this home",
            copy: "Your shortlist will sync across your signed-in devices.",
            next: location.href,
          });
        } else {
          location.href = window.SRU_SUPABASE?.authPageUrl?.(location.href) || "/auth.html";
        }
        return;
      }
      const shouldSave = !favorites.has(id);
      if (window.SRU_SUPABASE?.session) {
        try {
          await window.SRU_SUPABASE.setSavedListing(id, shouldSave);
        } catch (error) {
          toast(error.message || "Could not update saved homes.");
          return;
        }
      }
      if (shouldSave) favorites.add(id);
      else favorites.delete(id);
      toast(shouldSave ? "Saved to your shortlist." : "Removed from saved.");
      track(shouldSave ? "save_listing" : "unsave_listing", { id });
      localStorage.setItem("sru_favs", JSON.stringify([...favorites]));
      if (!window.SRU_SUPABASE?.session) maybeSaveHint();
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
      phoneDisplay: "502-539-1090",
      phoneTel: "+15025391090",
      isPrivateDemo: false,
      presenterMode: false,
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
  const phoneDisplay = cfg.phoneDisplay || "502-539-1090";
  const phoneTel = cfg.phoneTel || "+15025391090";
  $$("[data-phone]").forEach((el) => {
    el.textContent = phoneDisplay;
  });
  $$('a[href^="tel:"]').forEach((a) => {
    a.href = `tel:${phoneTel}`;
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

  // JSON-LD Organization + ItemList of demo homes (public SEO)
  const ld = $("#jsonLdOrg");
  if (ld && publicIndex) {
    const org = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: cfg.legalName || "SMART REALTY.US LLC",
      alternateName: cfg.siteName || "Smart Realty USA",
      url: siteUrl || "https://smartrealty.us",
      email,
      telephone: cfg.phoneTel || "+1-502-539-1090",
      description: "Kentucky LLC. Listing copy and software from Louisville. Not a licensed brokerage.",
      areaServed: "US",
      numberOfEmployees: 1,
      address: cfg.businessAddress
        ? {
            "@type": "PostalAddress",
            streetAddress: cfg.businessAddress,
            addressLocality: "Louisville",
            addressRegion: cfg.formationState || "KY",
            addressCountry: "US",
          }
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
  8. Email ai@smartrealty.us or call 1-800-762-7879

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
  restoreSearchFromUrl();
  initHeroSearch();
  initMarketplace();
  initMapLayers();
  setViewMode("grid");
  renderHomeRails();
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
  renderPartnerOffers();
  renderRecentViews();
  $("#clearRecentViews")?.addEventListener("click", () => {
    localStorage.removeItem(RECENT_VIEWS_KEY);
    renderRecentViews();
    toast("Recent views cleared.");
  });
  openDeepLinkedHome();

  document.addEventListener("sru:saved-listings", (event) => {
    favorites = new Set(event.detail?.listingIds || []);
    updateFavBadge();
    renderListings();
    if ($("#favDrawer")?.classList.contains("open")) renderFavoritesDrawer();
  });
  document.addEventListener("sru:auth-change", updateHeaderUser);

  // Show DUNS in footer if configured
  const cfg = getConfig();
  if (cfg.dunsNumber && $("#liveOnLine")) {
    const d = document.createElement("p");
    d.className = "live-on";
    d.textContent = `D‑U‑N‑S® ${cfg.dunsNumber}`;
    $("#liveOnLine").after(d);
  }
});
