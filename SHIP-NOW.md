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

# Path B — GitHub Pages (already set up — only DNS left)

**Repo:** https://github.com/letsdothis1155/smart-realty-usa  
**Pages:** custom domain `smartrealty.us` · branch `main` · root `/`  
**In-app password still required:** `SmartRealty2026`

### B1. Done for you

- Demo code pushed to GitHub  
- GitHub Pages enabled with `CNAME` = `smartrealty.us`  
- Upload zip also on Desktop if you prefer Path A later  

### B2. YOU — change GoDaddy DNS (required)

1. Sign in → [godaddy.com](https://www.godaddy.com) → **My Products** → **Domains** → **smartrealty.us** → **DNS** / **Manage DNS**
2. **Turn off** Website Builder for this domain if it keeps overriding DNS (My Products → Website → disconnect / cancel trial, or remove builder A records)
3. **Delete** old A / CNAME / forwarding for `@` and `www` that point at Website Builder
4. **Add** these records:

| Type | Name | Value | TTL |
|------|------|--------|-----|
| **A** | `@` | `185.199.108.153` | 600 |
| **A** | `@` | `185.199.109.153` | 600 |
| **A** | `@` | `185.199.110.153` | 600 |
| **A** | `@` | `185.199.111.153` | 600 |
| **CNAME** | `www` | `letsdothis1155.github.io` | 600 |

5. Save. Wait 5–30 minutes (sometimes up to a few hours).

### B3. Verify DNS then HTTPS

```bash
dig +short smartrealty.us A
# expect 185.199.108–111.153

cd ~/Projects/smart-realty-usa
./scripts/verify-live.sh smartrealty.us
```

Then open: **https://smartrealty.us** → unlock with **`SmartRealty2026`**

### B4. Enforce HTTPS in GitHub

1. Open: https://github.com/letsdothis1155/smart-realty-usa/settings/pages  
2. Confirm custom domain **smartrealty.us**  
3. After DNS shows green / certificate ready → check **Enforce HTTPS**

### B5. If domain still shows “Luxury Condos” builder

- DNS not updated yet, or builder still owns the domain  
- Re-check A records with `dig`  
- In GoDaddy, remove domain **forwarding** and builder parking

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
