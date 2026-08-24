/* House Blue Book — demo estimator UI. Public tax/PVA path is /api/bluebook. */
(function (w) {
  const $ = (sel, root = document) => root.querySelector(sel);

  function estimateDemo({ address, beds, baths, sqft }) {
    const loc = String(address || "").trim();
    const bedKey = String(beds || "5");
    const bathKey = String(baths || "4");
    const size = Number(sqft) || 4000;
    const base = 420 + (size % 180);
    const bedMult = { 3: 0.92, 4: 1, 5: 1.12, "6+": 1.28 }[bedKey] || 1;
    const bathMult = { 2: 0.95, 3: 1, 4: 1.08, "5+": 1.18 }[bathKey] || 1;
    const locBoost = /vegas|nv|las/i.test(loc) ? 1.18 : /beverly|atherton|malibu|ca/i.test(loc) ? 1.45 : 1.05;
    const blueBook = Math.round(size * base * bedMult * bathMult * locBoost);
    const list = Math.round(blueBook * 1.08);
    const offer = Math.round(blueBook * 0.96);
    const save = list - offer;
    return { blueBook, list, offer, save, address: loc, beds: bedKey, baths: bathKey, sqft: size };
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

  function init(opts = {}) {
    const form = $("#blueBookForm");
    if (!form) return;

    const toast = opts.toast || (() => {});
    const formatUSD =
      opts.formatUSD ||
      ((n) =>
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(n));
    const getBtcRate = opts.getBtcRate || (() => (w.SRU_BTC && w.SRU_BTC.getSpot && w.SRU_BTC.getSpot()) || 0);
    const formatBTC = opts.formatBTC || ((n) => (w.SRU_BTC && w.SRU_BTC.formatBTC ? w.SRU_BTC.formatBTC(n) : `${Number(n).toFixed(6)} BTC`));
    const formatUsdPrecise =
      opts.formatUsdPrecise ||
      ((n) =>
        w.SRU_BTC && w.SRU_BTC.formatUsdPrecise
          ? w.SRU_BTC.formatUsdPrecise(n)
          : new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 2,
            }).format(n));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const address = $("#bbAddress").value.trim();
      const beds = $("#bbBeds").value;
      const baths = $("#bbBaths").value;
      const sqft = Number($("#bbSqft").value) || 4000;
      const est = estimateDemo({ address, beds, baths, sqft });

      const result = $("#bbResult");
      result?.classList.remove("hidden");
      animateCount($("#bbValue"), est.blueBook, formatUSD);
      animateCount($("#bbOffer"), est.offer, formatUSD);
      animateCount($("#bbSavings"), est.save, formatUSD);
      result?.classList.add("bb-pop");
      setTimeout(() => result?.classList.remove("bb-pop"), 600);
      toast("Your free House Blue Book estimate is ready.");
      let next = document.getElementById("bbLeadCta");
      if (!next && result) {
        next = document.createElement("p");
        next.id = "bbLeadCta";
        next.className = "bb-note";
        result.appendChild(next);
      }
      if (next) {
        const href = `value/?property=${encodeURIComponent(address)}`;
        next.innerHTML = `<a class="btn btn-outline btn-sm" href="${href}">Request a follow-up on this address</a> <span class="bb-note">Estimate only — not an appraisal.</span>`;
      }
      const btcRate = getBtcRate();
      if (btcRate) {
        const btcLine = document.getElementById("bbBtcLine");
        if (btcLine) {
          btcLine.textContent = `≈ ${formatBTC(est.offer / btcRate)} at live rate ${formatUsdPrecise(btcRate)}/BTC`;
          btcLine.classList.remove("hidden");
        }
      }
    });
  }

  w.SRU_BLUEBOOK = {
    estimateDemo,
    animateCount,
    init,
  };
})(window);
