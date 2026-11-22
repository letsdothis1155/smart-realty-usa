/**
 * Cloudflare Worker entry. Not deployed. Disabled until the required
 * secrets exist. Do not keep older copies in KV.
 *
 * Suggested cron once Andrew enables it: every hour, and never slower
 * than every 6 hours, because eBay listings must be <= 6 hours stale.
 */
import { currentFeed, fetchEbayOffers, fetchWalmartOffers, missingSecrets, shouldRun } from "./lib.mjs";

async function refresh(env) {
  if (!shouldRun(env)) {
    return new Response(JSON.stringify({
      ok: false,
      disabled: true,
      missing: missingSecrets(env),
      wrote: false,
    }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const queries = ["30 inch electric range", "keypad deadbolt"];
  const products = [];
  for (const query of queries) {
    const ebay = await fetchEbayOffers(query, env);
    const walmart = await fetchWalmartOffers(query, env);
    products.push({
      id: query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name: query,
      retailers: { ebay: { offers: ebay }, walmart: { offers: walmart } },
    });
  }
  const body = currentFeed(products);
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=21600",
    },
  });
}

export default {
  async fetch(_request, env) {
    return refresh(env || {});
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refresh(env || {}));
  },
};
