# Sign-in, passwords & hosting — do you need a host?

## Short answer

| Question | Answer |
|----------|--------|
| Do I need **real** sign-up / passwords? | **Yes** — that needs a small **backend API** + storage |
| Do I need **classic GoDaddy Web Hosting / cPanel**? | **No** — not required for auth |
| Is GitHub Pages enough alone? | **Frontend only** — it cannot safely store passwords |
| Best free path | **GitHub Pages** (site) + **Auth API** on free Railway / Render / Fly + optional **Neon** Postgres later |

**You should not buy paid web hosting just for a sign-in page.**  
Buy hosting only if you already want cPanel for other reasons (email, PHP apps, etc.).

---

## What we built

| Piece | File(s) | Role |
|-------|---------|------|
| Sign-in UI | `auth.html`, `js/auth-page.js` | Sign in · Create account · Demo access |
| Client helper | `js/auth-client.js` | Token storage, API calls |
| Auth API | `server/` | Register / login / demo / me |
| Password security | bcrypt (12 rounds) on server | **Never** store plain passwords |
| Sessions | JWT (14 days) | `Authorization: Bearer …` |
| Config | `domain-config.js` → `auth` | `mode`, `apiUrl`, `demoPassword` |

### Password rules

- Minimum **8 characters**
- Stored as **bcrypt hash** only
- Demo shared password still available for private demos (`SmartRealty2026`)

---

## Run locally (right now)

**Terminal 1 — Auth API**

```bash
cd ~/Projects/smart-realty-usa/server
npm install
npm start
# → http://127.0.0.1:8787
```

**Terminal 2 — Website**

```bash
cd ~/Projects/smart-realty-usa
python3 -m http.server 8766
# open http://127.0.0.1:8766/auth.html
```

1. Open **Create account** → register  
2. Sign out → **Sign in** with same email/password  
3. Or use **Demo access** with `SmartRealty2026`

---

## Production architecture (recommended)

```
Browser (smartrealty.us)
   │  static HTML/CSS/JS  →  GitHub Pages (free)  [already set up]
   │
   └── Auth API (HTTPS)   →  Railway / Render / Fly free tier
         └── users.json   →  later: Neon Postgres (free tier)
```

### Steps when you go live

1. Deploy `server/` to a free Node host  
2. Set env vars:
   - `JWT_SECRET` = long random string  
   - `DEMO_PASSWORD` = your shared demo password  
   - `CORS_ORIGIN` = `https://smartrealty.us`  
   - `PORT` = whatever the host assigns  
3. In `domain-config.js`:

```js
auth: {
  mode: "accounts",
  apiUrl: "https://YOUR-AUTH-API.up.railway.app", // example
  demoPassword: "SmartRealty2026", // change for production
  allowDemoAccess: true,
},
```

4. Commit + push frontend so GitHub Pages updates  
5. Point DNS as in `SHIP-NOW.md` (still only DNS for the static site)

### Optional upgrade: Neon Postgres

When you outgrow the JSON file:

- Free Neon project + `users` table  
- Same API routes — swap `server/db.js`  
- Neon Auth is another option (managed users/sessions)

You already have Neon tooling available in this environment; we can wire it when you create a Neon project.

---

## Auth modes (`domain-config.js`)

| `auth.mode` | Behavior |
|-------------|----------|
| `accounts` | Prefer `auth.html` (sign in / create / demo) |
| `demo` | Shared password only (legacy single password) |
| `open` | No gate (public marketing) |

---

## Security notes

- Client-side “accounts” in `localStorage` alone are **not** secure — we do **not** do that  
- Demo password in config is for private demos only — change before wide public share  
- Always set a unique `JWT_SECRET` in production  
- Use HTTPS for the API URL  
- This remains a **demo** — not a licensed brokerage system  

---

## Do **not** use for real passwords

- Website Builder alone  
- GitHub Pages alone (no secret storage)  
- Hardcoding user passwords in `app.js`  

---

## Quick test (API)

```bash
# health
curl -s http://127.0.0.1:8787/health

# register
curl -s -X POST http://127.0.0.1:8787/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# login
curl -s -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'
```
