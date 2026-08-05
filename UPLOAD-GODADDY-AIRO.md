# Upload Smart Realty USA demo — GoDaddy Airo / Hosting

**Package:** `SmartRealty-USA-GoDaddy-Demo.zip` (in your Downloads folder)  
**Demo password:** `SmartRealty2026`  
**Contact:** ai@smartrealty.us  

---

## Important: Airo vs Web Hosting

| Product | Can host this full demo? |
|---------|---------------------------|
| **GoDaddy Airo / Website Builder / Websites + Marketing** | **Not fully.** You can only paste small HTML snippets into an “HTML” section — not a whole multi-file app with folders. |
| **Linux Web Hosting (cPanel)** | **Yes.** Upload this zip → extract into `public_html`. |
| **Domain only** | Buy **Web Hosting**, then attach `smartrealty.us`. |

**Your custom dark demo (listings, BTC, Blue Book, auth) needs Web Hosting**, not the Airo AI page builder alone.

If Airo currently owns smartrealty.us, **disconnect the builder site** (or stop using it as primary) and point DNS to **Web Hosting**.

---

## Path A — Full demo on Web Hosting (recommended)

### 1. Get hosting
1. GoDaddy → **My Products**
2. Add **Web Hosting** (Linux / cPanel) if you don’t have it  
3. Assign domain **smartrealty.us**

### 2. DNS
| Type | Name | Value |
|------|------|--------|
| A | `@` | Your hosting IP (from cPanel) |
| CNAME | `www` | `smartrealty.us` |

Remove Website Builder / parking A records that conflict.

### 3. Upload this zip
1. cPanel → **File Manager**
2. Settings → **Show Hidden Files**
3. Open **`public_html`**
4. Upload **`SmartRealty-USA-GoDaddy-Demo.zip`**
5. **Extract** here (files at root of `public_html`, not nested folder)
6. Confirm you see `index.html`, `styles.css`, `app.js`, `images/`, `api/`

### 4. SSL
cPanel → **SSL/TLS Status** or AutoSSL → Run for `smartrealty.us`

### 5. Open the demo
- https://smartrealty.us  
- Password: **`SmartRealty2026`**  
- Or: https://smartrealty.us/auth.html  

### 6. Secrets (before wide share)
See **SECRETS.md** in this zip:
- Create `api/config.local.php` from `api/config.sample.php`
- Change JWT, demo password, admin password

Admin leads: https://smartrealty.us/admin.html  
Default admin password until changed: `SmartRealtyAdmin2026`

---

## Path B — Airo / Website Builder only (limited)

Airo cannot run this multi-file demo as a real site.

Options:
1. **Switch to Web Hosting** (Path A) — best  
2. Use Airo only as a “Coming soon” page and put the full demo on a **subdomain** with hosting (e.g. `demo.smartrealty.us`)  
3. Paste a **tiny** HTML teaser into Airo’s HTML section (not the full app)

### Tiny Airo HTML teaser (optional)

Add a section → **HTML** → paste:

```html
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:2rem auto;padding:1.5rem;background:#0a0c10;color:#f3f5f9;border-radius:16px;text-align:center">
  <div style="font-size:12px;letter-spacing:2px;color:#e8c87a;font-weight:700">SMART REALTY USA</div>
  <h2 style="margin:0.75rem 0;font-size:1.5rem">Exclusive homes. Transparent prices. Bitcoin ready.</h2>
  <p style="color:#9aa3b5;line-height:1.5">Full interactive demo (listings, Blue Book, live BTC) runs on our Web Hosting package.</p>
  <p style="margin:1rem 0 0">
    <a href="https://smartrealty.us" style="display:inline-block;background:#5b8cff;color:#041018;padding:0.75rem 1.25rem;border-radius:999px;font-weight:700;text-decoration:none">Open demo</a>
  </p>
  <p style="font-size:12px;color:#6b7385;margin-top:1rem">Demo password when prompted: SmartRealty2026</p>
</div>
```

(Update the link after hosting is live.)

---

## What’s in this zip

```
index.html          Main demo site
auth.html           Sign in / demo password
account.html        Member account
admin.html          Waitlist leads (password protected)
privacy.html / terms.html / 404.html
styles.css  app.js  domain-config.js
js/                 properties, auth, analytics…
images/             Hero + homes
api/                PHP accounts + leads (cPanel only)
UPLOAD-GODADDY-AIRO.md   ← this guide
SECRETS.md
```

**This package is tuned for demos:** password gate (`auth.mode: "demo"`).  
Full member accounts work after PHP `api/` is live on cPanel.

---

## Quick test after upload

| Check | URL |
|-------|-----|
| Home | https://smartrealty.us/ |
| Unlock | password `SmartRealty2026` |
| Listings | scroll or #listings |
| Map | Listings → Map view |
| BTC ticker | top of page |
| Privacy | /privacy.html |

---

## Support

Email: **ai@smartrealty.us**  
Project on Mac: `~/Projects/smart-realty-usa`
