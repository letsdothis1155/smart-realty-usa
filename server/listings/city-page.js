"use strict";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function listingCard(l) {
  const display = l.displayImage || {};
  const img = display.src || l.image || (l.images && l.images[0]) || "/images/photo-unavailable.svg";
  const can3d = l.canView3D && l.hasListingPhotos !== false && l.primaryImageSource !== "street_view";
  const badges = [];
  if (l.isNew) badges.push("New");
  if (l.priceReduced) badges.push("Price Reduced");
  const addr = [l.address || l.title, [l.city, l.state, l.postalCode].filter(Boolean).join(" ")].filter(Boolean);
  return `<article class="nl-card">
    <div class="nl-media">${img ? `<img src="${esc(img)}" alt="${esc(l.address || l.title || "Home")}" loading="lazy"/>` : "Photo unavailable"}${display.source === "street_view" ? `<span class="sv-badge">Street View</span><span class="sv-attr">${esc(display.attribution || "© Google")}</span>` : ""}</div>
    <div class="nl-body">
      <span class="nl-source">${esc(l.source || "unknown")}${l.mlsSourceName ? " · " + esc(l.mlsSourceName) : ""}</span>
      ${badges.length ? `<div class="nl-source">${esc(badges.join(" · "))}</div>` : ""}
      <div class="nl-price">${l.listPrice ? money(l.listPrice) : "Price on request"}</div>
      <div class="nl-loc">${esc(addr.join(" · "))}</div>
      <div class="nl-meta">${l.beds || "—"} bd · ${l.baths || "—"} ba · ${l.sqft ? Number(l.sqft).toLocaleString() + " sqft" : "—"} · ${esc(l.propertyType || "")}</div>
      <div class="nl-actions">
        <a class="btn btn-ghost btn-sm" href="/new-listings/?id=${encodeURIComponent(l.id)}">View Home</a>
        ${can3d ? `<a class="btn btn-primary btn-sm" href="/room-builder/?listing=${encodeURIComponent(l.id)}${l.image ? `&photo=${encodeURIComponent(l.image)}` : ""}">View in 3D</a>` : ""}
      </div>
    </div>
  </article>`;
}

function renderCityPage({ place, total, listings, types, neighborhoods, priceMin, priceMax, with3d, priceReduced }) {
  const city = place.name || "This city";
  const state = place.state || "";
  const title = total
    ? `Homes for sale in ${city}${state ? ", " + state : ""} — SmartRealty`
    : `${city} real estate — SmartRealty`;
  const desc = total
    ? `${total} homes currently in the SmartRealty dataset for ${city}${state ? ", " + state : ""}. Counts are from our available sources, not the whole MLS.`
    : `No homes in the SmartRealty dataset for ${city} yet. We do not invent inventory counts.`;
  const canonical = `https://smartrealty.us/homes/${place.slug || ""}`;
  const indexable = total > 0;
  const typeLines = Object.entries(types || {})
    .map(([k, v]) => `<li>${esc(k)} — ${v}</li>`)
    .join("");
  const hoods = Object.entries(neighborhoods || {})
    .map(([k, v]) => `<li><a href="/homes/${esc(place.slug)}/?neighborhood=${encodeURIComponent(k)}">${esc(k)}</a> — ${v}</li>`)
    .join("");
  const cards = (listings || []).map(listingCard).join("");
  const jsonLd = indexable
    ? JSON.stringify({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Homes for sale in ${city}, ${state}`,
        numberOfItems: total,
        url: canonical,
      })
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}"/>
  <meta name="robots" content="${indexable ? "index, follow" : "noindex, follow"}"/>
  <link rel="canonical" href="${esc(canonical)}"/>
  <link rel="stylesheet" href="/styles.css"/>
  <link rel="stylesheet" href="/growth.css"/>
  <style>
    .nl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;margin-top:1.25rem}
    .nl-card{border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.03);overflow:hidden;display:flex;flex-direction:column}
    .nl-media{aspect-ratio:16/10;background:#1a1d22;position:relative}
    .sv-badge,.sv-attr{position:absolute;left:10px;z-index:2;font-size:.68rem;padding:.18rem .45rem;border-radius:4px;background:rgba(0,0,0,.62);color:#fff}
    .sv-badge{bottom:28px;font-weight:700}
    .sv-attr{bottom:8px}
    .nl-media img{width:100%;height:100%;object-fit:cover}
    .nl-body{padding:.9rem;display:flex;flex-direction:column;gap:.35rem;flex:1}
    .nl-price{font-size:1.2rem}
    .nl-loc,.nl-meta,.nl-source{color:var(--text-muted);font-size:.85rem}
    .nl-actions{margin-top:auto;display:flex;flex-wrap:wrap;gap:.4rem;padding-top:.5rem}
    .city-stats{display:flex;flex-wrap:wrap;gap:.8rem;margin:1rem 0}
    .city-stats span{border:1px solid var(--border);border-radius:999px;padding:.25rem .7rem;font-size:.8rem}
    #cityMap{height:280px;border-radius:12px;border:1px solid var(--border);margin:1rem 0}
  </style>
  ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
</head>
<body class="g-page">
  <header class="legal-header"><div class="container legal-header-inner">
    <a href="/" class="logo"><span class="logo-mark">SR</span><span class="logo-text"><strong>Smart Realty</strong><small>USA</small></span></a>
    <nav class="legal-nav"><a href="/homes/">Cities</a><a href="/new-listings/">New listings</a><a href="/index.html#listings">Search</a></nav>
  </div></header>
  <main class="container" style="max-width:1100px;margin:0 auto;padding:1.5rem 1rem 3rem">
    <p class="eyebrow">${esc(state)} · ${esc(place.county || "")}</p>
    <h1>Homes for sale in ${esc(city)}${state ? ", " + esc(state) : ""}</h1>
    <p>${esc(desc)}</p>
    <div class="city-stats">
      <span>${total} homes in this dataset</span>
      ${priceMin ? `<span>${money(priceMin)} – ${money(priceMax)}</span>` : ""}
      <span>${with3d || 0} with 3D preview</span>
      <span>${priceReduced || 0} price reduced</span>
    </div>
    ${typeLines ? `<h2>Property types</h2><ul>${typeLines}</ul>` : ""}
    ${hoods ? `<h2>Neighborhoods</h2><ul>${hoods}</ul>` : ""}
    <h2>Newest in this city</h2>
    <div id="cityMap" hidden></div>
    <div class="nl-grid">${cards || "<p>No active homes in our dataset for this city yet.</p>"}</div>
  </main>
  <script>
    (function(){
      const pins = ${JSON.stringify((listings || []).filter((l) => l.latitude && l.longitude).map((l) => ({ lat: l.latitude, lng: l.longitude, price: l.listPrice, id: l.id })))};
      if (!pins.length || typeof L === "undefined") return;
    })();
  </script>
</body></html>`;
}

module.exports = { renderCityPage, listingCard, esc, money };
