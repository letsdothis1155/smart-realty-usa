# Kentuckiana Turnover Price Check

Preview at `/turnover-prices/` on smartrealty.us. Andrew approves before this is merged to `main`. Nothing here is a live affiliate feed.

The prices in `data/prices.example.json` are sample layout data. `dataMode` in `config.js` defaults to `"sample"`. There are no campaign IDs and no Amazon prices.

## What the page does

- The page is led by the turnover bundle calculator and the Get 3 quotes form.
- Five categories (appliances, paint, flooring, locks, basics) and the starter products from the outline.
- eBay and Walmart stay in separate blocks under each product. Our own description sits outside those blocks.
- Inside a block, the default sort is lowest total (item + shipping).
- In live mode, every price link says “View on eBay” or “View on Walmart” and is followed by: `Affiliate link (#ad): Smart Realty may earn a commission. Rankings are never paid.`
- In sample mode the same disclosure sits next to a disabled “Live link coming soon” button, and the time line reads `Sample price`.
- In live mode that same element reads `Last checked … ET`.
- Walmart rows also say `Price on Walmart.com at time of purchase governs.`
- Amazon is a disabled note only. No Amazon prices are stored. Amazon is phase 2.
- The bundle calculator totals a 1, 2, or 3 bedroom list as two subtotals, one per retailer. In sample mode it is labeled Sample estimate.
- “Email me this bundle” and “Get 3 quotes” use one config value. While it is empty, the page opens a mailto to andrewiredale@smartrealty.us. Photos are not uploaded in that mode.

`dataMode` is the only switch:

| Value | What people see |
| --- | --- |
| `sample` (default) | Gold banner, Sample price, disabled retailer buttons, Sample estimate |
| `live` | Retailer links, Last checked in Eastern time, the behavior above |

## Forms

Both the bundle email and Get 3 quotes post to `https://api.web3forms.com/submit`. The access key lives in one place, `turnover-prices/config.js`:

```js
web3formsAccessKey: "78c7edf0-8420-4b1a-99f3-601a6ccdb4a5",
```

A real Web3Forms access key is configured. It is public by design. To rotate it, create a new key at [web3forms.com](https://web3forms.com/) and replace this value in `config.js` and in both hidden `access_key` inputs. If the value is set back to `YOUR_WEB3FORMS_ACCESS_KEY`, the page does not send the request and tells the visitor to email andrewiredale@smartrealty.us. Each form also shows that mailto address as a plain-text fallback. A hidden `botcheck` checkbox is the honeypot. The quote request includes the calculator’s selected items and marks the total as a sample estimate.

There is no contractor billing and no paid ranking.

The turnover pages do not set a Content-Security-Policy. The only CSP on this site is the mempool page `blockchain-live.html`, which does not host these forms, so it was left unchanged.

## Secrets

Read these only from the environment (GitHub Actions secrets or Worker secrets). Never commit them. All retailer calls stay server-side.

eBay (Browse API, client-credentials, scope `https://api.ebay.com/oauth/api_scope`, about 5,000 calls/day by default):

| Name | Required | Purpose |
| --- | --- | --- |
| `EBAY_CLIENT_ID` | yes | OAuth client id (App ID) |
| `EBAY_CLIENT_SECRET` | yes | OAuth client secret (Cert ID) |
| `EBAY_DEV_ID` | no | Dev ID, if a call needs it |
| `EBAY_CAMPAIGN_ID` | yes | 10-digit EPN campaign id, sent as `affiliateCampaignId` in `X-EBAY-C-ENDUSERCTX` so Browse can return `itemAffiliateWebUrl` |
| `EBAY_AFFILIATE_REF_ID` | no | Optional `affiliateReferenceId` / custom id |

Walmart Affiliates API (`WM_CONSUMER.ID`, `WM_CONSUMER.INTIMESTAMP`, `WM_SEC.KEY_VERSION`, `WM_SEC.AUTH_SIGNATURE`). Docs: https://walmart.io/apidocs/affiliates/affiliate-marketing-api . Links should be the `productTrackingUrl`. `WALMART_PUBLISHER_ID` is the Impact publisher id.

| Name | Required | Purpose |
| --- | --- | --- |
| `WALMART_CONSUMER_ID` | yes | Walmart consumer id |
| `WALMART_PRIVATE_KEY` | yes | RSA PEM for the signature. In a GitHub secret, store newlines as `\n` |
| `WALMART_KEY_VERSION` | no | Usually `1` |
| `WALMART_PUBLISHER_ID` | yes | Impact publisher id |

Amazon is not called. When terms are reviewed later, the names to add are `AMAZON_CLIENT_ID`, `AMAZON_CLIENT_SECRET`, `AMAZON_CREDENTIAL_VERSION` (3.1 US), `AMAZON_PARTNER_TAG`, and `AMAZON_MARKETPLACE`.

## Refresh job (not deployed, off until secrets exist)

- `turnover-prices/refresh/worker.mjs` — Cloudflare Worker entry. Do not deploy it yet.
- `turnover-prices/refresh/refresh.mjs` — what the GitHub Action runs.
- `.github/workflows/turnover-prices-refresh.yml` — `workflow_dispatch` only. No schedule. If secrets are missing it prints that and writes nothing.

A successful run writes `turnover-prices/data/prices.live.json`, which is gitignored. Do not commit it. The static site keeps serving `prices.example.json` until you deliberately point a Worker at the page.

Before enabling a cron, confirm the Walmart host in `refresh/lib.mjs` against the current affiliate docs (there is a TODO on that URL). Use a schedule of hourly, or at least every 6 hours (`0 */6 * * *`). The workflow file comments the cron so it stays off.

Suggested Worker cache: `Cache-Control: public, max-age=21600` (6 hours). Do not store older copies.

## Preview without merging

GitHub Pages publishes `main` only. After this branch is pushed, open:

`https://raw.githack.com/letsdothis1155/smart-realty-usa/<branch>/turnover-prices/index.html`

Styles and scripts use relative paths so that host can load them. Links back to the rest of the site use `https://smartrealty.us/` and therefore show production, not this branch. If githack is down, the same path works on jsDelivr when the repo is public:

`https://cdn.jsdelivr.net/gh/letsdothis1155/smart-realty-usa@<branch>/turnover-prices/index.html`

Replace `<branch>` with the PR branch name.

## Local check

```bash
python3 -m http.server 8766
# http://127.0.0.1:8766/turnover-prices/
```

From `server/`: `npm test` includes `test/turnover-prices.test.js`.
