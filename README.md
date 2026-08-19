# Smart Realty USA — Demo Website

Exclusive real-estate demo: transparent **House Blue Book** pricing, live **Bitcoin** checkout quotes, Try-Before-Buy stays, and 24/7 human-style support chat.

**Official contact:** [ai@smartrealty.us](mailto:ai@smartrealty.us)

---

## Quick start (website)

```bash
cd ~/Projects/smart-realty-usa
python3 -m http.server 8766
# open http://127.0.0.1:8766/          main site
# open http://127.0.0.1:8766/auth.html sign in / create account
```

**Focus right now:** website + GoDaddy hosting + accounts (not the Android shell).

### Direct Deposit (sandbox)

Mobile-first paycheck switching UI at [`direct-deposit/app/`](./direct-deposit/app/) (marketing landing at [`direct-deposit/`](./direct-deposit/)). Production ACH/payroll is **disabled**. Local preview:

```bash
cd ~/Projects/smart-realty-usa/server
# copy env.example → .env, set JWT_SECRET and SERVE_STATIC=1
DIRECT_DEPOSIT_MODE=mock SERVE_STATIC=1 JWT_SECRET=replace-with-32-plus-character-secret npm start
# open http://127.0.0.1:8787/direct-deposit/app/
```

See [COMPLIANCE-DIRECT-DEPOSIT.md](./COMPLIANCE-DIRECT-DEPOSIT.md).

| Item | Value |
|------|--------|
| **Demo password** | Server-only; configure in `api/config.local.php` |
| **Accounts on GoDaddy** | PHP API in [`api/`](./api/) (same cPanel as the site) |
| **GoDaddy checklist** | **[GODADDY-ORGANIZER.md](./GODADDY-ORGANIZER.md)** ← start here |
| **Upload zip** | `./scripts/pack-for-upload.sh` → Desktop |

### GoDaddy in one line

Buy **Web Hosting (cPanel)** → disconnect Website Builder → point DNS at hosting IP → upload zip into `public_html` → set secret in `api/config.php`.

---

## Live deploy status

| Item | Value |
|------|--------|
| **GitHub** | https://github.com/letsdothis1155/smart-realty-usa |
| **Pages** | Built · custom domain `smartrealty.us` |
| **Upload zip** | `~/Desktop/smart-realty-usa-upload.zip` |
| **Ship steps** | [SHIP-NOW.md](./SHIP-NOW.md) |

**Next (you):** point GoDaddy DNS A records for `@` at GitHub Pages IPs (see SHIP-NOW.md Path B).  
Until then, the public domain may still show Website Builder.



## Custom domain (GoDaddy → live HTTPS)

**Start here → [CUSTOM-DOMAIN-WALKTHROUGH.md](./CUSTOM-DOMAIN-WALKTHROUGH.md)**

| File | Purpose |
|------|---------|
| [CUSTOM-DOMAIN-WALKTHROUGH.md](./CUSTOM-DOMAIN-WALKTHROUGH.md) | Full domain, DNS, SSL, email, troubleshooting |
| [GO-LIVE-CHECKLIST.md](./GO-LIVE-CHECKLIST.md) | Printable checkbox list |
| [SHARE-EMAIL.txt](./SHARE-EMAIL.txt) | Client invite copy/paste |
| [DEPLOY-GODADDY.md](./DEPLOY-GODADDY.md) | Short GoDaddy notes |
| [domain-config.js](./domain-config.js) | Live URL + brand settings |
| [DUNS-AND-COMPANY-SETUP.md](./DUNS-AND-COMPANY-SETUP.md) | Free D‑U‑N‑S® + company identity checklist |
| `scripts/pack-for-upload.sh` | Zip for cPanel upload |
| `scripts/verify-live.sh` | DNS + HTTPS smoke check |

```bash
# Pack for upload
./scripts/pack-for-upload.sh

# After DNS is live
./scripts/verify-live.sh smartrealty.us
```

---

## What’s in the demo

- 18 listings (luxury + everyday markets)
- Live BTC rates (CoinGecko + Coinbase)
- Zillow-style search, filters, map pins
- Free Blue Book estimator
- Bitcoin checkout simulation
- Try-Before-Buy rentals
- Live chat widget
- Password gate + optional Apache Basic Auth

---

## Project structure

```
index.html          Main page
styles.css          Dark luxury UI
app.js              Listings, search, BTC, chat
domain-config.js    Custom domain / brand config
images/             Hero + property photos
.htaccess           Apache auth, headers, SSL hooks
.htpasswd           Create on the server only; never commit or package
robots.txt          noindex for private demo
scripts/            pack + verify helpers
```

---

## Security notes

- Set `SRU_DEMO_PASSWORD` only in `api/config.local.php`; keep browser files secret-free
- Create or rotate `.htpasswd` on the server; never commit or package it
- Set `presenterMode: false` in `domain-config.js` when done presenting
- This is a **demo** — not a licensed brokerage transaction system

---

© 2026 Smart Realty USA · Demo Version · All Rights Reserved
