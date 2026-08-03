# Ship Smart Realty USA to smartrealty.us — do this now

**Goal:** Replace the GoDaddy Website Builder page with your custom dark demo.

**Right now on https://smartrealty.us:** Website Builder template (not your demo).  
**Your custom demo:** ready locally + upload zip on Desktop.

---

## Critical fact

Website Builder **cannot** host this custom `index.html` / `app.js` site.  
You need **one** of:

| Path | Cost | Time | Best if… |
|------|------|------|----------|
| **A · GoDaddy Web Hosting (cPanel)** | Paid (~$5–15/mo) | 45–90 min | You want everything inside GoDaddy |
| **B · Free static host + GoDaddy DNS** | Free | 15–30 min | You want live *today* without new hosting |

Both end at **https://smartrealty.us** with your demo.

**In-app unlock:** `SmartRealty2026`  
**Contact:** ai@smartrealty.us

---

# Path A — GoDaddy Web Hosting (cPanel)

### A1. Confirm or buy hosting

1. Sign in → [https://www.godaddy.com](https://www.godaddy.com) → **My Products**
2. Look for **Web Hosting** (cPanel / Linux) — **not** only “Website Builder”
3. If missing: **Get Hosting** → **Web Hosting** (Economy is fine for a demo)
4. **Set up** → assign primary domain = **smartrealty.us**
5. Open **cPanel** → note **Shared IP Address**  
   Write it: `____.____.____.____`

### A2. DNS (point domain at hosting)

1. My Products → Domains → **smartrealty.us** → **DNS**
2. Remove Website Builder / old records that conflict on `@` and `www`
3. Set:

| Type | Name | Value | TTL |
|------|------|--------|-----|
| **A** | `@` | *your hosting IP* | 600 |
| **CNAME** | `www` | `smartrealty.us` | 600 |

4. Wait until Terminal shows hosting IP:

```bash
dig +short smartrealty.us A
```

### A3. Upload demo

1. On your Mac, zip is already built:

```bash
open ~/Desktop/smart-realty-usa-upload.zip
# or rebuild:
cd ~/Projects/smart-realty-usa && ./scripts/pack-for-upload.sh
```

2. cPanel → **File Manager** → gear → **Show Hidden Files** → Save  
3. Open **`public_html`**  
4. Delete/replace default builder/parking homepage files if present  
5. **Upload** `smart-realty-usa-upload.zip` → **Extract** here  
6. Confirm you see: `index.html`, `styles.css`, `app.js`, `domain-config.js`, `images/`, `.htaccess`, `.htpasswd`

### A4. SSL

cPanel → **SSL/TLS Status** or **AutoSSL** → Run → wait until **https://** padlock works.

### A5. Optional second password (server Basic Auth)

Default first deploy leaves Apache Basic Auth **off** so a bad path can’t 500 the site.  
In-app gate still works. To add server password later, edit `.htaccess` (see comments in file).

### A6. Verify

```bash
cd ~/Projects/smart-realty-usa
./scripts/verify-live.sh smartrealty.us
```

Browser: open https://smartrealty.us → unlock with `SmartRealty2026`.

---

# Path B — Free host + GoDaddy DNS (fastest live)

Use **GitHub Pages** (or Cloudflare Pages / Netlify). Domain stays at GoDaddy; only DNS changes.

### B1. Publish site files (agent can do this with your OK)

```bash
cd ~/Projects/smart-realty-usa
# private or public repo; Pages site URL is public either way
# in-app password still required to use the demo
```

### B2. GoDaddy DNS for GitHub Pages

After the Pages site exists (example: `YOURUSER.github.io/smart-realty-usa` or custom Pages domain setup):

**GitHub → repo → Settings → Pages → Custom domain:** `smartrealty.us`  
Then at GoDaddy DNS set the A/CNAME values GitHub shows (they publish current IPs in their docs).

Typical pattern (confirm in GitHub UI — IPs can change):

| Type | Name | Value |
|------|------|--------|
| **A** | `@` | GitHub Pages IPs (4 records, from GitHub docs) |
| **CNAME** | `www` | `YOURUSER.github.io` |

Enable **Enforce HTTPS** in GitHub Pages after DNS verifies.

### B3. Disable Website Builder parking

In GoDaddy, turn off Website Builder / forwarding for this domain so DNS isn’t overridden.

---

# After either path

- [ ] https://smartrealty.us shows **password gate** (not “Luxury Condos” builder page)
- [ ] Unlock works with `SmartRealty2026`
- [ ] Listings + BTC ticker load
- [ ] Fill [SHARE-EMAIL.txt](./SHARE-EMAIL.txt) and send privately
- [ ] Later: set `presenterMode: false` in `domain-config.js` and re-upload
- [ ] Optional: enable Apache Basic Auth (Path A only)

---

# If something breaks

| Symptom | Fix |
|---------|-----|
| Still see Website Builder | DNS not on hosting/Pages yet, or builder still owning domain |
| HTTP 500 | Rename `.htaccess` → `.htaccess.off` |
| No padlock | Wait AutoSSL / GitHub HTTPS; check DNS |
| Blank page | `images/` missing or wrong folder level (files must be at site root) |
| dig shows old IPs | Wait 5–60 min; flush cache; check you edited the right domain |

---

**Need help live:** say which path you chose (A or B) and paste your **hosting IP** (A) or **GitHub username** (B).
