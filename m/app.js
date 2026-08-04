/* Smart Realty — Android-style app controller */
(function () {
  const PROPERTIES = (window.SRU_PROPERTIES || []).map((p) => ({
    ...p,
    image: fixImg(p.image),
  }));
  const FAV_KEY = "sru_m_favs";
  const CITIES = [
    "Las Vegas",
    "Austin",
    "Miami",
    "Seattle",
    "Nashville",
    "Denver",
    "Chicago",
    "Boise",
    "Charleston",
    "Beverly Hills",
  ];

  let state = {
    screen: "home",
    query: "",
    tag: "all",
    min: 0,
    max: 0,
    beds: 0,
    rent: false,
    sort: "savings",
    view: "list",
    btc: null,
    btcPrev: null,
    favs: new Set(loadFavs()),
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function fixImg(src) {
    if (!src) return "../images/mansion-1.jpg";
    if (src.startsWith("http") || src.startsWith("../") || src.startsWith("/")) return src;
    return `../${src}`;
  }

  function loadFavs() {
    try {
      return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function saveFavs() {
    localStorage.setItem(FAV_KEY, JSON.stringify([...state.favs]));
  }

  function usd(n) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  function tickClock() {
    const d = new Date();
    $("#sbTime").textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function savings(p) {
    return p.listPrice - p.offer;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    let list = PROPERTIES.filter((p) => {
      if (state.tag !== "all" && !(p.tags || []).includes(state.tag)) return false;
      if (state.rent && !p.rentable) return false;
      if (state.beds && p.beds < state.beds) return false;
      if (state.min && p.offer < state.min) return false;
      if (state.max && p.offer > state.max) return false;
      if (!q) return true;
      const hay = `${p.title} ${p.location} ${(p.tags || []).join(" ")} ${p.desc}`.toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    if (state.sort === "price-asc") list.sort((a, b) => a.offer - b.offer);
    else if (state.sort === "price-desc") list.sort((a, b) => b.offer - a.offer);
    else if (state.sort === "savings") list.sort((a, b) => savings(b) - savings(a));
    return list;
  }

  function btcFor(usdAmount) {
    if (!state.btc) return "… BTC";
    return `${(usdAmount / state.btc).toFixed(4)} BTC`;
  }

  function go(screen) {
    state.screen = screen;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === screen));
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.nav === screen));
    if (screen === "search") {
      setTimeout(() => $("#searchInput")?.focus(), 120);
      renderResults();
    }
    if (screen === "home") renderHome();
    if (screen === "saved") renderSaved();
    if (screen === "you") renderYou();
    if (screen === "tools") renderTools();
  }

  function cardHtml(p, mode = "list") {
    const on = state.favs.has(p.id) ? "on" : "";
    const heart = `<button type="button" class="heart ${on}" data-fav="${p.id}" aria-label="Save">♥</button>`;
    if (mode === "feat") {
      return `<article class="feat-card" data-id="${p.id}">
        ${heart}
        <img src="${p.image}" alt="" loading="lazy" />
        <div class="feat-body">
          <h3>${esc(p.title)}</h3>
          <div class="feat-loc">📍 ${esc(p.location)}</div>
          <div class="price-row">
            <div>
              <div class="offer">${usd(p.offer)}</div>
              <div class="bb">Blue Book ${usd(p.blueBook)}</div>
            </div>
            <div class="bb">${btcFor(p.offer)}</div>
          </div>
        </div>
      </article>`;
    }
    return `<article class="home-card" data-id="${p.id}">
      ${heart}
      <img src="${p.image}" alt="" loading="lazy" />
      <div class="body">
        <h3>${esc(p.title)}</h3>
        <div class="meta">${p.beds} bd · ${p.baths} ba · ${p.sqft.toLocaleString()} sqft · ${esc(p.location)}</div>
        <div class="offer">${usd(p.offer)}</div>
        <div class="btc-line">₿ ${btcFor(p.offer)}</div>
      </div>
    </article>`;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderHome() {
    const cities = $("#quickCities");
    cities.innerHTML = CITIES.map(
      (c) => `<button type="button" class="chip" data-q="${esc(c)}">${esc(c)}</button>`
    ).join("");

    const featured = [...PROPERTIES].sort((a, b) => savings(b) - savings(a)).slice(0, 6);
    $("#featuredRail").innerHTML = featured.map((p) => cardHtml(p, "feat")).join("");

    const near = PROPERTIES.slice(0, 8);
    $("#homeList").innerHTML = near.map((p) => cardHtml(p)).join("");
    bindCards($("#screen-home"));
    updateSavedBadge();
  }

  function renderResults() {
    const list = filtered();
    $("#resultCount").textContent = `${list.length} home${list.length === 1 ? "" : "s"}`;
    const box = $("#results");
    box.classList.toggle("grid-mode", state.view === "grid");
    if (!list.length) {
      box.innerHTML = `<div class="empty-state">
        <div class="empty-ico">🔍</div>
        <h3>No matches</h3>
        <p>Try Las Vegas, Austin, or clear filters.</p>
        <button type="button" class="btn-filled" id="clearAll">Clear search</button>
      </div>`;
      $("#clearAll")?.addEventListener("click", () => {
        state.query = "";
        state.tag = "all";
        state.min = state.max = state.beds = 0;
        state.rent = false;
        $("#searchInput").value = "";
        $("#fMin").value = "0";
        $("#fMax").value = "0";
        $("#fBeds").value = "0";
        $("#fRent").checked = false;
        $$("#styleChips .chip").forEach((c) => c.classList.toggle("on", c.dataset.tag === "all"));
        renderResults();
        renderSuggest();
      });
      return;
    }
    box.innerHTML = list.map((p) => cardHtml(p)).join("");
    bindCards(box);
  }

  function renderSuggest() {
    const q = state.query.trim().toLowerCase();
    const panel = $("#suggestPanel");
    if (!q || state.screen !== "search") {
      panel.classList.add("hidden");
      return;
    }
    const items = [];
    CITIES.filter((c) => c.toLowerCase().includes(q)).forEach((c) =>
      items.push({ kind: "City", label: c, value: c })
    );
    PROPERTIES.forEach((p) => {
      if (
        p.title.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
      ) {
        items.push({ kind: "Home", label: p.title, value: p.title, id: p.id, sub: p.location });
      }
    });
    const uniq = [];
    const seen = new Set();
    for (const it of items) {
      const k = it.kind + it.label;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(it);
      if (uniq.length >= 8) break;
    }
    if (!uniq.length) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    panel.innerHTML = uniq
      .map(
        (it) => `<button type="button" class="suggest-item" data-value="${esc(it.value)}" data-id="${it.id || ""}">
        <span class="kind">${it.kind}</span>
        <strong>${esc(it.label)}</strong>
        ${it.sub ? `<small>${esc(it.sub)}</small>` : ""}
      </button>`
      )
      .join("");
    panel.querySelectorAll(".suggest-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (id) {
          openDetail(id);
          panel.classList.add("hidden");
          return;
        }
        state.query = btn.dataset.value;
        $("#searchInput").value = state.query;
        panel.classList.add("hidden");
        renderResults();
      });
    });
  }

  function renderSaved() {
    const box = $("#savedList");
    const list = PROPERTIES.filter((p) => state.favs.has(p.id));
    if (!list.length) {
      box.innerHTML = `<div class="empty-state">
        <div class="empty-ico">♡</div>
        <h3>No saved homes yet</h3>
        <p>Tap the heart on any listing to keep it here.</p>
        <button type="button" class="btn-filled" data-go="search">Search homes</button>
      </div>`;
      box.querySelector("[data-go]")?.addEventListener("click", () => go("search"));
      return;
    }
    box.innerHTML = `<div class="card-list">${list.map((p) => cardHtml(p)).join("")}</div>`;
    bindCards(box);
  }

  function renderTools() {
    if (state.btc) {
      $("#btcBig").textContent = `$${state.btc.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
  }

  function renderYou() {
    const user =
      (window.SRU_AUTH && window.SRU_AUTH.getUser && window.SRU_AUTH.getUser()) || null;
    if (user) {
      $("#pName").textContent = user.name || "Member";
      $("#pEmail").textContent = user.email || "";
      $("#avatar").textContent = (user.name || "M")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    } else {
      $("#pName").textContent = "Guest";
      $("#pEmail").textContent = "Not signed in";
      $("#avatar").textContent = "SR";
    }
  }

  function updateSavedBadge() {
    const b = $("#savedBadge");
    const n = state.favs.size;
    if (n > 0) {
      b.textContent = String(n);
      b.classList.remove("hidden");
    } else b.classList.add("hidden");
  }

  function bindCards(root) {
    root.querySelectorAll("[data-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-fav]")) return;
        openDetail(el.dataset.id);
      });
    });
    root.querySelectorAll("[data-fav]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.fav;
        if (state.favs.has(id)) {
          state.favs.delete(id);
          btn.classList.remove("on");
          toast("Removed from saved");
        } else {
          state.favs.add(id);
          btn.classList.add("on");
          toast("Saved");
        }
        saveFavs();
        updateSavedBadge();
      });
    });
  }

  function openDetail(id) {
    const p = PROPERTIES.find((x) => x.id === id);
    if (!p) return;
    const on = state.favs.has(p.id);
    $("#detailBody").innerHTML = `
      <img class="detail-hero" src="${p.image}" alt="" />
      <div class="detail-pad">
        <div style="margin-bottom:8px">${(p.tags || [])
          .map((t) => `<span class="tag-pill">${esc(t)}</span>`)
          .join("")}</div>
        <h2>${esc(p.title)}</h2>
        <div class="detail-loc">📍 ${esc(p.location)} · ${p.beds} bd · ${p.baths} ba · ${p.sqft.toLocaleString()} sqft</div>
        <div class="price-stack">
          <div class="price-box"><span>List</span><strong>${usd(p.listPrice)}</strong></div>
          <div class="price-box"><span>Blue Book</span><strong>${usd(p.blueBook)}</strong></div>
          <div class="price-box offer"><span>Lowest offer</span><strong>${usd(p.offer)}</strong></div>
          <div class="price-box"><span>In Bitcoin</span><strong style="color:var(--btc)">₿ ${btcFor(p.offer)}</strong></div>
        </div>
        <p class="detail-desc">${esc(p.desc)}</p>
        ${
          p.rentable
            ? `<p class="muted">Try-before-buy from <strong>${usd(p.nightly)}</strong>/night · up to ${p.creditPercent}% credit toward purchase.</p>`
            : ""
        }
        <div class="detail-actions">
          <button type="button" class="btn-btc" id="dBtc">₿ Buy with Bitcoin (demo)</button>
          <button type="button" class="btn-tonal" id="dFav">${on ? "♥ Saved" : "♡ Save home"}</button>
          <button type="button" class="btn-outline" id="dChat">Message support</button>
        </div>
      </div>`;
    $("#detailSheet").classList.remove("hidden");
    $("#scrim").classList.remove("hidden");
    $("#dBtc").onclick = () => toast(`Demo BTC quote: ${btcFor(p.offer)} · 15‑min lock`);
    $("#dFav").onclick = () => {
      if (state.favs.has(p.id)) state.favs.delete(p.id);
      else state.favs.add(p.id);
      saveFavs();
      updateSavedBadge();
      openDetail(p.id);
      toast(state.favs.has(p.id) ? "Saved" : "Removed");
    };
    $("#dChat").onclick = () => {
      location.href = "mailto:ai@smartrealty.us?subject=" + encodeURIComponent("About " + p.title);
    };
  }

  function closeDetail() {
    $("#detailSheet").classList.add("hidden");
    $("#scrim").classList.add("hidden");
  }

  async function loadBtc() {
    try {
      const r = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
        cache: "no-store",
      });
      const j = await r.json();
      const price = Number(j?.data?.amount);
      if (price > 0) {
        state.btcPrev = state.btc;
        state.btc = price;
        $("#btcPrice").textContent = `$${Math.round(price).toLocaleString()}`;
        $("#btcBig").textContent = `$${Math.round(price).toLocaleString()}`;
        const chg = $("#btcChg");
        if (state.btcPrev) {
          const d = price - state.btcPrev;
          chg.textContent = `${d >= 0 ? "▲" : "▼"} $${Math.abs(d).toFixed(0)}`;
          chg.className = "btc-chg " + (d >= 0 ? "up" : "down");
        } else chg.textContent = "live";
        // refresh visible cards prices in btc
        if (state.screen === "home") renderHome();
        if (state.screen === "search") renderResults();
      }
    } catch {
      $("#btcPrice").textContent = "offline";
    }
  }

  function wire() {
    $$(".nav-item").forEach((n) => n.addEventListener("click", () => go(n.dataset.nav)));
    $$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

    $("#openSearchHome").addEventListener("click", () => go("search"));
    $("#searchBack").addEventListener("click", () => go("home"));

    const input = $("#searchInput");
    input.addEventListener("input", () => {
      state.query = input.value;
      $("#searchClear").classList.toggle("hidden", !input.value);
      renderSuggest();
      renderResults();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        $("#suggestPanel").classList.add("hidden");
        renderResults();
        input.blur();
      }
    });
    $("#searchClear").addEventListener("click", () => {
      input.value = "";
      state.query = "";
      $("#searchClear").classList.add("hidden");
      renderSuggest();
      renderResults();
      input.focus();
    });

    $("#filterToggle").addEventListener("click", () => {
      $("#filterSheet").classList.toggle("hidden");
    });

    $("#fMin").addEventListener("change", (e) => {
      state.min = Number(e.target.value) || 0;
      renderResults();
    });
    $("#fMax").addEventListener("change", (e) => {
      state.max = Number(e.target.value) || 0;
      renderResults();
    });
    $("#fBeds").addEventListener("change", (e) => {
      state.beds = Number(e.target.value) || 0;
      renderResults();
    });
    $("#fSort").addEventListener("change", (e) => {
      state.sort = e.target.value;
      renderResults();
    });
    $("#fRent").addEventListener("change", (e) => {
      state.rent = e.target.checked;
      renderResults();
    });

    $$("#styleChips .chip").forEach((c) => {
      c.addEventListener("click", () => {
        $$("#styleChips .chip").forEach((x) => x.classList.remove("on"));
        c.classList.add("on");
        state.tag = c.dataset.tag;
        renderResults();
      });
    });

    $$(".vt").forEach((v) => {
      v.addEventListener("click", () => {
        $$(".vt").forEach((x) => x.classList.remove("on"));
        v.classList.add("on");
        state.view = v.dataset.view;
        renderResults();
      });
    });

    $("#quickCities").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-q]");
      if (!chip) return;
      state.query = chip.dataset.q;
      $("#searchInput").value = state.query;
      go("search");
    });

    $("#detailClose").addEventListener("click", closeDetail);
    $("#scrim").addEventListener("click", closeDetail);

    $("#bbRun").addEventListener("click", () => {
      const beds = Number($("#bbBeds").value) || 3;
      const sqft = Number($("#bbSqft").value) || 1800;
      const loc = $("#bbLoc").value || "your area";
      // simple demo estimator
      const base = 280 * sqft + beds * 25000;
      const bb = Math.round(base * 0.96);
      const offer = Math.round(base * 0.92);
      const el = $("#bbResult");
      el.classList.remove("hidden");
      el.innerHTML = `<strong>${esc(loc)}</strong><br/>
        Est. market ~ ${usd(base)}<br/>
        Blue Book ~ <strong>${usd(bb)}</strong><br/>
        Smart Realty lowest offer stack ~ <strong style="color:var(--secondary)">${usd(offer)}</strong><br/>
        <small class="muted">Demo model only — not an appraisal.</small>`;
    });

    $("#btnSignOut").addEventListener("click", () => {
      if (window.SRU_AUTH) window.SRU_AUTH.logout();
      toast("Signed out");
      renderYou();
    });

    $("#homeNotif").addEventListener("click", () => toast("No new alerts"));
  }

  // boot
  tickClock();
  setInterval(tickClock, 30000);
  wire();
  renderHome();
  loadBtc();
  setInterval(loadBtc, 30000);

  // deep link ?q=
  const params = new URLSearchParams(location.search);
  if (params.get("q")) {
    state.query = params.get("q");
    $("#searchInput").value = state.query;
    go("search");
  }
})();
