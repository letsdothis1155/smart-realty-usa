# Smart Realty USA — Custom Domain Walkthrough

**Take this file from zero → live HTTPS demo on your own domain.**

| Item | Value |
|------|--------|
| **Recommended domain** | `smartrealty.us` (or any domain you own) |
| **Official email** | `ai@smartrealty.us` |
| **In-app demo password** | `SmartRealty2026` |
| **Server login (optional)** | user `demo` · password `SmartRealty2026` |
| **Project folder** | `~/Projects/smart-realty-usa` |
| **Time estimate** | 45–90 minutes first time (DNS can add wait) |

---

## What you will finish with

```
https://smartrealty.us          → password gate → full demo
https://www.smartrealty.us      → redirects to apex (or vice versa)
ai@smartrealty.us               → real inbox or forward
Client email                    → ready to send (SHARE-EMAIL.txt)
```

---

## Choose your layout (pick one)

| Plan | Public URL | Best for |
|------|------------|----------|
| **A · Main site** | `https://smartrealty.us` | Brand launch / full domain |
| **B · Subfolder** | `https://smartrealty.us/demo` | Keep root free for a future site |
| **C · Subdomain** | `https://demo.smartrealty.us` | Clean private demo link |

**Recommendation for investor demos:** Plan **C** (`demo.smartrealty.us`) or Plan **A** if the brand *is* the domain.

This guide covers all three. Steps that differ are labeled **[A]**, **[B]**, **[C]**.

---

# Phase 0 — What you need before starting

### Accounts & products

1. **GoDaddy account** (or any registrar — steps map similarly)
2. **Domain** purchased (e.g. `smartrealty.us`)
3. **Web Hosting** with **cPanel** (Economy / Deluxe / Ultimate)  
   - ❌ **Website Builder alone is not enough** for this custom HTML demo  
   - ✅ **Linux / cPanel hosting** is required
4. Optional but recommended: **Professional email** or free **email forwarding** for `ai@…`

### Files ready on your Mac

```
~/Projects/smart-realty-usa/
  index.html
  styles.css
  app.js
  domain-config.js
  images/          (all mansion + hero images)
  .htaccess
  .htpasswd
  robots.txt
  CUSTOM-DOMAIN-WALKTHROUGH.md
  GO-LIVE-CHECKLIST.md
  SHARE-EMAIL.txt
  DEPLOY-GODADDY.md
  scripts/
```

Pack a clean zip anytime:

```bash
cd ~/Projects/smart-realty-usa
./scripts/pack-for-upload.sh
# creates: ~/Desktop/smart-realty-usa-upload.zip
```

### Passwords (change before public launch)

| Layer | Where | Default |
|-------|--------|---------|
| In-app gate | `app.js` → `DEMO_PASSWORD` | `SmartRealty2026` |
| Server Basic Auth | `.htpasswd` + Directory Privacy | user `demo` / `SmartRealty2026` |

---

# Phase 1 — Buy or confirm the domain

1. Go to [https://www.godaddy.com](https://www.godaddy.com) → **Sign In**
2. Open **My Products**
3. Under **Domains**, confirm you see your domain (example: `smartrealty.us`)
4. Note:
   - **Expiration date** (turn on auto-renew)
   - **Nameservers** (you will either keep GoDaddy DNS or point to hosting)

### Domain not purchased yet?

1. Search the name you want
2. Complete checkout
3. **Uncheck** upsells you don’t need (VPN, website builder trials, etc.) unless you want them
4. Complete purchase → wait until domain appears under **My Products** (often instant)

---

# Phase 2 — Attach Web Hosting (critical)

### 2.1 Buy or open hosting

1. My Products → **Web Hosting**  
   - If none: **Get Hosting** → choose **Web Hosting** (cPanel Linux)
2. Click **Set up** / **Manage** / **Admin** until you reach **cPanel** or the hosting dashboard

### 2.2 Connect domain to hosting

1. In hosting setup, **assign** your domain as the primary domain  
   **or** add it as an **addon domain**
2. Prefer:
   - **[A]** Primary domain = `smartrealty.us`
   - **[C]** Addon / subdomain = `demo.smartrealty.us` (create in cPanel → **Domains** / **Subdomains**)

### 2.3 Find your hosting IP (needed for DNS)

In cPanel look for:

- **Shared IP Address**, or  
- **Server Information**, or  
- Welcome email from GoDaddy

Write it down:

```
Hosting IP: ___ . ___ . ___ . ___
```

---

# Phase 3 — DNS records (make the domain point at hosting)

Open: GoDaddy → Domains → your domain → **DNS** / **Manage DNS**

### 3.1 Plan A — Apex domain (`smartrealty.us`)

| Type | Name | Value | TTL |
|------|------|--------|-----|
| **A** | `@` | `YOUR_HOSTING_IP` | 600 (or 1 hour) |
| **CNAME** | `www` | `smartrealty.us` | 600 |

Notes:

- Delete conflicting old **A** / **CNAME** / **Forwarding** records for `@` and `www` if they fight this setup
- Domain **Forwarding** (HTTP redirect product) can break SSL — prefer real DNS A/CNAME + hosting

### 3.2 Plan B — Subfolder (`smartrealty.us/demo`)

Use the **same DNS as Plan A**, then upload files into `public_html/demo` (Phase 4).

### 3.3 Plan C — Subdomain (`demo.smartrealty.us`)

| Type | Name | Value | TTL |
|------|------|--------|-----|
| **A** | `demo` | `YOUR_HOSTING_IP` | 600 |

**or**, if cPanel gave you a hostname:

| Type | Name | Value |
|------|------|--------|
| **CNAME** | `demo` | `yourhostinghost.secureserver.net` (example only — use *your* host target) |

Also create the subdomain in **cPanel → Domains / Subdomains** so the folder exists.

### 3.4 Wait for DNS

```bash
# From your Mac Terminal — replace with your domain
dig +short smartrealty.us A
dig +short www.smartrealty.us CNAME
dig +short demo.smartrealty.us A

# Or use the helper after you set DOMAIN:
cd ~/Projects/smart-realty-usa
./scripts/verify-live.sh smartrealty.us
```

DNS can be:

- **2–15 minutes** (common)
- **up to 24–48 hours** (worst case, rare for GoDaddy→GoDaddy hosting)

You’re ready when `dig` shows **your hosting IP**.

---

# Phase 4 — Upload the demo files

### 4.1 Open File Manager

1. cPanel → **File Manager**
2. Settings (gear) → enable **Show Hidden Files (dotfiles)** → Save
3. Navigate:

| Plan | Folder |
|------|--------|
| **[A]** | `public_html/` |
| **[B]** | `public_html/demo/` (create `demo` if needed) |
| **[C]** | folder shown for subdomain (often `public_html/demo.smartrealty.us` or similar) |

### 4.2 Clean out default junk (optional)

If you see `default.html`, `cgi-bin`, parking pages — remove or replace so **your** `index.html` is the homepage.

### 4.3 Upload

Upload **all** of these (zip then Extract is fastest):

```
index.html
styles.css
app.js
domain-config.js
images/                 ← entire folder
.htaccess
.htpasswd
robots.txt
```

Optional (docs only — not required for the site to run):

```
CUSTOM-DOMAIN-WALKTHROUGH.md
GO-LIVE-CHECKLIST.md
SHARE-EMAIL.txt
DEPLOY-GODADDY.md
README.md
```

**Fast path:**

```bash
./scripts/pack-for-upload.sh
```

Then upload the zip → **Extract** in File Manager into the correct folder.

### 4.4 Confirm structure on server

Example for Plan A:

```
public_html/
  index.html
  styles.css
  app.js
  domain-config.js
  robots.txt
  .htaccess
  .htpasswd
  images/
    hero-bg.jpg
    mansion-1.jpg
    …
```

---

# Phase 5 — Wire server password protection

### 5.1 Edit `.htaccess` path

1. In File Manager, open `.htaccess`
2. Find:

```apache
AuthUserFile /home/USERNAME/public_html/.htpasswd
```

3. Replace with your **real absolute path**:

```apache
AuthUserFile /home/YOUR_CPANEL_USER/public_html/.htpasswd
```

How to find the path:

- File Manager: click `.htpasswd` → **Details** / path bar  
- Or cPanel home often shows: `/home/youruser/`

**[B]** If files live in `/demo`:

```apache
AuthUserFile /home/YOUR_CPANEL_USER/public_html/demo/.htpasswd
```

**[C]** Use the subdomain folder path for both files.

### 5.2 Confirm `.htpasswd`

Default user line (bcrypt) is already generated for:

- **User:** `demo`  
- **Password:** `SmartRealty2026`

To regenerate later:

```bash
htpasswd -nbB demo 'YourNewPassword'
# paste the full output line into .htpasswd (replace old line)
```

### 5.3 Alternative: cPanel Directory Privacy (GUI)

1. cPanel → **Directory Privacy**
2. Select your site folder
3. Enable protection → name it `Smart Realty Private Demo`
4. Create user `demo` + password
5. Save  

You can use GUI *or* `.htaccess`/`.htpasswd` — don’t stack conflicting rules if the site returns **500**.

### 5.4 First upload test without server auth (if stuck)

Temporarily rename:

```
.htaccess  →  .htaccess.off
```

Confirm the site loads, then restore auth. A **500 Internal Server Error** almost always means **wrong AuthUserFile path**.

---

# Phase 6 — SSL / HTTPS (padlock)

1. cPanel → **SSL/TLS Status** or **AutoSSL** or GoDaddy **SSL**
2. Run **AutoSSL** / install free certificate for:
   - `smartrealty.us`
   - `www.smartrealty.us`
   - `demo.smartrealty.us` (if Plan C)
3. Wait until status is **Active**
4. Force HTTPS — in `.htaccess` **uncomment** the HTTPS block:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
```

5. Visit:

```
https://YOURDOMAIN
```

You should see the browser padlock + either:

- Server password prompt (`demo` / `SmartRealty2026`), then  
- In-app **Unlock Demo** gate (`SmartRealty2026`)

---

# Phase 7 — Point `domain-config.js` at your live URL

Open `domain-config.js` (local + on server) and set:

```js
window.SRU_CONFIG = {
  siteName: "Smart Realty USA",
  // Primary public URL (no trailing slash)
  siteUrl: "https://smartrealty.us",       // or https://demo.smartrealty.us
  canonicalHost: "smartrealty.us",
  contactEmail: "ai@smartrealty.us",
  phoneDisplay: "1-800-SMART-USA",
  phoneTel: "+18007627879",
  demoPasswordHint: false, // never show password on live site
  isPrivateDemo: true,
  presenterMode: true,     // shows Domain Deploy panel for you; set false later
};
```

Re-upload `domain-config.js` after editing.

The site uses this for:

- Canonical / share links  
- Mailto + contact surfaces  
- Presenter Domain Deploy panel  
- Footer “Live on” line  

---

# Phase 8 — Email: `ai@smartrealty.us`

### Option 1 — Forwarding (fastest, free)

1. GoDaddy → domain → **Email** → **Forwarding**
2. Forward `ai@smartrealty.us` → your personal Gmail/iCloud  
3. Save → test by emailing yourself

### Option 2 — Real mailbox

1. GoDaddy → **Microsoft 365** / **Professional Email**
2. Create mailbox: `ai@smartrealty.us`
3. Sign in via Outlook web / Apple Mail / Gmail “Send mail as”

### SPF (if you send from that domain)

In DNS, GoDaddy often auto-adds Microsoft/Workspace records. If mail goes to spam, add/check SPF TXT for `@` per GoDaddy’s email product instructions.

---

# Phase 9 — www vs non-www (pick one home)

### Prefer apex (`https://smartrealty.us`)

In cPanel **Domains** or `.htaccess`:

```apache
# Optional: www → apex
RewriteEngine On
RewriteCond %{HTTP_HOST} ^www\.(.*)$ [NC]
RewriteRule ^(.*)$ https://%1/$1 [L,R=301]
```

### Prefer www

Reverse the rule so apex redirects to `www`.

Update `domain-config.js` `siteUrl` to match the final choice.

---

# Phase 10 — Smoke test (do not skip)

Use **GO-LIVE-CHECKLIST.md** or run:

```bash
./scripts/verify-live.sh smartrealty.us
# or
./scripts/verify-live.sh demo.smartrealty.us
```

Manual browser pass:

1. [ ] `https://` loads (padlock)
2. [ ] Server auth works (if enabled)
3. [ ] In-app unlock works
4. [ ] Hero image + listing images load
5. [ ] BTC ticker shows a live price (needs internet)
6. [ ] Search “Austin” returns homes
7. [ ] Map view shows pins
8. [ ] Blue Book form generates numbers
9. [ ] Chat widget opens
10. [ ] `mailto:ai@smartrealty.us` works
11. [ ] Phone link works on mobile
12. [ ] iPhone Safari + Chrome desktop both OK

---

# Phase 11 — Share with clients

1. Open `SHARE-EMAIL.txt`
2. Replace `YOUR_LIVE_URL` with your real HTTPS URL
3. Send from `ai@smartrealty.us` if possible

**Never put the password in public tweets or public Instagram bios.**  
Send credentials privately (email, Signal, iMessage).

---

# Phase 12 — Optional polish after live

| Task | Why |
|------|-----|
| Turn `presenterMode: false` in `domain-config.js` | Hide setup panel from clients |
| Change both passwords | Security after wider sharing |
| Add Google Analytics / Plausible | Traffic insight |
| Real favicon PNG | Brand polish |
| Custom 404 page | Less “server default” feel |
| Cloudflare proxy | Extra DDoS/cache (advanced) |

---

# Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **500 error** | Bad `AuthUserFile` path | Fix path or rename `.htaccess` temporarily |
| **DNS not resolving** | Wrong A record / not propagated | `dig` until IP matches hosting |
| **Not secure** | SSL not issued yet | AutoSSL; wait; force HTTPS only after cert is active |
| **Wrong site / parking page** | DNS still on old target | Fix A record; clear browser cache |
| **No images** | `images/` not uploaded | Re-upload folder; check paths are relative |
| **BTC stuck on Loading** | API blocked / offline | Check network; CoinGecko/Coinbase must be reachable |
| **Password never works (server)** | Wrong user/hash | Regenerate `.htpasswd` |
| **Password never works (in-app)** | Typo / caps | Must match `DEMO_PASSWORD` in `app.js` exactly |
| **www works, apex doesn’t** | Missing A for `@` | Add A record for `@` |
| **Mixed content warnings** | Absolute `http://` links | Use relative paths (this project already does) |

---

# One-page command cheat sheet

```bash
# Pack upload zip
cd ~/Projects/smart-realty-usa && ./scripts/pack-for-upload.sh

# After DNS is set — verify live site
./scripts/verify-live.sh smartrealty.us

# New server password line
htpasswd -nbB demo 'NewPasswordHere'
```

---

# Phase map (print this)

```
[0] Domain + hosting ready
        ↓
[1] DNS A/CNAME → hosting IP
        ↓
[2] Upload files to public_html (/demo or subdomain folder)
        ↓
[3] Fix AuthUserFile path in .htaccess
        ↓
[4] AutoSSL → HTTPS
        ↓
[5] domain-config.js siteUrl = live URL
        ↓
[6] Email ai@… forwarding or mailbox
        ↓
[7] Smoke test + SHARE-EMAIL.txt
        ↓
[8] Presenter mode off when finished
```

---

© 2026 Smart Realty USA · Demo Version · All Rights Reserved  
Contact: **ai@smartrealty.us**

