import { initRoomBuilder } from "/js/room-builder.js?v=20260824k";
import { reconstructRoom } from "/js/room-pipeline.js?v=20260824j";
import { CATALOG_TREE, SAMPLE_PRODUCTS, VENDOR_OPTIONS, productsInGroup, money } from "/js/room-catalog.js?v=20260824j";

function track(event, props) {
  window.SRU_ANALYTICS?.track(event, props);
  if (window.SRU_SHOP_API !== true) return;
  fetch("/api/shop/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, props }),
    keepalive: true,
  }).catch(() => {});
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function hourLabel(h) {
  const hr = Math.round(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  const twelve = ((hr + 11) % 12) + 1;
  return `${twelve}:00 ${ampm}`;
}

function apiOrigin() {
  const configured = window.SRU_AUTH?.apiBase?.();
  if (configured && !/:878[89]$/.test(configured)) return String(configured).replace(/\/$/, "");
  if (typeof location !== "undefined" && /^878[89]$/.test(location.port)) return "http://127.0.0.1:8787";
  return typeof location !== "undefined" ? location.origin : "";
}

function listingPhotos(listing = {}) {
  const images = Array.isArray(listing.images) ? listing.images.slice() : [];
  if (listing.image) images.unshift(listing.image);
  const street = listing.primaryImageSource === "street_view" || listing.imageSource === "street_view";
  return [...new Set(images.filter(Boolean))].filter((src) => {
    if (/maps\.googleapis\.com\/maps\/api\/streetview/i.test(src)) return false;
    if (street && src === listing.image && images.length === 1) return false;
    return true;
  });
}

function absPhoto(u) {
  if (!u) return "";
  if (/^(https?:|data:)/i.test(u)) return u;
  if (u.startsWith("//")) return `${location.protocol}${u}`;
  if (u.startsWith("/")) return `${location.origin}${u}`;
  return `${location.origin}/${u}`;
}

function persistKey(listingId) {
  return `sru.room.${listingId || "sample-living"}`;
}

function slugify(value) {
  return String(value || "home")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function catalogListing(listingId) {
  const rows = Array.isArray(window.SRU_PROPERTIES) ? window.SRU_PROPERTIES : [];
  return rows.find((row) => String(row.id) === String(listingId)) || null;
}

function propertyHref(listing) {
  if (!listing?.id) return "";
  return `/property/${encodeURIComponent(listing.id)}-${slugify(listing.slug || listing.title)}/`;
}

function sameOriginReturnHref(value) {
  if (!value) return "";
  try {
    const target = new URL(value, location.origin);
    if (target.origin !== location.origin) return "";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "";
  }
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function showStillFallback(message, photo) {
  const canvas = document.getElementById("simCanvas");
  const fallback = document.getElementById("simFallback");
  const stage = document.getElementById("simFallbackStage");
  const msg = document.getElementById("simFallbackMsg");
  const loading = document.getElementById("simLoading");
  if (canvas) canvas.hidden = true;
  if (fallback) fallback.hidden = false;
  if (msg) msg.textContent = message || "3D is unavailable. Showing a still visualization.";
  if (stage) {
    stage.innerHTML = photo
      ? `<img src="${esc(photo)}" alt="Listing photo used as a still visualization" /><p>Estimated visualization — not a 3D scan.</p>`
      : `<p>No listing photo available for a still preview.</p>`;
  }
  if (loading) loading.hidden = true;
  document.querySelector(".sim-hud")?.classList.add("is-fallback");
}

export async function bootRoomSim() {
  const canvas = document.getElementById("simCanvas");
  if (!canvas) return;

  const params = new URLSearchParams(location.search);
  const listingId = params.get("listing") || "";
  const photoUrl = params.get("photo") || "";
  const from = params.get("from") || "";
  const bundledListing = catalogListing(listingId);
  const returnHref =
    sameOriginReturnHref(from) ||
    propertyHref(bundledListing) ||
    (listingId ? `/new-listings/?id=${encodeURIComponent(listingId)}` : "/#room-sim");
  const fallbackBack = document.getElementById("simFallbackBack");
  if (fallbackBack) fallbackBack.href = returnHref;

  if (!webglAvailable()) {
    showStillFallback("This browser cannot run WebGL. A still visualization is shown instead.", absPhoto(photoUrl));
    return;
  }

  let builder;
  try {
    builder = initRoomBuilder(canvas);
  } catch (err) {
    console.error(err);
    showStillFallback("The 3D engine could not start. A still visualization is shown instead.", photoUrl);
    return;
  }
  const hud = {
    catalog: document.getElementById("simCatalog"),
    items: document.getElementById("simItems"),
    cats: document.getElementById("simCats"),
    groups: document.getElementById("simGroups"),
    vendors: document.getElementById("simVendors"),
    float: document.getElementById("simFloat"),
    sheet: document.getElementById("simSheet"),
    loading: document.getElementById("simLoading"),
    total: document.getElementById("simTotalValue"),
    hint: document.getElementById("simHint"),
    time: document.getElementById("simTime"),
    timeVal: document.getElementById("simTimeVal"),
    title: document.getElementById("simListingTitle"),
  };

  let department = CATALOG_TREE[0].id;
  let group = CATALOG_TREE[0].groups[0].id;
  let vendor = "all";
  let selected = null;
  let replaceMode = false;
  let listingTitle = "Property";

  builder.onBusyChange = (busy) => {
    if (hud.loading) hud.loading.hidden = !busy;
  };
  builder.onRoomChange = () => {
    refreshTotal();
    try {
      localStorage.setItem(persistKey(listingId), JSON.stringify(builder.exportDesign()));
    } catch {
      /* private mode / quota */
    }
  };
  builder.onTime = (hour) => {
    if (hud.timeVal) hud.timeVal.textContent = hourLabel(hour);
    if (hud.time && Number(hud.time.value) !== hour) hud.time.value = String(hour);
  };
  builder.onMode = (mode) => {
    document.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-mode") === mode);
    });
    if (hud.hint) {
      hud.hint.textContent =
        mode === "walk"
          ? "WASD walk · drag to look · click furniture to inspect"
          : "Drag to orbit · click furniture to move · scroll to zoom";
    }
  };

  builder.onSelect = (product, mesh) => {
    selected = product;
    replaceMode = false;
    if (!product) {
      hud.float.hidden = true;
      return;
    }
    hud.float.hidden = false;
    hud.float.querySelector("h3").textContent = product.name;
    hud.float.querySelector(".price").textContent = `~${money(product.price)} planning estimate`;
    hud.float.querySelector(".meta").textContent = [
      product.store,
      [product.widthIn, product.heightIn, product.depthIn].filter(Boolean).join(" × ") + " in",
      "confirm price and availability at retailer",
    ]
      .filter(Boolean)
      .join(" · ");
    const buy = hud.float.querySelector(".buy");
    const href = product.affiliateUrl || product.productUrl || "";
    buy.href = href || "#";
    buy.textContent = product.monetized ? "BUY (affiliate)" : `OPEN ${String(product.store || "RETAILER").toUpperCase()}`;
    buy.style.opacity = href ? "1" : "0.65";
    placeFloat(mesh);
    track("product_impression", { sku: product.sku, source: "selected" });
  };

  function placeFloat() {
    if (!selected || hud.float.hidden) return;
    const pos = builder.projectSelected();
    if (!pos) return;
    const pad = 16;
    const x = Math.min(window.innerWidth - 140, Math.max(140, pos.x));
    const y = Math.min(window.innerHeight - 220, Math.max(90, pos.y));
    hud.float.style.left = `${x}px`;
    hud.float.style.top = `${y}px`;
    void pad;
  }
  setInterval(placeFloat, 80);

  function refreshTotal() {
    const total = builder.roomTotal();
    if (hud.total) hud.total.textContent = `~${money(total)}`;
  }

  function renderCatalog() {
    const dept = CATALOG_TREE.find((d) => d.id === department) || CATALOG_TREE[0];
    hud.cats.innerHTML = CATALOG_TREE.map(
      (d) => `<button type="button" class="${d.id === department ? "is-active" : ""}" data-dept="${d.id}">${esc(d.label)}</button>`
    ).join("");
    hud.groups.innerHTML = dept.groups
      .map((g) => `<button type="button" class="${g.id === group ? "is-active" : ""}" data-group="${g.id}">${esc(g.label)}</button>`)
      .join("");
    hud.vendors.innerHTML = VENDOR_OPTIONS.map(
      (v) => `<button type="button" class="${v.id === vendor ? "is-active" : ""}" data-vendor="${esc(v.id)}">${esc(v.label)}</button>`
    ).join("");
    const items = productsInGroup(group, vendor);
    if (!items.length) {
      const vendorLabel = VENDOR_OPTIONS.find((v) => v.id === vendor)?.label || "This vendor";
      hud.items.innerHTML = `<button class="sim-item" disabled><strong>No ${esc(vendorLabel)} items in this category</strong><small>Try another category or All vendors.</small></button>`;
      return;
    }
    hud.items.innerHTML = items
      .map(
        (p) => `<button type="button" class="sim-item" data-id="${esc(p.id)}">
          <div class="sim-swatch" style="background:${esc(p.swatch || "#888")}"></div>
          <strong>${esc(p.name)}</strong>
          <small class="vendor">${esc(p.store)}</small>
          <small>Planning model · check retailer</small>
          <div class="row"><span>~${money(p.price)}</span><small>Place</small></div>
        </button>`
      )
      .join("");
    items.forEach((p) => track("product_impression", { sku: p.sku, category: p.group }));
  }

  hud.cats.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-dept]");
    if (!btn) return;
    department = btn.getAttribute("data-dept");
    const dept = CATALOG_TREE.find((d) => d.id === department);
    group = dept.groups[0].id;
    renderCatalog();
  });
  hud.groups.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group]");
    if (!btn) return;
    group = btn.getAttribute("data-group");
    renderCatalog();
  });
  hud.vendors.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-vendor]");
    if (!btn) return;
    vendor = btn.getAttribute("data-vendor") || "all";
    renderCatalog();
  });
  hud.items.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    const product = SAMPLE_PRODUCTS.find((p) => p.id === btn.getAttribute("data-id"));
    if (!product) return;
    if (replaceMode && selected) {
      await builder.replaceSelected(product);
      track("product_added_to_room", { sku: product.sku, replace: true });
      replaceMode = false;
      return;
    }
    await builder.beginPlace(product);
    hud.catalog.classList.remove("is-open");
    if (hud.hint) hud.hint.textContent = "Move the preview · green is clear · click to place · Esc cancels";
    track("product_added_to_room", { sku: product.sku, preview: true });
  });

  document.getElementById("simCatToggle")?.addEventListener("click", () => {
    hud.catalog.classList.toggle("is-open");
    if (hud.catalog.classList.contains("is-open")) builder.setMode("orbit");
  });
  document.getElementById("simBuild")?.addEventListener("click", () => {
    builder.setMode("orbit");
    hud.catalog.classList.add("is-open");
  });
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode");
      if (mode === "orbit") hud.catalog.classList.add("is-open");
      if (mode === "walk") hud.catalog.classList.remove("is-open");
      builder.setMode(mode);
    });
  });
  document.getElementById("simReset")?.addEventListener("click", () => builder.resetRoom());
  document.getElementById("simAuto")?.addEventListener("click", () => builder.autoFurnish());
  document.getElementById("simUndo")?.addEventListener("click", () => builder.undoLast());
  document.getElementById("simRedo")?.addEventListener("click", () => builder.redoLast());
  hud.time?.addEventListener("input", () => builder.setTimeOfDay(Number(hud.time.value)));

  document.getElementById("simPause")?.addEventListener("click", () => {
    const next = !builder.paused;
    builder.setPaused(next);
    const btn = document.getElementById("simPause");
    if (btn) {
      btn.textContent = next ? "RESUME" : "PAUSE";
      btn.setAttribute("aria-pressed", String(next));
    }
    if (hud.hint) hud.hint.textContent = next ? "Rendering paused · resume to orbit and walk" : "Drag to orbit · pinch or scroll to zoom";
  });
  document.getElementById("simFull")?.addEventListener("click", async () => {
    const root = document.querySelector(".sim-root");
    if (!root) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch {
      if (hud.hint) hud.hint.textContent = "Fullscreen is not available in this browser";
    }
  });
  document.getElementById("simShare")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      if (hud.hint) hud.hint.textContent = "Link copied — this listing’s 3D view, saved on this device";
    } catch {
      if (hud.hint) hud.hint.textContent = "Copy the address bar to share this listing’s 3D view";
    }
  });
  document.querySelectorAll("[data-room]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("[data-room]").forEach((b) => b.classList.toggle("is-on", b === btn));
      builder.applyRoomPreset(btn.getAttribute("data-room"));
      if (hud.hint) hud.hint.textContent = "Room size is an estimate for staging — not measured from this home";
      await builder.autoFurnish();
    });
  });
  document.querySelectorAll("[data-finish]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-finish]").forEach((b) => b.classList.toggle("is-on", b === btn));
      builder.setFinish(btn.getAttribute("data-finish"));
      if (hud.hint) hud.hint.textContent = "Finish preset applied — visualization only";
    });
  });
  const onboard = document.getElementById("simOnboard");
  try {
    if (onboard && !localStorage.getItem("sru.room.onboarded")) {
      onboard.hidden = false;
    }
  } catch {
    if (onboard) onboard.hidden = false;
  }
  document.getElementById("simOnboardGo")?.addEventListener("click", () => {
    if (onboard) onboard.hidden = true;
    try {
      localStorage.setItem("sru.room.onboarded", "1");
    } catch {
      /* private mode */
    }
  });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    builder.setPaused(false);
    if (hud.hint) hud.hint.textContent = "Reduced motion on · orbit and walk still work, auto-spin is off";
  }

  hud.float.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.getAttribute("data-act");
    if (!act || !selected) return;
    if (act === "rotate") builder.rotateSelected(Math.PI / 2);
    if (act === "move") {
      if (hud.hint) hud.hint.textContent = "Drag the piece across the floor · it snaps to walls";
    }
    if (act === "delete") {
      builder.removeItem(selected.instanceId);
      track("product_removed", { sku: selected.sku });
    }
    if (act === "duplicate") builder.duplicateSelected();
    if (act === "replace") {
      replaceMode = true;
      hud.catalog.classList.add("is-open");
      if (hud.hint) hud.hint.textContent = "Pick a catalog item to swap in";
    }
    if (act === "buy") {
      track(selected.monetized ? "affiliate_click" : "product_click", { sku: selected.sku });
    }
  });

  document.getElementById("simBuyRoom")?.addEventListener("click", () => openBuySheet());
  document.getElementById("simSheetClose")?.addEventListener("click", () => {
    hud.sheet.hidden = true;
  });

  function openBuySheet() {
    const items = builder.placedList();
    const total = builder.roomTotal();
    const list = items
      .map((p) => `<li><span>${esc(p.name)} · ${esc(p.store)}</span><span>~${money(p.price)}</span></li>`)
      .join("");
    hud.sheet.querySelector(".lines").innerHTML = list || "<li><span>Empty room</span><span>$0</span></li>";
    hud.sheet.querySelector(".grand").textContent = `PLANNING TOTAL — ~${money(total)}`;
    hud.sheet.hidden = false;
    track("room_saved", { listingId, total, count: items.length, preview: true });
  }

  const back = document.getElementById("simBack");
  if (back) back.href = returnHref;
  if (fallbackBack) fallbackBack.href = returnHref;

  let photos = photoUrl ? [photoUrl] : [];
  let listing = bundledListing;
  if (listingId) {
    track("listing_view", { listingId });
    try {
      const res = await fetch(`${apiOrigin()}/api/listings/${encodeURIComponent(listingId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.listing) listing = data.listing;
      }
    } catch {
      /* Static hosting uses the bundled demo catalog loaded by the page. */
    }
    if (listing) {
      listingTitle = listing.address || listing.title || "Property";
      const gallery = listingPhotos(listing);
      if (gallery.length) photos = gallery;
      if (photoUrl && !photos.includes(photoUrl)) photos.unshift(photoUrl);
      const loc = listing.location || [listing.city, listing.state, listing.postalCode].filter(Boolean).join(" ");
      const facts = [
        listing.listPrice ? money(listing.listPrice) : "",
        listing.beds ? `${listing.beds} bd` : "",
        listing.baths ? `${listing.baths} ba` : "",
        listing.sqft ? `${Number(listing.sqft).toLocaleString("en-US")} sqft` : "",
      ].filter(Boolean);
      const bar = document.getElementById("simListingBar");
      const addrEl = document.getElementById("simListingAddr");
      const metaEl = document.getElementById("simListingMeta");
      if (bar && addrEl && metaEl) {
        addrEl.textContent = [listingTitle, loc].filter(Boolean).join(" · ");
        metaEl.textContent = `${facts.join(" · ")} · Property-inspired visualization, not a measured scan`;
        bar.hidden = false;
      }
      document.title = `3D Room · ${listingTitle} — Smart Realty USA`;
    }
  }
  const room = await reconstructRoom({ photoUrl: absPhoto(photos[0] || ""), listingId, roomType: "living" });
  builder.applyReconstruction(room);
  const resolved = photos.map(absPhoto).filter(Boolean);
  try {
    if (resolved.length) builder.setListingPhotos(resolved);
    renderPhotoStrip(resolved);
  } catch (err) {
    console.error(err);
  }

  function renderPhotoStrip(urls) {
    const strip = document.getElementById("simPhotos");
    if (!strip) return;
    if (!urls.length) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;
    strip.innerHTML = urls
      .map(
        (u, i) =>
          `<button type="button" class="sim-photo${i === 0 ? " is-on" : ""}" data-photo="${esc(u)}"><img src="${esc(u)}" alt="Listing photo ${i + 1}" /></button>`
      )
      .join("");
    strip.querySelectorAll("[data-photo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const picked = btn.getAttribute("data-photo");
        const next = [picked, ...urls.filter((u) => u !== picked)];
        builder.setListingPhotos(next);
        strip.querySelectorAll(".sim-photo").forEach((b) => b.classList.toggle("is-on", b === btn));
      });
    });
  }

  const backLabel = document.getElementById("simBackLabel");
  if (backLabel) backLabel.textContent = listingTitle === "Property" ? "Property" : listingTitle;

  renderCatalog();
  track("3d_preview_open", { listingId });
  let restored = false;
  try {
    const raw = localStorage.getItem(persistKey(listingId));
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && Array.isArray(saved.items) && saved.items.length) {
      restored = await builder.loadDesign(saved);
      if (restored && hud.hint) hud.hint.textContent = "Restored your last layout for this listing · AUTO FURNISH to start over";
    }
  } catch {
    restored = false;
  }
  if (!restored) {
    try {
      await builder.autoFurnish();
    } catch (err) {
      console.error(err);
      if (hud.hint) hud.hint.textContent = "Auto-furnish hit a snag · tap AUTO FURNISH to retry";
    }
  }
  refreshTotal();
  builder.resize();
  builder.setTimeOfDay(14);
}
