# Go live on smartrealty.us (Cloudflare → GitHub Pages)

**Goal:** Replace the WordPress / Website Builder site with this Smart Realty USA demo.

**Repo:** https://github.com/letsdothis1155/smart-realty-usa  
**Pages source:** branch `main`, folder `/`  
**Custom domain (repo):** `smartrealty.us`  
**Auth mode for static public demo:** `open` in `domain-config.js`

---

## Current blockers (as of last check)

| Check | Status |
|-------|--------|
| GitHub Pages built for `smartrealty.us` | Yes (repo setting) |
| DNS for `smartrealty.us` | Cloudflare proxy → **WordPress** (not Pages) |
| Public site content | WordPress (`wp-json` headers) |

Until DNS points at **GitHub Pages**, the domain will keep showing WordPress.

---

## Path B — Free / fast (recommended)

### B1. Push this demo to `main`

```bash
cd ~/Projects/smart-realty-usa
git checkout main
git merge ship-fund-earn   # if needed
git push origin main
```

GitHub Pages rebuilds in ~1–2 minutes from `main`.

**Interim URL (before DNS):**  
https://letsdothis1155.github.io/smart-realty-usa/

### B2. Cloudflare DNS (you do this in the dashboard)

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → domain **smartrealty.us**
2. **DNS** → remove / replace records that send `@` / `www` to WordPress hosting
3. Set:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| **A** | `@` | `185.199.108.153` | DNS only (grey cloud) **first** |
| **A** | `@` | `185.199.109.153` | DNS only |
| **A** | `@` | `185.199.110.153` | DNS only |
| **A** | `@` | `185.199.111.153` | DNS only |
| **CNAME** | `www` | `letsdothis1155.github.io` | DNS only |

4. **SSL/TLS** → set to **Full** (not Flexible) once HTTPS works
5. After GitHub shows the custom domain as active, you may turn proxy (orange cloud) back on if you want CF CDN

### B3. GitHub Pages domain check

Repo → **Settings → Pages → Custom domain** = `smartrealty.us`  
Enforce HTTPS when the certificate is ready.

### B4. Verify

```bash
dig +short smartrealty.us A
# expect 185.199.108–111.153 (or Cloudflare IPs if proxied)

curl -sI https://smartrealty.us | head -15
# should NOT include x-pingback / wp-json once cutover works

./scripts/verify-live.sh smartrealty.us
```

Browser: https://smartrealty.us → **open public landing** (no password wall).  
Unlock soft sheet only on ₿ buy / Try-Before-Buy if signed out.

---

## Path A — GoDaddy cPanel (PHP accounts)

Use when you want register/login on the same host:

1. Pack: `./scripts/pack-for-upload.sh` → `~/Desktop/smart-realty-usa-upload.zip`
2. cPanel → `public_html` → upload + extract
3. Create `api/config.local.php` from sample · set strong `SRU_JWT_SECRET` + demo password
4. Point DNS A `@` at **hosting IP** (not GitHub Pages)
5. See [GODADDY-ORGANIZER.md](./GODADDY-ORGANIZER.md)

---

## After go-live

- [ ] Confirm open landing loads with no gate flash  
- [ ] Listings show unique photos + 4-photo galleries  
- [ ] BTC ticker live  
- [ ] `presenterMode: false` (already)  
- [ ] Share URL privately first, then wider  

**Contact:** ai@smartrealty.us  
**Demo disclaimer:** not a licensed brokerage; marketing prototype only.
