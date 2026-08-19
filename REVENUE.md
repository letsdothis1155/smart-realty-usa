# SmartRealty.us — revenue inspection and Phase 1

Company: SMART REALTY.US LLC. Revenue **$0**. Cash **$0**. Not a licensed brokerage. Not a bank. Live charging **off**.

Branch: `feature/revenue-foundation`

## CURRENT STATE

Static GitHub Pages site (`smartrealty.us`) plus optional GoDaddy PHP (`api/`) and a local Node API (`server/` on 8787). Vanilla HTML/CSS/JS. No React.

**What it already does**
- Public demo listings, House Blue Book, Bitcoin quote UI, waitlist, account request
- Direct Deposit sandbox + growth surfaces (goals, early access, learn, security)
- Profit engine: Free/Plus/Pro/Business/Agent catalog, entitlements, mock Stripe adapter, founder/revenue dashboards
- Lead store: `api/leads.php` → `api/data/leads.json`, admin at `/admin.html`

**Hosting / deploy**
- GitHub Pages + CNAME. PHP only if uploaded to GoDaddy.
- Secrets belong in `api/config.local.php` or `server/.env` — never in `domain-config.js`

**Payments**
- Designed for Stripe Checkout. Cards never stored.
- `billing.productionApproved` is hard-false. `BILLING_PRODUCTION=1` is ignored.

## PROBLEMS

- Demo inventory is not a live MLS/brokerage feed
- Waitlist was email-only until this phase; no pipeline you can work
- SaaS “Plus” is catalog copy until a product people will pay for exists
- Sandbox checkout is not money
- GitHub Pages cannot run PHP/Node — leads persist only if the PHP host is live
- Dead or future pages (agent matching, marketplace matching) can look live if copy is sloppy
- SEO city templates at scale would be thin spam — Louisville only is published
- Compliance review required before live ads, referral fees, or charging
- Loan signature packet still unsigned (separate from this branch)

## PROFIT OPPORTUNITIES (ranked)

| # | Idea | Customer | Mechanism | Effort | Impact | Dependencies | Risks |
|---|------|----------|-----------|--------|--------|--------------|-------|
| 1 | Seller / value / buy-rent **lead pipeline** | Buyers, sellers, renters | Andrew follows up; later a licensed partner | Low | First real conversations | PHP or local store + consent | Sharing leads without consent / licensing |
| 2 | **Digital services** (copy, property page, SEO starter) | Owners, agents | One-time quote, then invoice | Low | First dollar Andrew can deliver | Time to do the work | Overpromising rankings |
| 3 | **Listing tiers** Free / Featured / Premium | Owners who want placement | Catalog + later Stripe | Low–med | Repeatable SKU | Live listings + billing review | Selling placement on fake inventory |
| 4 | Agent **directory subscription** | Agents | Monthly/annual | Med | Recurring | License, matching rules | RESPA / looking like a brokerage |
| 5 | Consumer **Plus** (goals, planners) | End users | Subscription | Med | Only after tools are loved | Product depth | Charging before value |
| 6 | **Investor estimator → lead** | Investors | Email capture | Low | Qualified intent | Honest estimate copy | Advice / guarantee claims |
| 7 | Mortgage / insurance **affiliates** | Movers in a deal | CPA / rev-share | Low once partners exist | Extra $ per close | Real signed programs | Fake partners, RESPA |
| 8 | Featured **agent / development ads** | Pros, builders | Sponsorship | Med | Local $ | Disclosure + inventory | Ad-clutter, trust |
| 9 | AI listing copy (paid) | Agents | Per-listing or Plus | Med | Fits services | Model + review | Hallucinated facts |
| 10 | Workplace / employer programs | Employers | Contract | High | Large checks | Sales motion | Long cycle |
| 11 | Direct deposit as **paid product** | Consumers | Do not | — | Wrong | Banking partners | Treating deposits as revenue |

## TOP 3 (fastest legitimate $)

1. **Lead pipeline** — you can work every lead this week.
2. **Digital services** — you can invoice without being a broker.
3. **Listing tier catalog** — ready when a real property and Stripe exist.

## BUILD PLAN

**Phase 1 — Revenue foundation (this branch)**  
Lead forms + CRM fields + admin status. Services page. Listing SKUs. Investor estimator. Sandbox checkout events. Homepage path to `/start/`.

**Phase 2 — Lead generation**  
Showing requests on listing cards. Saved-search alerts (opt-in). Assigned follow-up dates.

**Phase 3 — Growth engine**  
Measure lead→won. Only then paid ads. City pages only with sourced facts.

**Phase 4 — Automation**  
New-lead email to `ai@smartrealty.us` (already best-effort). Abandoned checkout only after live billing.

**Phase 5 — Advanced**  
Live Stripe after counsel. Agent matching after licensing. Affiliates only with signed links.

## How revenue is measured

Events: `lead_submitted`, `lead_conversion`, `checkout_started`, `purchase_sandbox`.  
Admin: `/admin.html` (leads), `/admin/revenue/` (MRR stays $0 until live charges).  
Production money stays **$0** until a processor is live and a real invoice is paid.
