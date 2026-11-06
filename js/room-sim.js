import { PROPERTY_PHOTO_ROOMS } from "/js/room-photo-previews.mjs?v=20261106b";
import { initRoomBuilder } from "/js/room-builder.js?v=20261105a";
import { feetAndInches } from "/js/room-distance.mjs?v=20260911b";
import { applyListedSize, DEFAULT_LIVING_ROOM, listPropertyRooms, planningRoom, reconstructHouse, reconstructRoom } from "/js/room-pipeline.js?v=20261106list";
import { readRoomPlanFile } from "/js/roomplan-import.mjs?v=20260915a";
import { CATALOG_TREE, SAMPLE_PRODUCTS, VENDOR_OPTIONS, productsInGroup, money } from "/js/room-catalog.js?v=20261106rooms";

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

function priceLabel(item) {
  return Number(item.price) > 0 ? `~${money(item.price)}` : "Check retailer price";
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
  const images = [...(Array.isArray(listing.images) ? listing.images : []),
    ...(Array.isArray(listing.galleryImages) ? listing.galleryImages : [])];
  const street = listing.primaryImageSource === "street_view" || listing.imageSource === "street_view";
  if (listing.image && !street) images.unshift(listing.image);
  return images.map(absPhoto).filter(Boolean);
}

function absPhoto(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value, location.origin + "/");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    if (url.hostname === "maps.googleapis.com" && url.pathname.includes("/streetview")) return "";
    if (/(^|\/)(NoImage|placeholder|photo-unavailable)(\.[a-z]+)?$/i.test(url.pathname)) return "";
    return url.href;
  } catch { return ""; }
}

function persistKey(listingId, roomId = "sample-living") {
  return `sru.room.${listingId || "sample"}.${roomId}`;
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
  const isSampleDemo = params.get("demo") === "1" && !listingId;
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
  let readyToSave = false;
  let activeRoomId = "sample-living";
  const saveStatus = document.getElementById("simSaveStatus");

  function saveDesign() {
    if (!readyToSave) return;
    try {
      localStorage.setItem(persistKey(listingId, activeRoomId), JSON.stringify(builder.exportDesign()));
      if (saveStatus) saveStatus.textContent = "Saved on this device";
    } catch {
      if (saveStatus) saveStatus.textContent = "Storage unavailable · save an image";
    }
  }

  builder.onBusyChange = (busy) => {
    if (hud.loading) {
      hud.loading.hidden = !busy;
      if (busy) hud.loading.textContent = "Preparing furniture…";
    }
  };
  builder.onRoomChange = () => {
    refreshTotal();
    refreshMeasureChoices();
    document.querySelectorAll("[data-finish]").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.finish === builder.finish);
    });
    saveDesign();
  };
  builder.onTime = (hour) => {
    if (hud.timeVal) hud.timeVal.textContent = hourLabel(hour);
    if (hud.time && Number(hud.time.value) !== hour) hud.time.value = String(hour);
  };
  builder.onMode = (mode) => {
    if (mode !== "plan") document.getElementById("simMeasurePanel").hidden = true;
    document.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-mode") === mode);
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-mode") === mode));
    });
    if (hud.hint) {
      hud.hint.textContent =
        mode === "walk"
          ? "WASD walk · drag to look · click furniture to inspect"
          : mode === "plan"
            ? "Grid: 1 ft · dimensions use your room settings · drag to pan · scroll to zoom"
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
    hud.float.querySelector(".price").textContent = priceLabel(product);
    hud.float.querySelector(".meta").textContent = [
      product.store,
      [product.widthIn, product.heightIn, product.depthIn].filter(Boolean).join(" × ") + " in",
      "try it in this room, then open the retailer",
      "the store pays a commission only if its program attributes the purchase",
    ]
      .filter(Boolean)
      .join(" · ");
    hud.float.querySelector('[data-act="rotate"]').disabled = product.meshStyle === "tv";
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
    const query = document.getElementById("simSearch")?.value.trim().toLowerCase() || "";
    const sort = document.getElementById("simSort")?.value || "recommended";
    const items = productsInGroup(group, vendor).filter((p) =>
      `${p.name} ${p.store}`.toLowerCase().includes(query)
    );
    if (sort === "price-low") items.sort((a, b) => a.price - b.price);
    if (sort === "price-high") items.sort((a, b) => b.price - a.price);
    document.getElementById("simResultCount").textContent = `${items.length} items`;
    if (!items.length) {
      const vendorLabel = VENDOR_OPTIONS.find((v) => v.id === vendor)?.label || "This vendor";
      hud.items.innerHTML = `<div class="sim-item"><strong>No matching ${esc(vendorLabel)} items</strong><small>Clear your search or try another category or retailer.</small></div>`;
      return;
    }
    hud.items.innerHTML = items
      .map(
        (p) => `<button type="button" class="sim-item" data-id="${esc(p.id)}">
          <div class="sim-swatch" style="background:${esc(p.swatch || "#888")}"></div>
          <strong>${esc(p.name)}</strong>
          <small class="vendor">${esc(p.store)}</small>
          <small>Planning model · check retailer</small>
          <div class="row"><span>${priceLabel(p)}</span><small>Place</small></div>
        </button>`
      )
      .join("");
    items.forEach((p) => track("product_impression", { sku: p.sku, category: p.group }));
  }

  document.getElementById("simSearch")?.addEventListener("input", renderCatalog);
  document.getElementById("simSort")?.addEventListener("change", renderCatalog);
  document.getElementById("simImage")?.addEventListener("click", () => {
    try {
      const link = document.createElement("a");
      link.href = builder.screenshot();
      link.download = `smart-realty-${slugify(listingTitle)}-room.png`;
      link.click();
      hud.hint.textContent = "Room image downloaded";
    } catch {
      hud.hint.textContent = "Image export unavailable for this photo. Try your device’s screenshot controls.";
    }
  });

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
    if (hud.hint) hud.hint.textContent = product.meshStyle === "tv"
      ? "Click a clear wall to mount the TV · Esc cancels"
      : "Move the preview until it fits · click to see it in this room · Esc cancels";
    track("product_added_to_room", { sku: product.sku, store: product.store, vendor: product.vendor, preview: true });
  });

  document.getElementById("simCatToggle")?.addEventListener("click", () => {
    hud.catalog.classList.toggle("is-open");
    if (hud.catalog.classList.contains("is-open") && builder.getMode() === "walk") builder.setMode("orbit");
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
      if (mode === "plan") hud.catalog.classList.remove("is-open");
      builder.setMode(mode);
    });
  });
  function refreshMeasureChoices() {
    for (const id of ["simMeasureA", "simMeasureB"]) {
      const select = document.getElementById(id);
      const previous = select.value;
      select.innerHTML = '<option value="">Choose furniture</option>' + builder.placedList().map((p, i) =>
        `<option value="${esc(p.instanceId)}">${i + 1}. ${esc(p.name)}</option>`).join("");
      if ([...select.options].some(option => option.value === previous)) select.value = previous;
    }
    updateDistance();
  }
  function updateDistance() {
    const a = document.getElementById("simMeasureA").value;
    const b = document.getElementById("simMeasureB").value;
    const distance = builder.measureFurniture(a, b);
    if (document.getElementById("simMeasurePanel").hidden) builder.clearGapLine();
    document.getElementById("simMeasureResult").textContent = distance === null
      ? "Choose two different pieces."
      : distance < 0.0001 ? "Footprints touch or overlap — no gap"
      : `Gap: ${feetAndInches(distance)}`;
  }
  document.getElementById("simMeasure")?.addEventListener("click", () => {
    builder.setMode("plan");
    hud.catalog.classList.remove("is-open");
    document.getElementById("simMeasurePanel").hidden = false;
    refreshMeasureChoices();
  });
  document.getElementById("simMeasureClose")?.addEventListener("click", () => {
    builder.clearGapLine();
    document.getElementById("simMeasurePanel").hidden = true;
  });
  for (const id of ["simMeasureA", "simMeasureB"]) document.getElementById(id).addEventListener("change", updateDistance);

  document.getElementById("simReset")?.addEventListener("click", () => builder.resetRoom());
  document.getElementById("simEmpty")?.addEventListener("click", () => {
    builder.clearRoom();
    hud.hint.textContent = "Room cleared · Undo restores your furniture";
  });
  const sizeDialog = document.getElementById("simSizeDialog");
  const sizeForm = document.getElementById("simSizeForm");
  document.getElementById("simDimensions")?.addEventListener("click", () => {
    const room = builder.exportDesign().reconstruction;
    for (const key of ["width", "depth", "height"]) {
      sizeForm.elements[key].value = (room[key] / 0.3048).toFixed(1);
    }
    document.getElementById("simSizeError").textContent = "";
    sizeDialog.showModal();
  });
  document.getElementById("simSizeCancel")?.addEventListener("click", () => sizeDialog.close());
  sizeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = ["width", "depth", "height"].map((key) => Number(sizeForm.elements[key].value) * 0.3048);
    if (!builder.setRoomDimensions(...values)) {
      document.getElementById("simSizeError").textContent = "Enter dimensions within the listed limits.";
      return;
    }
    sizeDialog.close();
    hud.hint.textContent = "Room resized · check furniture clearance · Undo restores the previous size";
  });
  document.getElementById("simAuto")?.addEventListener("click", () => builder.autoFurnish());
  document.getElementById("simUndo")?.addEventListener("click", () => builder.undoLast());
  document.getElementById("simRedo")?.addEventListener("click", () => builder.redoLast());
  hud.time?.addEventListener("input", () => {
    builder.setTimeOfDay(Number(hud.time.value));
    saveDesign();
  });

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
      if (hud.hint) hud.hint.textContent = selected.meshStyle === "tv" ? "Drag the TV along a clear wall" : "Drag the piece across the floor";
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
      track("vendor_referral", {
        sku: selected.sku,
        store: selected.store || "",
        vendor: selected.vendor || "",
        listingId,
        roomId: activeRoomId,
        monetized: Boolean(selected.monetized),
      });
      if (hud.hint) {
        hud.hint.textContent = "Opening the retailer. This introduction is recorded for SMART REALTY.US LLC. The store pays a commission only if its program attributes the purchase. Nothing is charged here.";
      }
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
      .map((p) => {
        const label = esc(p.name) + " · " + esc(p.store);
        const url = absPhoto(p.affiliateUrl || p.productUrl);
        const link = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
        return `<li><span>${link}</span><span>${priceLabel(p)}</span></li>`;
      })
      .join("");
    hud.sheet.querySelector(".lines").innerHTML = list || "<li><span>Empty room</span><span>$0</span></li>";
    hud.sheet.querySelector(".grand").textContent = `PLANNING TOTAL — ~${money(total)}`;
    hud.sheet.hidden = false;
    track("room_saved", { listingId, total, count: items.length, preview: true });
  }

  const back = document.getElementById("simBack");
  if (back) back.href = returnHref;
  if (fallbackBack) fallbackBack.href = returnHref;

  if (hud.loading) { hud.loading.hidden = false; hud.loading.textContent = "Loading property photos…"; }
  let photos = photoUrl ? [photoUrl] : [];
  let listing = bundledListing;
  if (listingId) {
    track("listing_view", { listingId });
    try {
      const res = await fetch(`${apiOrigin()}/api/listings/${encodeURIComponent(listingId)}`, { signal: AbortSignal.timeout(10000) });
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
        metaEl.textContent = `${facts.join(" · ")} · Room sizes follow the listed square footage unless a photo estimate replaces them. Not a measured scan`;
        bar.hidden = false;
      }
      document.title = `3D Room · ${listingTitle} — Smart Realty USA`;
    }
  }
  document.getElementById("simListingBar").hidden = false;
  const photoPreviews=PROPERTY_PHOTO_ROOMS[listingId] || [];
  function photoFileName(url) {
    try {
      return decodeURIComponent(new URL(url, location.origin).pathname.split("/").at(-1) || "");
    } catch {
      return "";
    }
  }
  function showRoomPreview(room, urls) {
    const link=document.getElementById("simReviewedRoom");
    if (!link) return;
    const files=urls.map(photoFileName).filter(Boolean);
    const preview=photoPreviews.find(entry=>entry.photoFiles.some(name=>files.includes(name))) ||
      photoPreviews.find(entry=>room.id===entry.id || room.id===`reference-${entry.id}` || room.id===`plan-${entry.id}`);
    link.hidden=!preview;
    if(preview){
      link.href=preview.href;
      link.textContent=`Open photo-matched ${preview.label.toLowerCase()} ↗`;
    }
  }
  function showPhotoMatch(room) {
    const matchStatus = document.getElementById("simPhotoMatch");
    if (!matchStatus) return;
    matchStatus.dataset.state = ["vision", "lidar"].includes(room.mode) ? "vision" : "sample";
    matchStatus.textContent = room.mode === "lidar"
      ? "Measured LiDAR / RoomPlan geometry · imported locally"
      : room.mode === "vision"
      ? `AI estimate from ${room.sourcePhotoUrls?.length || 1} photo${room.sourcePhotoUrls?.length === 1 ? "" : "s"} · ${room.analysis?.confidence || "low"} confidence`
      : room.sizeSource === "listed-sqft"
        ? `About ${Math.round(room.width / 0.3048)}×${Math.round(room.depth / 0.3048)} ft from the listed ${Number(room.listedSqft).toLocaleString("en-US")} sqft · not a measured scan`
      : room.mode === "planning"
        ? "Editable planning template · room dimensions unverified"
      : room.analysis?.errorCode === "openai_credits_exhausted"
        ? "Photo analysis unavailable · reference photo with a sample shell"
        : "Sample room · photo analysis unavailable";
    matchStatus.title = room.label || "";
  }

  const resolved = [...new Set(photos.map(absPhoto).filter(Boolean))];
  if (hud.loading) hud.loading.textContent = "Loading rooms…";
  const rooms = listPropertyRooms(listing, resolved);
  if (!rooms.length) rooms.push({ ...DEFAULT_LIVING_ROOM, id: "sample-room" });
  const seenByType = {};
  for (let i = 0; i < rooms.length; i += 1) {
    const type = rooms[i].roomType || "other";
    const total = rooms.filter((room) => (room.roomType || "other") === type).length;
    const index = seenByType[type] || 0;
    seenByType[type] = index + 1;
    rooms[i] = applyListedSize(rooms[i], listing, index, total);
  }
  const customKey = `sru.room.list.${listingId || "sample"}`;
  let customRooms = [];
  try {
    const stored = JSON.parse(localStorage.getItem(customKey) || "[]");
    if (Array.isArray(stored)) customRooms = stored.filter((room) => room?.id && room?.label);
  } catch { /* Storage can be disabled. */ }
  rooms.push(...customRooms.map((room) => planningRoom(room.id, "other", room.label)));
  const originalImage = document.getElementById("simOriginalImage");
  const originalButton = document.getElementById("simOriginalPhoto");
  originalButton.addEventListener("click", () => document.getElementById("simPhotoDialog").showModal());

  function roomPhotos(room) {
    const indexed = Array.isArray(room.photoIndices) ? room.photoIndices.map((index) => resolved[index]).filter(Boolean) : [];
    return indexed.length ? indexed : (room.sourcePhotoUrls || [room.sourcePhotoUrl]).filter(Boolean);
  }

  let photoAnalysisRequest = 0;
  function renderPhotoStrip(urls, selected = urls[0], room = {}) {
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
          `<button type="button" class="sim-photo${u === selected ? " is-on" : ""}" data-photo="${esc(u)}"><img src="${esc(u)}" alt="View ${i + 1} of this room" /></button>`
      )
      .join("");
    strip.querySelectorAll("[data-photo]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const requestId = ++photoAnalysisRequest;
        const picked = btn.getAttribute("data-photo");
        originalImage.src = picked;
        const next = [picked, ...urls.filter((u) => u !== picked)];
        builder.setListingPhotos(next.slice(0, 4));
        strip.querySelectorAll(".sim-photo").forEach((b) => b.classList.toggle("is-on", b === btn));
        // Measured and planning shells stay put. A photo estimate replaces them only after a vision result.
        if (room.mode !== "vision") return;
        if (hud.hint) hud.hint.textContent = "Analyzing selected room view…";
        try {
          const analyzed = await reconstructRoom({ photoUrl: picked, photoUrls: next, listingId, roomType: room.roomType });
          if (requestId !== photoAnalysisRequest) return;
          if (analyzed.mode !== "vision") {
            if (hud.hint) hud.hint.textContent = "Photo analysis unavailable · current room kept";
            return;
          }
          const updated = { ...analyzed, id: room.id, photoIndices: room.photoIndices };
          Object.assign(room, updated);
          builder.applyReconstruction(updated);
          if (room.mode === "vision") builder.setListingPhotos(next);
          showPhotoMatch(updated);
          if (hud.hint) hud.hint.textContent = "Selected view analyzed · room dimensions estimated";
        } catch {
          if (requestId === photoAnalysisRequest && hud.hint) hud.hint.textContent = "Photo analysis could not finish · current room kept";
        }
      });
    });
  }

  let roomSwitch = Promise.resolve();
  function queueRoom(room) {
    roomSwitch = roomSwitch.catch(console.error).then(() => selectRoom(room));
    return roomSwitch;
  }

  async function selectRoom(room) {
    if (!room) return false;
    ++photoAnalysisRequest;
    if (readyToSave) saveDesign();
    readyToSave = false;
    builder.clearRoom({ resetHistory: true });
    activeRoomId = room.id || `room-${rooms.indexOf(room) + 1}`;
    builder.applyReconstruction(room);
    const urls = roomPhotos(room);
    showRoomPreview(room,urls);
    if (urls.length) {
      originalImage.src = urls[0];
      originalButton.disabled = false;
    } else {
      originalImage.removeAttribute("src");
      originalButton.disabled = true;
    }
    builder.setListingPhotos(urls.slice(0, 4));
    renderPhotoStrip(urls, urls[0], room);
    showPhotoMatch(room);
    const deptFor = { bedroom: "bedroom", bathroom: "bath", living: "living", dining: "living", kitchen: "living" };
    const nextDept = CATALOG_TREE.find((dept) => dept.id === deptFor[room.roomType]);
    if (nextDept) {
      department = nextDept.id;
      group = nextDept.groups[0].id;
      renderCatalog();
    }
    document.querySelectorAll("[data-house-room]").forEach((button) => {
      const selected = button.dataset.houseRoom === activeRoomId;
      button.classList.toggle("is-on", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    let restored = false;
    try {
      const raw = localStorage.getItem(persistKey(listingId, activeRoomId));
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && Array.isArray(saved.items)) restored = await builder.loadDesign(saved);
    } catch { restored = false; }
    readyToSave = true;
    saveDesign();
    refreshTotal();
    refreshMeasureChoices();
    return restored;
  }

  const roomNav = document.getElementById("simRooms");
  function appendRoom(room) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.houseRoom = room.id;
    button.setAttribute("aria-pressed", "false");
    button.textContent = room.label;
    button.addEventListener("click", () => queueRoom(room).catch(console.error));
    roomNav.hidden = false;
    roomNav.append(button);
  }
  rooms.forEach(appendRoom);
  const roomDialog = document.getElementById("simAddRoomDialog");
  const roomName = document.getElementById("simRoomName");
  document.getElementById("simAddRoom").addEventListener("click", () => roomDialog.showModal());
  roomDialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = roomName.value.trim();
    if (!name) return;
    const room = planningRoom(`custom-${crypto.randomUUID()}`, "other", `${name} · template`);
    customRooms.push({ id: room.id, label: room.label });
    try { localStorage.setItem(customKey, JSON.stringify(customRooms)); } catch { /* Storage can be disabled. */ }
    rooms.push(room);
    appendRoom(room);
    roomName.value = "";
    roomDialog.close();
    queueRoom(room).catch(console.error);
  });
  document.getElementById("simCancelRoom").addEventListener("click", () => roomDialog.close());
  const requestedRoom = params.get("room") || "";
  const requestedPhoto = absPhoto(photoUrl);
  const initial = (requestedRoom && rooms.find((room) => room.id === requestedRoom || room.id === `reference-${requestedRoom}` || room.roomType === requestedRoom))
    || (requestedPhoto && rooms.find((room) => roomPhotos(room).includes(requestedPhoto)))
    || rooms.find((room) => room.roomType === "living")
    || rooms[0];
  const restored = await queueRoom(initial);
  reconstructHouse({ photoUrls: resolved, listingId }).then((house) => {
    const visionRooms = (house?.rooms || []).filter((room) => room.mode === "vision");
    visionRooms.forEach((vision) => {
      const match = rooms.find((room) => room.mode !== "lidar" && room.mode !== "vision" && room.roomType === vision.roomType);
      if (!match) return;
      const kept = { id: match.id, label: match.label, photoIndices: match.photoIndices, sourcePhotoUrls: match.sourcePhotoUrls };
      Object.assign(match, vision, kept);
      if (activeRoomId === match.id && builder.placedList().length === 0) builder.applyReconstruction(match);
    });
  }).catch(() => {});

  const lidarInput = document.getElementById("simLidarFile");
  document.getElementById("simLidar")?.addEventListener("click", () => lidarInput?.click());
  lidarInput?.addEventListener("change", async () => {
    const file = lidarInput.files?.[0];
    if (!file) return;
    hud.hint.textContent = "Reading measured RoomPlan geometry…";
    try {
      const lidarRoom = await readRoomPlanFile(file);
      rooms.push(lidarRoom);
      appendRoom(lidarRoom);
      await queueRoom(lidarRoom);
      hud.hint.textContent = "Measured empty shell imported locally · ready to build";
      track("lidar_room_imported", { listingId, vertices: lidarRoom.floorPolygon.length });
    } catch (error) {
      hud.hint.textContent = error instanceof Error ? error.message : "This RoomPlan scan could not be imported.";
    } finally {
      lidarInput.value = "";
    }
  });

  const backLabel = document.getElementById("simBackLabel");
  if (backLabel) {
    backLabel.textContent = listingTitle === "Property"
      ? (isSampleDemo ? "Back to listings" : "Property")
      : listingTitle;
  }

  renderCatalog();
  if (hud.loading) hud.loading.hidden = true;
  try {
    if (onboard && !localStorage.getItem("sru.room.onboarded")) onboard.hidden = false;
  } catch { if (onboard) onboard.hidden = false; }
  track("3d_preview_open", { listingId });
  if (hud.hint) hud.hint.textContent = restored
    ? "Restored your saved layout for this room · switch rooms anytime"
    : "Room ready · add furniture or choose another room";
  refreshTotal();
  builder.resize();
  if (!restored) builder.setTimeOfDay(14);
  document.querySelectorAll("[data-finish]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.finish === builder.finish);
  });
  readyToSave = true;
  refreshMeasureChoices();
  saveDesign();
}
