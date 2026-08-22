import { initRoomBuilder } from "/js/room-builder.js";
import { reconstructRoom } from "/js/room-pipeline.js";
import { CATALOG_TREE, SAMPLE_PRODUCTS, VENDOR_OPTIONS, productsInGroup, money } from "/js/room-catalog.js";

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

export async function bootRoomSim() {
  const canvas = document.getElementById("simCanvas");
  if (!canvas) return;

  const params = new URLSearchParams(location.search);
  const listingId = params.get("listing") || "";
  const photoUrl = params.get("photo") || "";

  const builder = initRoomBuilder(canvas);
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
  builder.onRoomChange = refreshTotal;
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
  if (back) back.href = "/#listings";

  if (listingId) {
    track("listing_view", { listingId });
    try {
      const res = await fetch("/api/listings?limit=200");
      const data = await res.json();
      const listing = Array.isArray(data.listings) ? data.listings.find((row) => row.id === listingId) : null;
      if (listing) {
        listingTitle = listing.title || listing.address || "Property";
        const photos = (listing.images && listing.images.length ? listing.images : listing.image ? [listing.image] : []).filter(Boolean);
        const room = await reconstructRoom({ photoUrl: photoUrl || photos[0] || "", listingId, roomType: "living" });
        builder.applyReconstruction(room);
      }
    } catch {
      /* default shell */
    }
  } else if (photoUrl) {
    const room = await reconstructRoom({ photoUrl, roomType: "living" });
    builder.applyReconstruction(room);
  }

  const backLabel = document.getElementById("simBackLabel");
  if (backLabel) backLabel.textContent = listingTitle === "Property" ? "Property" : listingTitle;

  renderCatalog();
  track("3d_preview_open", { listingId });
  await builder.autoFurnish();
  refreshTotal();
  builder.resize();
  builder.setTimeOfDay(14);
}
