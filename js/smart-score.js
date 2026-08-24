/* Client-side Smart Realty Score + deal flags. Educational only. */
(function (root) {
  function ppsf(p) {
    var price = Number(p.listPrice || p.offer || 0);
    var sqft = Number(p.sqft || 0);
    return price && sqft ? price / sqft : null;
  }
  function daysOnMarket(p) {
    var t = Date.parse(p.listingDate || p.firstSeenAt || 0);
    if (!t) return null;
    return Math.max(0, Math.round((Date.now() - t) / 86400000));
  }
  function nearby(p, all) {
    var city = String(p.city || (p.location || "").split(",")[0] || "").toLowerCase();
    return (all || []).filter(function (o) {
      if (!o || o.id === p.id) return false;
      var oc = String(o.city || (o.location || "").split(",")[0] || "").toLowerCase();
      return city && oc === city;
    });
  }
  function median(vals) {
    var n = vals.filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; });
    if (!n.length) return null;
    var m = Math.floor(n.length / 2);
    return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
  }
  function decorate(p, all) {
    var near = nearby(p, all);
    var mine = ppsf(p);
    var med = median(near.map(ppsf));
    var score = 40;
    var reasons = [];
    var deals = [];
    if (mine && med) {
      if (mine < med * 0.9) { score += 25; deals.push({ id: "below_nearby_ppsf", label: "Below nearby $/sqft" }); reasons.push("Below nearby catalog $/sqft."); }
      else if (mine <= med * 1.05) { score += 14; reasons.push("Near nearby catalog $/sqft."); }
      else { score += 6; reasons.push("Above nearby catalog $/sqft."); }
    }
    var hist = p.priceHistory || [];
    var cut = hist.filter(function (h) { return Number(h.previous) > Number(h.price); }).pop();
    if (cut) { score += 12; deals.push({ id: "recently_reduced", label: "Recently reduced" }); reasons.push("List price reduction in catalog history."); }
    var dom = daysOnMarket(p);
    if (dom != null && dom >= 60) { deals.push({ id: "long_dom", label: "Long time on market" }); score += 5; reasons.push("About " + dom + " days on market."); }
    else if (dom != null && dom <= 14) score += 10;
    if (p.sqft && p.beds && p.image) score += 8;
    var blob = String(p.desc || "").toLowerCase();
    if (/\b(fixer|tlc|as[- ]is|needs work)\b/.test(blob)) deals.push({ id: "potential_fixer", label: "Potential fixer" });
    p.smartScore = {
      score: Math.max(0, Math.min(100, score)),
      reasons: reasons,
      disclaimer: "Educational catalog score. Not an appraisal or loan offer.",
    };
    p.deals = deals;
    return p;
  }
  root.SRUScore = { decorate: decorate, ppsf: ppsf };
})(typeof window !== "undefined" ? window : globalThis);
