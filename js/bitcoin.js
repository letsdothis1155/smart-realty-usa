/* Live BTC spot, ticker, 15-minute quote lock, and demo checkout. */
(function (w) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** Demo-only checkout. Flip when a licensed escrow path exists. */
  const DEMO_FLOW = true;
  const STALE_MS = 45 * 1000;
  const FAILED_MS = 90 * 1000;

  let btcRate = 0;
  let rateIsFallback = false;
  let lockedRate = 0;
  let lockedPropertyId = "";
  let btcRateGecko = 0;
  let btcRateCoinbase = 0;
  let btcRateBinance = 0;
  let btcRatePrev = 0;
  let btcChange24h = null;
  let btcLastUpdated = null;
  let btcStreamMode = "connecting";
  let btcTickCount = 0;
  let btcSessionOpen = null;
  let btcLastSource = "";
  const btcPriceHistory = [];
  const BTC_HISTORY_MAX = 120;
  const QUOTE_SECONDS = 15 * 60;
  const FAST_POLL_MS = 900;
  const GECKO_REFRESH_MS = 60 * 1000;
  const WS_COINBASE = "wss://ws-feed.exchange.coinbase.com";
  const WS_BINANCE = "wss://stream.binance.com:9443/ws/btcusdt@trade";
  const BTC_BINANCE_MAX_RETRIES = 6;

  let quoteSecondsLeft = QUOTE_SECONDS;
  let quoteTimerId = null;
  let rateRefreshId = null;
  let geckoRefreshId = null;
  let btcSocket = null;
  let btcWsRetries = 0;
  let lastStreamAt = 0;
  let btcSocketBinance = null;
  let btcBinanceRetries = 0;
  let restPollIndex = 0;

  const hooks = {
    toast: () => {},
    requireSoftAuth: (_action, onAllow) => onAllow && onAllow(),
    openChat: () => {},
    track: () => {},
    formatUSD: (n) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n),
    getProperties: () => w.SRU_PROPERTIES || [],
  };

  function formatBTC(n) {
    return `${n.toFixed(6)} BTC`;
  }

  function formatUsdPrecise(n) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  }

  function quoteRate() {
    return lockedRate || btcRate || 0;
  }

  function btcForOffer(offer) {
    if (!btcRate) return null;
    return offer / btcRate;
  }

  function lockQuote(reason) {
    if (!(btcRate > 0) || rateIsFallback) return;
    lockedRate = btcRate;
    lockedPropertyId = $("#btcProperty")?.value || lockedPropertyId;
    quoteSecondsLeft = QUOTE_SECONDS;
    if ($("#btcTimer")) $("#btcTimer").textContent = formatTimer(quoteSecondsLeft);
    updateQuoteLockUi(reason);
  }

  function updateQuoteLockUi(reason) {
    const lockEl = $("#btcLockedRate");
    const liveEl = $("#btcLiveSpot");
    const status = $("#btcLockStatus");
    const box = $("#btcCheckout");
    const timerWrap = $("#btcQuoteLock");
    if (lockEl) lockEl.textContent = lockedRate ? `${formatUsdPrecise(lockedRate)} / BTC` : "—";
    if (liveEl) liveEl.textContent = btcRate ? `${formatUsdPrecise(btcRate)} / BTC` : "—";
    if (status) {
      if (btcStreamMode === "failed") status.textContent = "Feed failed — demo fallback";
      else if (rateIsFallback) status.textContent = "Stale demo rate";
      else if (lockedRate) status.textContent = DEMO_FLOW ? "Demo quote locked" : "Quote locked";
      else status.textContent = "Waiting for a lockable rate";
    }
    if (timerWrap) {
      timerWrap.classList.toggle("is-expiring", quoteSecondsLeft > 0 && quoteSecondsLeft <= 60);
      timerWrap.classList.toggle("is-locked", lockedRate > 0);
    }
    box?.classList.toggle("has-lock", lockedRate > 0);
    if (reason === "rolled" && $("#btcTimer")) {
      flashPriceEl($("#btcTimer"), "tick");
    }
  }

  function flashPriceEl(el, direction) {
    if (!el) return;
    el.classList.remove("flash-up", "flash-down", "flash-tick");
    void el.offsetWidth;
    if (direction === "up") el.classList.add("flash-up");
    else if (direction === "down") el.classList.add("flash-down");
    else el.classList.add("flash-tick");
  }

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
    if (last && Math.abs(last - price) < 0.05 && btcPriceHistory.length > 5) {
      btcPriceHistory[btcPriceHistory.length - 1] = price;
    } else {
      btcPriceHistory.push(price);
    }
    while (btcPriceHistory.length > BTC_HISTORY_MAX) btcPriceHistory.shift();
    drawSparkline("#btcSpark", 120, 28);
    drawSparkline("#btcSparkLg", 280, 64);
  }

  function drawSparkline(sel, width, height) {
    const svg = $(sel);
    if (!svg || btcPriceHistory.length < 2) return;
    const data = btcPriceHistory;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 2;
    const pts = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const up = data[data.length - 1] >= data[0];
    const color = up ? "#3ecf8e" : "#ff6b7a";
    const fill = up ? "rgba(62,207,142,0.15)" : "rgba(255,107,122,0.12)";
    const area = `${pad},${height - pad} ${pts.join(" ")} ${width - pad},${height - pad}`;
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
      offline: "FAILED",
      failed: "FAILED",
    };
    const modeClass = btcStreamMode === "offline" ? "failed" : btcStreamMode;
    if (badge) {
      badge.textContent = map[btcStreamMode] || "…";
      badge.className = `stream-badge mode-${modeClass}`;
    }
    if (label) {
      label.textContent =
        btcStreamMode === "live"
          ? "Live stream"
          : btcStreamMode === "polling"
            ? "Polling REST"
            : btcStreamMode === "failed" || btcStreamMode === "offline"
              ? "Feed failed"
              : "Connecting…";
    }
    const ticker = $("#btcTicker");
    const checkout = $("#btcCheckout");
    ticker?.classList.toggle("is-live", btcStreamMode === "live");
    ticker?.classList.toggle("is-failed", modeClass === "failed");
    checkout?.classList.toggle("is-live", btcStreamMode === "live");
    checkout?.classList.toggle("is-polling", btcStreamMode === "polling");
    checkout?.classList.toggle("is-connecting", btcStreamMode === "connecting");
    checkout?.classList.toggle("is-failed", modeClass === "failed");
    checkout?.classList.toggle("is-demo", DEMO_FLOW);
    updateQuoteLockUi();
  }

  function updateLiveListingBtc(direction) {
    $$(".price-row.btc-live strong").forEach((el) => {
      const card = el.closest(".listing-card");
      if (!card || !btcRate) return;
      const p = hooks.getProperties().find((x) => x.id === card.dataset.id);
      if (!p) return;
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
    const p = hooks.getProperties().find((x) => x.title === title);
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
      const p = hooks.getProperties().find((x) => x.id === btn.dataset.view);
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

  function applyLiveSpot(price, source = "stream") {
    const next = Number(price);
    if (!Number.isFinite(next) || next <= 0) return;

    if (source === "binance") btcRateBinance = next;
    if (source === "coinbase" || source === "rest" || source === "stream") btcRateCoinbase = next;
    if (source === "gecko") {
      btcRateGecko = next;
      if (btcRate > 0 && (btcStreamMode === "live" || btcRateCoinbase > 0 || btcRateBinance > 0)) {
        btcLastUpdated = new Date();
        updateBtcTicker({ direction: null, delta: 0, source: "gecko" });
        return;
      }
    }

    const prev = btcRate;
    if (source === "fallback") {
      btcRate = next;
      rateIsFallback = true;
      btcStreamMode = "failed";
    } else if (source === "binance" || source === "coinbase" || source === "stream" || source === "rest") {
      btcRate = next;
      rateIsFallback = false;
    } else if (!btcRate) {
      btcRate = next;
    }

    btcLastUpdated = new Date();
    btcLastSource = source;
    if (btcSessionOpen == null) btcSessionOpen = btcRate;

    const delta = prev ? btcRate - prev : 0;
    let direction = null;
    if (!prev) direction = null;
    else if (delta > 0.005) direction = "up";
    else if (delta < -0.005) direction = "down";
    else if (Math.abs(delta) > 0) direction = delta > 0 ? "up" : "down";

    const prevText = formatUsdPrecise(prev || 0);
    const nextText = formatUsdPrecise(btcRate);
    const changed = prevText !== nextText || Math.abs(delta) >= 0.01;

    if (source === "fallback") {
      btcStreamMode = "failed";
    } else if (source === "binance" || source === "coinbase" || source === "stream") {
      btcStreamMode = "live";
      lastStreamAt = Date.now();
    } else if (btcStreamMode !== "live") {
      btcStreamMode = "polling";
    }

    if (!lockedRate && btcRate > 0 && !rateIsFallback) lockQuote("first");

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
      const updated = $("#tickerUpdated");
      if (updated) {
        updated.textContent = `${btcStreamMode} · ${btcLastUpdated.toLocaleTimeString()} · ${btcTickCount} ticks · ${btcLastSource}`;
      }
    }

    btcRatePrev = btcRate;
    updateStreamBadge();
  }

  function onBtcPriceTick({ source = "stream" } = {}) {
    if (btcRateCoinbase > 0) applyLiveSpot(btcRateCoinbase, source === "rest" ? "rest" : "coinbase");
    else if (btcRateBinance > 0) applyLiveSpot(btcRateBinance, "binance");
    else if (btcRateGecko > 0) applyLiveSpot(btcRateGecko, "gecko");
  }

  function populateBtcSelect() {
    const sel = $("#btcProperty");
    if (!sel) return;
    sel.innerHTML = hooks
      .getProperties()
      .map((p) => `<option value="${p.id}">${p.title} — ${hooks.formatUSD(p.offer)}</option>`)
      .join("");
  }

  function updateBtcQuote({ direction = null } = {}) {
    const id = $("#btcProperty")?.value;
    const p = hooks.getProperties().find((x) => x.id === id);
    if (!p) return;

    if ($("#btcUsd")) $("#btcUsd").textContent = hooks.formatUSD(p.offer);

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

    const rate = quoteRate();
    const btcAmount = p.offer / rate;
    const usdCheck = btcAmount * rate;
    const spreadAbs = Math.abs((btcRateGecko || btcRate) - (btcRateCoinbase || btcRate));
    const spreadPct =
      btcRateGecko && btcRateCoinbase ? (spreadAbs / ((btcRateGecko + btcRateCoinbase) / 2)) * 100 : 0;

    if ($("#btcRateGecko")) {
      $("#btcRateGecko").textContent = btcRateGecko ? `${formatUsdPrecise(btcRateGecko)} / BTC` : "Waiting…";
    }
    if ($("#btcRateCoinbase")) {
      const el = $("#btcRateCoinbase");
      el.textContent = btcRateCoinbase ? `${formatUsdPrecise(btcRateCoinbase)} / BTC` : "Streaming…";
      if (direction) flashPriceEl(el, direction);
    }
    if ($("#btcSpread")) {
      $("#btcSpread").textContent =
        btcRateGecko && btcRateCoinbase ? `${formatUsdPrecise(spreadAbs)} (${spreadPct.toFixed(3)}%)` : "—";
    }
    if ($("#btcRate")) {
      setLivePriceText($("#btcRate"), `${formatUsdPrecise(rate)} / BTC`, direction);
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
    usdEl.textContent = hooks.formatUSD(power);
    const affordable = hooks
      .getProperties()
      .filter((p) => p.offer <= power)
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
          <small>${hooks.formatUSD(p.offer)} · needs ₿ ${need.toFixed(3)}</small>
        </span>
      </button>`;
      })
      .join("");
  }

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

  async function pollCoinbaseSpot() {
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
      applyLiveSpot(97450, "fallback");
      updateStreamBadge();
      if (note) note.textContent = "Market feeds failed — showing a labeled demo fallback, not a live quote.";
      if (!silent) hooks.toast("Could not reach market APIs — demo fallback rate only.");
    } else if (!silent) {
      hooks.toast("Market rates refreshed.");
    }
  }

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

    let lastUi = 0;
    let pending = null;

    btcSocketBinance.addEventListener("open", () => {
      btcWsRetries = 0;
      btcBinanceRetries = 0;
      const note = $("#btcSourceNote");
      if (note) note.textContent = "Binance trade stream live — prices tick per trade.";
      if (btcStreamMode !== "live") {
        btcStreamMode = "live";
        updateStreamBadge();
        hooks.toast("₿ Live trade stream connected.");
      }
    });

    btcSocketBinance.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const price = Number(msg.p || msg.price || msg.c);
        if (!(price > 0)) return;
        pending = price;
        const now = performance.now();
        if (now - lastUi < 120) return;
        lastUi = now;
        const p = pending;
        pending = null;
        applyLiveSpot(p, "binance");
      } catch (_) {
        /* ignore */
      }
    });

    btcSocketBinance.addEventListener("close", () => {
      btcBinanceRetries++;
      if (btcBinanceRetries > BTC_BINANCE_MAX_RETRIES) return;
      const delay = Math.min(30000, 2000 * Math.pow(1.6, btcBinanceRetries));
      setTimeout(connectBinanceWs, delay);
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
    if (btcStreamMode !== "live") {
      btcStreamMode = "connecting";
      updateStreamBadge();
    }
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
        lockQuote("rolled");
        hooks.toast("15-min demo lock rolled — new quote from the live rate.");
      }
      if ($("#btcTimer")) $("#btcTimer").textContent = formatTimer(quoteSecondsLeft);
      updateQuoteLockUi();
    }, 1000);
  }

  function jumpToBtc(id) {
    if ($("#btcProperty")) $("#btcProperty").value = id;
    updateBtcQuote();
    lockQuote("jump");
    document.getElementById("bitcoin")?.scrollIntoView({ behavior: "smooth" });
    hooks.toast("Bitcoin checkout loaded with live stream rates.");
  }

  function init(opts = {}) {
    if (opts.toast) hooks.toast = opts.toast;
    if (opts.requireSoftAuth) hooks.requireSoftAuth = opts.requireSoftAuth;
    if (opts.openChat) hooks.openChat = opts.openChat;
    if (opts.track) hooks.track = opts.track;
    if (opts.formatUSD) hooks.formatUSD = opts.formatUSD;
    if (opts.getProperties) hooks.getProperties = opts.getProperties;

    populateBtcSelect();
    updateBtcQuote();
    updateAffordCalculator();
    updateStreamBadge();
    fetchLiveBtcRates({ silent: true });
    connectBtcWebSocket();
    startQuoteTimer();

    clearInterval(rateRefreshId);
    clearInterval(geckoRefreshId);

    rateRefreshId = setInterval(() => {
      pollCoinbaseSpot();
    }, FAST_POLL_MS);

    geckoRefreshId = setInterval(() => fetchLiveBtcRates({ silent: true, geckoOnly: true }), GECKO_REFRESH_MS);

    setInterval(() => {
      if (!btcRate) return;
      const ageMs = btcLastUpdated ? Date.now() - btcLastUpdated.getTime() : 0;
      if (ageMs > FAILED_MS && btcStreamMode !== "failed") {
        btcStreamMode = "failed";
        updateStreamBadge();
      } else if (ageMs > STALE_MS && btcStreamMode === "live") {
        btcStreamMode = "polling";
        updateStreamBadge();
      }
      const el = $("#tickerBtcPrice");
      if (el && btcStreamMode === "live") {
        el.classList.remove("flash-tick");
        void el.offsetWidth;
        el.classList.add("flash-tick");
      }
      const updated = $("#tickerUpdated");
      if (updated && btcLastUpdated) {
        const age = Math.round(ageMs / 1000);
        updated.textContent = `${btcStreamMode} · ${btcLastSource} · ${age}s ago · ${btcTickCount} ticks`;
      }
    }, 2000);

    $("#btcProperty")?.addEventListener("change", () => {
      updateBtcQuote();
      lockQuote("select");
    });

    $("#refreshBtcRates")?.addEventListener("click", async () => {
      await fetchLiveBtcRates({ silent: false });
      connectBtcWebSocket();
      lockQuote("refresh");
    });

    $("#tickerRefresh")?.addEventListener("click", () => {
      pollCoinbaseSpot();
      fetchLiveBtcRates({ silent: false });
      connectBtcWebSocket();
    });

    $("#affordBtc")?.addEventListener("input", updateAffordCalculator);

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
        hooks.toast("Demo escrow address copied.");
      } catch {
        hooks.toast("Copy failed — select the address manually.");
      }
    });

    $("#simulateBtcPay")?.addEventListener("click", () => {
      hooks.requireSoftAuth("btc", () => {
        const id = $("#btcProperty")?.value;
        const p = hooks.getProperties().find((x) => x.id === id);
        if (!p) {
          hooks.toast("Pick a home for Bitcoin checkout first.");
          return;
        }
        const rate = quoteRate();
        if (!rate) {
          hooks.toast("Waiting for a BTC quote…");
          return;
        }
        if (!DEMO_FLOW) {
          hooks.toast("Live checkout is not enabled.");
          return;
        }
        const amount = p.offer / rate;
        const btc = formatBTC(amount);
        $("#btcCheckout")?.classList.add("pay-flash");
        setTimeout(() => $("#btcCheckout")?.classList.remove("pay-flash"), 800);
        hooks.toast(`Demo only — no funds moved. ${btc} for ${p.title} @ locked ${formatUsdPrecise(rate)}/BTC.`);
        hooks.track("btc_pay_simulate", { id: p.id, demo: true });
        hooks.openChat(
          `I simulated a Bitcoin checkout of ${btc} (locked demo quote ${formatUsdPrecise(rate)}/BTC, live ${formatUsdPrecise(btcRate)}/BTC, stream=${btcStreamMode}) for ${p.title}. This demo does not move real funds.`
        );
      });
    });

    $("#btcTicker")?.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      document.getElementById("bitcoin")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  w.SRU_BTC = {
    getSpot: () => btcRate,
    getQuoteRate: quoteRate,
    getMode: () => btcStreamMode,
    isDemo: () => DEMO_FLOW,
    formatBTC,
    formatUsdPrecise,
    btcForOffer,
    applyLiveSpot,
    onBtcPriceTick,
    updateQuote: updateBtcQuote,
    lockQuote,
    jumpTo: jumpToBtc,
    init,
  };
})(window);
