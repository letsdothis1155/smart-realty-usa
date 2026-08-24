"use strict";

/**
 * Smart Realty Score (0–100) and Deal Finder tags.
 * Educational only — not an appraisal, CMA, or loan offer.
 */

function ppsf(listing) {
  const price = Number(listing.listPrice || listing.offer || 0);
  const sqft = Number(listing.sqft || 0);
  if (!price || !sqft) return null;
  return price / sqft;
}

function daysOnMarket(listing, now = Date.now()) {
  const raw = listing.listingDate || listing.firstSeenAt;
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / 86400000));
}

function latestReduction(listing, now = Date.now()) {
  const hist = Array.isArray(listing.priceHistory) ? listing.priceHistory : [];
  const cuts = hist
    .filter((h) => Number(h.previous) > Number(h.price))
    .map((h) => ({
      from: Number(h.previous),
      to: Number(h.price),
      at: h.at,
      daysAgo: h.at ? Math.round((now - Date.parse(h.at)) / 86400000) : null,
    }));
  return cuts.length ? cuts[cuts.length - 1] : null;
}

function nearbyPool(listing, all) {
  const city = String(listing.city || "").toLowerCase();
  const state = String(listing.state || "").toLowerCase();
  const sqft = Number(listing.sqft || 0);
  return (all || []).filter((other) => {
    if (!other || other.id === listing.id) return false;
    if (String(other.status || "active") !== "active") return false;
    if (city && String(other.city || "").toLowerCase() !== city) return false;
    if (state && String(other.state || "").toLowerCase() !== state) return false;
    if (sqft && other.sqft) {
      const ratio = Number(other.sqft) / sqft;
      if (ratio < 0.7 || ratio > 1.3) return false;
    }
    return true;
  });
}

function median(values) {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function textSignals(listing) {
  const blob = `${listing.desc || ""} ${listing.description || ""} ${listing.title || ""}`.toLowerCase();
  return {
    updated: /\b(updated|renovated|remodeled|new (kitchen|bath|roof|hvac))\b/.test(blob),
    fixer: /\b(fixer|tlc|as[- ]is|needs work|handyman|investor special|deferred)\b/.test(blob),
  };
}

function scoreListing(listing, all = [], now = Date.now()) {
  const reasons = [];
  const parts = [];
  const nearby = nearbyPool(listing, all);
  const mine = ppsf(listing);
  const nearMed = median(nearby.map(ppsf).filter(Boolean));
  const dom = daysOnMarket(listing, now);
  const cut = latestReduction(listing, now);
  const signals = textSignals(listing);

  let pps = 12;
  if (mine && nearMed) {
    const ratio = mine / nearMed;
    if (ratio <= 0.85) {
      pps = 25;
      reasons.push(`Listed about ${Math.round((1 - ratio) * 100)}% below nearby active $/sqft (listing fields only).`);
    } else if (ratio <= 0.95) {
      pps = 20;
      reasons.push("Listed a bit below nearby active price per square foot.");
    } else if (ratio <= 1.05) {
      pps = 14;
      reasons.push("Price per square foot is close to nearby active listings.");
    } else if (ratio <= 1.2) {
      pps = 8;
      reasons.push("Price per square foot is above nearby active listings.");
    } else {
      pps = 4;
      reasons.push("Price per square foot is well above nearby active listings.");
    }
  } else {
    reasons.push("Not enough nearby active comps in this catalog to compare $/sqft.");
  }
  parts.push({ key: "nearby_ppsf", points: pps, max: 25 });

  let domPts = 8;
  if (dom == null) {
    reasons.push("Days on market are unknown from the listing date we have.");
  } else if (dom <= 14) {
    domPts = 15;
    reasons.push(`Listed about ${dom} day${dom === 1 ? "" : "s"} ago.`);
  } else if (dom <= 45) {
    domPts = 12;
    reasons.push(`About ${dom} days on market.`);
  } else if (dom <= 90) {
    domPts = 8;
    reasons.push(`About ${dom} days on market — longer than a typical fresh listing.`);
  } else {
    domPts = 5;
    reasons.push(`About ${dom} days on market. That is long; it is not proof the home is overpriced.`);
  }
  parts.push({ key: "days_on_market", points: domPts, max: 15 });

  let cutPts = 6;
  if (cut && cut.daysAgo != null && cut.daysAgo <= 45) {
    const pct = cut.from ? Math.round(((cut.from - cut.to) / cut.from) * 100) : 0;
    cutPts = 15;
    reasons.push(`Recent list-price reduction of about ${pct}% (from listing history, not a sale).`);
  } else if (cut) {
    cutPts = 10;
    reasons.push("This catalog recorded an earlier list-price reduction.");
  } else {
    reasons.push("No list-price reduction is in our history yet.");
  }
  parts.push({ key: "price_change", points: cutPts, max: 15 });

  let complete = 0;
  if (listing.listPrice) complete += 3;
  if (listing.beds) complete += 2;
  if (listing.baths) complete += 2;
  if (listing.sqft) complete += 3;
  if (listing.latitude && listing.longitude) complete += 2;
  if ((listing.images && listing.images.length) || listing.image) complete += 3;
  parts.push({ key: "completeness", points: complete, max: 15 });
  reasons.push(`Listing completeness ${complete}/15 from published fields (price, beds, baths, sqft, map, photos).`);

  let cond = 5;
  if (signals.updated) {
    cond = 10;
    reasons.push("Listing text mentions updates/renovation — that is marketing language, not a verified inspection.");
  } else if (signals.fixer) {
    cond = 3;
    reasons.push("Listing text suggests work is needed — treat as a seller claim, not a condition report.");
  } else {
    reasons.push("No clear condition words in the listing text we have.");
  }
  parts.push({ key: "listing_text", points: cond, max: 10 });

  const nearbyCount = nearby.length;
  const inv = nearbyCount >= 5 ? 5 : nearbyCount >= 2 ? 3 : 1;
  parts.push({ key: "inventory", points: inv, max: 5 });
  if (nearbyCount) reasons.push(`${nearbyCount} nearby active catalog home${nearbyCount === 1 ? "" : "s"} used as comps.`);

  const total = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.points, 0)));
  const payment = estimatePayment(listing);

  return {
    score: total,
    max: 100,
    label: total >= 75 ? "Strong catalog match" : total >= 55 ? "Average catalog match" : "Weaker catalog match",
    disclaimer:
      "Smart Realty Score is an educational 0–100 from fields in this catalog. It is not an appraisal, CMA, inspection, or loan offer. SMART REALTY.US LLC is not a licensed brokerage.",
    reasons,
    parts,
    nearbyCount,
    ppsf: mine,
    nearbyPpsf: nearMed,
    daysOnMarket: dom,
    lastReduction: cut,
    paymentEstimate: payment,
  };
}

function estimatePayment(listing) {
  const price = Number(listing.listPrice || 0);
  if (!price) return null;
  const down = price * 0.2;
  const loan = price - down;
  const monthlyRate = 0.065 / 12;
  const n = 360;
  const pi = loan * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  const tax = (price * 0.011) / 12;
  const ins = (price * 0.004) / 12;
  return {
    assumption: "20% down, 6.5% 30-year, 1.1% tax, 0.4% insurance — illustrative only",
    downPayment: Math.round(down),
    principalAndInterest: Math.round(pi),
    taxes: Math.round(tax),
    insurance: Math.round(ins),
    monthly: Math.round(pi + tax + ins),
  };
}

function dealFlags(listing, all = [], now = Date.now()) {
  const flags = [];
  const cut = latestReduction(listing, now);
  const nearby = nearbyPool(listing, all);
  const mine = ppsf(listing);
  const nearMed = median(nearby.map(ppsf).filter(Boolean));
  const dom = daysOnMarket(listing, now);
  const hist = Array.isArray(listing.statusHistory) ? listing.statusHistory : [];
  const signals = textSignals(listing);

  if (cut && cut.daysAgo != null && cut.daysAgo <= 30) {
    flags.push({
      id: "recently_reduced",
      label: "Recently reduced",
      detail: `List price moved from $${cut.from.toLocaleString()} to $${cut.to.toLocaleString()} in this catalog.`,
    });
  }
  if (mine && nearMed && mine < nearMed * 0.9 && nearby.length >= 1) {
    flags.push({
      id: "below_nearby_ppsf",
      label: "Below nearby $/sqft",
      detail: `$${Math.round(mine)}/sqft vs nearby catalog median $${Math.round(nearMed)}/sqft.`,
    });
  }
  const cameBack = hist.some((h, i) => {
    const from = String(h.from || "").toLowerCase();
    const to = String(h.to || "").toLowerCase();
    return (from === "pending" || from === "withdrawn" || from === "off_market") && to === "active" && i >= 0;
  });
  if (cameBack && String(listing.status || "") === "active") {
    flags.push({
      id: "back_on_market",
      label: "Back on market",
      detail: "Status history in this catalog shows the home returned to active.",
    });
  }
  if (dom != null && dom >= 60) {
    flags.push({
      id: "long_dom",
      label: "Long time on market",
      detail: `About ${dom} days since the listing date we have. That is a timeline fact, not a defect report.`,
    });
  }
  if (signals.fixer) {
    flags.push({
      id: "potential_fixer",
      label: "Potential fixer",
      detail: "Listing text uses work/as-is language. Confirm condition with a licensed inspector.",
    });
  }
  return flags;
}

function decorateWithScore(listing, all, now) {
  const smartScore = scoreListing(listing, all, now);
  const deals = dealFlags(listing, all, now);
  return { ...listing, smartScore, deals };
}

module.exports = {
  ppsf,
  daysOnMarket,
  nearbyPool,
  scoreListing,
  dealFlags,
  decorateWithScore,
  estimatePayment,
};
