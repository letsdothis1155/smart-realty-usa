# Smart Realty USA — Demo Website

Exclusive real-estate demo: transparent **House Blue Book** pricing, live **Bitcoin** checkout quotes, Try-Before-Buy stays, and 24/7 human-style support chat.

**Official contact:** [ai@smartrealty.us](mailto:ai@smartrealty.us)

---

## Quick start (local)

```bash
# 1) Auth API (sign-in / create account)
cd ~/Projects/smart-realty-usa/server
npm install && npm start

# 2) Website (new terminal)
cd ~/Projects/smart-realty-usa
python3 -m http.server 8766
# open http://127.0.0.1:8766/auth.html
```

**Demo password:** `SmartRealty2026`  
**Accounts:** create on `/auth.html` (passwords hashed by the Auth API)  
**Hosting question:** see [AUTH-AND-HOSTING.md](./AUTH-AND-HOSTING.md) — **you do not need classic web hosting** for sign-in

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
.htpasswd           Server user: demo
robots.txt          noindex for private demo
scripts/            pack + verify helpers
```

---

## Security notes

- Change `DEMO_PASSWORD` in `app.js` before wide sharing
- Regenerate `.htpasswd` for a new server password
- Set `presenterMode: false` in `domain-config.js` when done presenting
- This is a **demo** — not a licensed brokerage transaction system

---

© 2026 Smart Realty USA · Demo Version · All Rights Reserved
