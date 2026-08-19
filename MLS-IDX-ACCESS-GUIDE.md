# Getting real MLS listing data (RESO Web API) — Louisville / Kentucky

Companion to `server/listings/*`, which already has a RESO Web API adapter built
and wired up (`server/listings/providers/reso.js`), but hard-gated off until
real credentials **and** a signed IDX/MLS data-license agreement exist
(`idxAgreementAccepted` in `server/config.js` — a code edit, not an env var).
This doc is the "how do I actually get that" side of the problem.

## The blocker, stated plainly

Getting real MLS data isn't a matter of signing up for an API key. Every MLS
in the country gates its data feed behind **membership** — you (or a broker
you're affiliated with) have to be a REALTOR®/MLS participant in good
standing. SMART REALTY.US LLC is explicitly **not yet a licensed brokerage**
(see `COMPLIANCE-PROFIT.md`, `README.md`) — that's the real prerequisite here,
not a form to fill out.

Two ways through that:

1. **Become the licensed party.** Andrew (or whoever holds the license) gets a
   Kentucky real estate license, joins the local REALTOR® association, and
   becomes an MLS participant directly. Slowest, but gives direct control.
2. **Partner with a member broker.** An existing GLAR/Metro Search
   participant broker can sponsor a vendor data-feed agreement so SmartRealty
   receives the feed as an approved technology vendor, without SmartRealty
   itself being the licensed party. Faster, but depends on finding a broker
   willing to sponsor it — and the data-use terms of that agreement matter a
   lot (make sure it covers public display, not just internal broker tools).

Either path ends the same way: a signed data-license agreement plus API
credentials, which is exactly what `idxAgreementAccepted` and the `RESO_*`
env vars in `server/config.js` / `server/env.example` are waiting for.

## The local MLS: Metro Search, Inc. (Louisville)

Verified via web search (August 2026):

- The MLS serving Louisville and the surrounding area (Shelbyville,
  Shepherdsville, Elizabethtown, Taylorsville) is **Metro Search, Inc.**,
  operated under the **Greater Louisville Association of REALTORS® (GLAR)**.
- Metro Search offers a **Web-API data feed** (RESO-style) to approved
  vendors — several established IDX vendors already integrate with it
  (IDX Broker, UltimateIDX, iHomefinder, RealtyTech, others), which confirms
  the feed exists and vendor access is a known, working path.
- Access requires **broker approval** — cited approval turnaround was ~2
  business days once a broker/vendor application is submitted, not months.
- Contact: **greaterlouisvillekycoc.weblinkconnect.com** lists GLAR's org
  info; louisvillerealtors.com is GLAR's own site — start there for the
  actual vendor/data-feed application process and current contact info,
  since application details change over time and weren't independently
  confirmed beyond the vendor-coverage listings found.

Do not treat "Metro MLS" (metromls.com) as the same organization — that's a
similarly-named MLS serving southeastern Wisconsin, unrelated to Louisville.
Easy to conflate; worth double-checking before contacting anyone.

## Once you have a signed agreement + credentials

1. Set in `server/.env` (never commit real values — `server/.env` is
   gitignored):
   ```
   LISTINGS_MODE=provider
   RESO_CLIENT_ID=...
   RESO_CLIENT_SECRET=...
   RESO_TOKEN_URL=...       # from whoever operates Metro Search's Web API
                            # (Bridge Interactive is a common backend for
                            # MLS Web-API feeds, but confirm with Metro
                            # Search/GLAR directly — not verified here)
   RESO_QUERY_URL=...
   ```
2. Flip `idxAgreementAccepted` to `true` in `server/config.js` — a deliberate
   code edit, on purpose, so going live requires someone to consciously
   confirm the paperwork is actually signed, not just that env vars exist.
3. Restart the server. `server/listings/providers/index.js` will pick the
   real `reso` provider once both are true; `server/listings/mapper.js`
   already carries the required IDX attribution (listing office, agent, MLS
   name, as-of timestamp) on every record — don't strip those in any future
   changes to the display layer.
4. Confirm field names against whatever Web API documentation Metro Search
   /their vendor provides — the adapter assumes standard RESO Data Dictionary
   names (`ListPrice`, `BedroomsTotal`, `StandardStatus`, etc.), which is the
   norm, but every MLS's actual field customizations should be checked
   against their docs before trusting the mapping blind.

## If you expand beyond the Louisville metro later

Every additional MLS market is a **separate application, separate broker
relationship (or license), and separate credential set** — RESO Web API
being a shared standard doesn't mean shared access. Budget for that
per-market, not as a one-time setup cost.
