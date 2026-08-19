#!/usr/bin/env node
/*
 * Generates a static, crawlable detail page for every listing in js/properties.js.
 *
 * Why: the homepage listings grid is built entirely client-side by app.js, so
 * search engines and non-JS tools that don't execute JS never see the 24
 * listings — only the one hardcoded hero property. This script produces a
 * real HTML page + URL per listing (with OG tags and JSON-LD) so each home
 * is indexable and individually shareable.
 *
 * Usage: node scripts/generate-property-pages.js
 * Re-run after editing js/properties.js to regenerate all pages + sitemap entries.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://smartrealty.us";

function loadProperties() {
  const src = fs.readFileSync(path.join(ROOT, "js/properties.js"), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "js/properties.js" });
  return sandbox.window.SRU_PROPERTIES;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseLocation(location) {
  const m = location.match(/^(.*),\s*([A-Z]{2})(?:\s+(\d{5}))?$/);
  if (!m) return { locality: location, region: "", zip: "" };
  return { locality: m[1], region: m[2], zip: m[3] || "" };
}

function money(n) {
  return "$" + Number(n).toLocaleString("en-US");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage(p, slug) {
  const { locality, region, zip } = parseLocation(p.location);
  const url = `${SITE_URL}/property/${p.id}-${slug}/`;
  const imgUrl = `${SITE_URL}/${p.image}`;
  const title = `${p.title} — ${p.location} | SmartRealty`;
  const description = `${p.title} in ${p.location}: ${p.beds} bed, ${p.baths} bath, ${p.sqft.toLocaleString()} sqft. Blue Book ${money(p.blueBook)}, lowest offer ${money(p.offer)}. ${p.desc}`;
  const cityParam = encodeURIComponent(locality.split(",")[0] || "");
  const propParam = encodeURIComponent(p.title);

  const gallery = (p.images || [p.image])
    .map((src) => `<img src="/${src}" alt="${esc(p.title)} — additional view" loading="lazy" />`)
    .join("\n            ");

  const address = {
    "@type": "PostalAddress",
    addressLocality: locality,
    addressRegion: region,
    addressCountry: "US",
    ...(zip ? { postalCode: zip } : {}),
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    description: p.desc,
    url,
    image: imgUrl,
    datePosted: "2026-08-19",
    about: {
      "@type": "SingleFamilyResidence",
      name: p.title,
      address,
      numberOfRooms: p.beds,
      numberOfBathroomsTotal: p.baths,
      floorSize: { "@type": "QuantitativeValue", value: p.sqft, unitCode: "FTK" },
    },
    offers: {
      "@type": "Offer",
      price: p.offer,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(p.title)} — ${esc(p.location)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${imgUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="theme-color" content="#0a0c10" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="/growth.css" />
  <script src="/domain-config.js"></script>
  <script src="/js/auth-client.js"></script>
  <script src="/js/analytics.js"></script>
  <script src="/js/growth.js"></script>
  <script type="application/ld+json">
  ${JSON.stringify(jsonLd, null, 2)}
  </script>
</head>
<body class="g-page" data-growth="listing">
  <div id="gChrome"></div>
  <main class="g-section">
    <div class="container g-article">
      <p class="g-kicker"><a href="/#listings">&larr; All listings</a> · ${esc(p.location)}</p>
      <h1>${esc(p.title)}</h1>
      <p class="g-meta">${p.beds} bed · ${p.baths} bath · ${p.sqft.toLocaleString()} sqft · ${esc(p.location)}</p>

      <img src="/${p.image}" alt="${esc(p.title)}" style="width:100%;border-radius:16px;margin:1.25rem 0;display:block" />

      <div class="g-grid-3">
        <div class="g-card glass">
          <h3>Blue Book value</h3>
          <p style="font-size:1.3rem;font-weight:800">${money(p.blueBook)}</p>
        </div>
        <div class="g-card glass">
          <h3>Lowest offer</h3>
          <p style="font-size:1.3rem;font-weight:800">${money(p.offer)}</p>
        </div>
        <div class="g-card glass">
          <h3>List price</h3>
          <p style="font-size:1.3rem;font-weight:800">${money(p.listPrice)}</p>
        </div>
      </div>

      <div class="g-prose" style="margin-top:1.5rem">
        <p>${esc(p.desc)}</p>
        ${
          p.rentable
            ? `<p><strong>Try-before-buy:</strong> ${money(p.nightly)}/night, with ${p.creditPercent}% of eligible nights credited toward a purchase.</p>`
            : ""
        }
      </div>

      <div class="gallery-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin:1.5rem 0">
        <style>.gallery-grid img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px}</style>
        ${gallery}
      </div>

      <div class="g-cta-row">
        <a class="btn btn-primary" href="/showing/?property=${propParam}&amp;city=${cityParam}">Request a showing</a>
        <a class="btn btn-outline" href="/buy/?property=${propParam}&amp;city=${cityParam}">Buy inquiry</a>
        <a class="btn btn-ghost" href="/invest/?property=${propParam}&amp;city=${cityParam}">Analyze</a>
      </div>
      <p class="g-disclaimer" style="margin-top:1rem">This is a public demo listing, not a live offer or confirmed appointment. SmartRealty is not yet a licensed brokerage — see <a href="/terms.html">Terms</a>.</p>
    </div>
  </main>
  <div id="gFoot"></div>
  <script src="/js/growth-ui.js"></script>
</body>
</html>
`;
}

function updateSitemap(entries) {
  const sitemapPath = path.join(ROOT, "sitemap.xml");
  let xml = fs.readFileSync(sitemapPath, "utf8");
  const existingLocs = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const newBlocks = entries
    .filter((e) => !existingLocs.has(e.url))
    .map(
      (e) =>
        `  <url>\n    <loc>${e.url}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`
    )
    .join("");
  if (!newBlocks) return 0;
  xml = xml.replace("</urlset>", newBlocks + "</urlset>");
  fs.writeFileSync(sitemapPath, xml);
  return newBlocks.split("<url>").length - 1;
}

function main() {
  const properties = loadProperties();
  const entries = [];
  for (const p of properties) {
    const slug = p.slug || slugify(p.title);
    const dir = path.join(ROOT, "property", `${p.id}-${slug}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderPage(p, slug));
    entries.push({ url: `${SITE_URL}/property/${p.id}-${slug}/` });
  }
  const added = updateSitemap(entries);
  console.log(`Generated ${properties.length} property pages under /property/.`);
  console.log(`Added ${added} new sitemap entries (${entries.length - added} already present).`);
}

main();
