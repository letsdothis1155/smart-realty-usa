# GoDaddy organizer — Smart Realty USA (website + accounts)

**Scope right now:** the **website only** (not the Android app).  
**Goal:** one clean place on GoDaddy for domain, hosting, files, and member accounts.

---

## Your stack (keep it simple)

| Layer | Where it lives | Product on GoDaddy |
|-------|----------------|--------------------|
| **Domain** | `smartrealty.us` | Domain (you already own this) |
| **DNS** | A / CNAME / email records | Domain → **DNS** |
| **Website files** | `public_html/` | **Web Hosting (cPanel Linux)** |
| **Member accounts** | `public_html/api/` (PHP) | Same Web Hosting — no second host |
| **Email** `ai@…` | Forward or mailbox | Email / Workspace (optional) |
| **Website Builder** | Old “Luxury Condos” page | **Turn off / disconnect** — not used |

You do **not** need a VPS or separate Node host if you use the PHP account API in this project.

---

## Step 1 — What to buy / open in My Products

Sign in: [https://www.godaddy.com](https://www.godaddy.com) → **My Products**

### Keep

- [x] **Domain:** `smartrealty.us` (expires 2028)

### Add if missing

- [ ] **Web Hosting** — Linux / **cPanel** (Economy is enough for the demo site + accounts)  
  - Name it in your head: **“Smart Realty site host”**  
  - Assign primary domain: **smartrealty.us**

### Optional later

- [ ] **Professional Email** or free **forwarding** for `ai@smartrealty.us`
- [ ] Microsoft 365 only if you want full mailboxes

### Do not use for this project

- Website Builder / Airo site (can’t run your custom HTML + PHP accounts well)
- Managed WordPress
- Random SSL upsells (use free AutoSSL on cPanel)

---

## Step 2 — Disconnect Website Builder from the domain

While Website Builder owns the domain, your custom site won’t show.

1. My Products → **Websites** / Website Builder for smartrealty.us  
2. **Disconnect domain** or cancel the builder site assignment  
3. Confirm DNS is free for you to edit (A records → **hosting IP**, not builder)

---

## Step 3 — Connect domain → Web Hosting

1. Hosting → **Set up** / **Manage** → assign **smartrealty.us** as primary (or addon)  
2. Open **cPanel**  
3. Write down **Shared IP Address**: `____.____.____.____`  
4. Domain → **DNS**:

| Type | Name | Value |
|------|------|--------|
| **A** | `@` | *your hosting IP* |
| **CNAME** | `www` | `smartrealty.us` |

5. Wait until:

```bash
dig +short smartrealty.us A
# should show your hosting IP
```

---

## Step 4 — Upload the website + accounts API

On your Mac:

```bash
cd ~/Projects/smart-realty-usa
./scripts/pack-for-upload.sh
# → ~/Desktop/smart-realty-usa-upload.zip
```

In **cPanel → File Manager**:

1. Gear → **Show Hidden Files**  
2. Open **`public_html`**  
3. Remove default builder / parking homepage junk  
4. **Upload** the zip → **Extract**  
5. Confirm structure:

```
public_html/
  index.html          ← main website
  auth.html           ← sign in / create account
  styles.css
  app.js
  domain-config.js
  js/
  images/
  api/                ← member accounts (PHP)
    auth/
    data/             ← user DB (protected)
  .htaccess
  robots.txt
```

6. **Permissions:** `api/data/` should be writable (often `755` or `775` on folder)

7. cPanel → **SSL / AutoSSL** → issue cert for `smartrealty.us` + `www`

---

## Step 5 — Accounts config (one file)

Edit **`domain-config.js`** on the server (or before re-upload):

```js
auth: {
  mode: "accounts",
  // Empty string = same website origin (https://smartrealty.us) → uses PHP /api
  apiUrl: "",
  demoPassword: "SmartRealty2026",  // change before wide share
  allowDemoAccess: true,
},
```

Also set:

```js
siteUrl: "https://smartrealty.us",
presenterMode: false,   // after you’re done presenting
isPrivateDemo: true,    // keep DEMO badges until launch
```

**Local testing on your Mac** (optional Node API):

```js
apiUrl: "http://127.0.0.1:8787",
```

---

## Step 6 — Secure the accounts data folder

After upload, open `api/config.php` and set a long random secret:

```php
define('SRU_JWT_SECRET', 'paste-a-long-random-string-here');
define('SRU_DEMO_PASSWORD', 'YourDemoPassword');
```

Never commit real secrets. `api/data/users.json` holds hashed passwords only (bcrypt).

---

## Step 7 — Smoke test

| Check | URL / action |
|-------|----------------|
| Site | https://smartrealty.us |
| Sign in page | https://smartrealty.us/auth.html |
| API health | https://smartrealty.us/api/health.php |
| Create account | auth.html → Create account |
| Sign in | same email/password |
| Demo access | shared demo password |

From Mac:

```bash
cd ~/Projects/smart-realty-usa
./scripts/verify-live.sh smartrealty.us
curl -s https://smartrealty.us/api/health.php
```

---

## How to keep GoDaddy organized (mental model)

```
GoDaddy account
├── Domain: smartrealty.us          ← DNS + renewals
├── Web Hosting (cPanel)            ← website + PHP accounts
│     └── public_html/              ← only Smart Realty files
├── Email (optional)                ← ai@smartrealty.us
└── NOT used: Website Builder       ← disconnect
```

**One domain. One hosting plan. One folder (`public_html`).**  
Accounts are not a separate “app product” — they’re the `api/` folder next to the site.

---

## Local website only (no Android)

```bash
cd ~/Projects/smart-realty-usa
# Optional accounts API for local Node:
#   cd server && npm start
# Or skip API and use Demo password on auth.html

python3 -m http.server 8766
# Website:  http://127.0.0.1:8766/
# Sign in:  http://127.0.0.1:8766/auth.html
# (Ignore /m/ Android shell for now)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Still see Website Builder | Disconnect builder; fix A record to hosting IP |
| Create account fails | PHP not running, or `api/data` not writable; check `health.php` |
| HTTP 500 | Rename root `.htaccess` temporarily; fix paths |
| CORS errors | Use `apiUrl: ""` so site and API are same origin |
| Forgot password system | Demo only for now — reset by editing/removing `api/data/users.json` in File Manager |

---

## Checklist summary

1. [ ] Buy/open **Web Hosting (cPanel)**  
2. [ ] Disconnect **Website Builder**  
3. [ ] DNS **A @ → hosting IP**, **www CNAME**  
4. [ ] Upload **smart-realty-usa-upload.zip** → extract in `public_html`  
5. [ ] AutoSSL active  
6. [ ] Set `SRU_JWT_SECRET` in `api/config.php`  
7. [ ] `domain-config.js` → `apiUrl: ""`, `siteUrl` correct  
8. [ ] Test **auth.html** create account + login  
9. [ ] Optional: email for `ai@smartrealty.us`  

When you’ve finished **Step 1–2** in the GoDaddy UI (hosting purchased + builder status), tell me what you see under My Products and we’ll walk DNS + upload line by line.
