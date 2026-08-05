# Accounts API (PHP) — runs on GoDaddy cPanel

Same-origin member accounts for the website:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` or `/api/health.php` | Health + data folder check |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/demo` | Shared demo password |
| GET | `/api/auth/me` | Current user (Bearer token) |

Passwords are stored with **PHP `password_hash` (bcrypt)**.  
Users file: `api/data/users.json` (blocked from web by `.htaccess`).

## Before public launch

1. Copy `config.sample.php` to gitignored `config.local.php`
2. Set strong `SRU_JWT_SECRET`, `SRU_DEMO_PASSWORD`, and `SRU_ADMIN_PASSWORD` values
3. Ensure `api/data/` is writable (cPanel File Manager → permissions)  
4. `domain-config.js` → `auth.apiUrl: ""` (same site)

## Local PHP test (optional)

```bash
cd ~/Projects/smart-realty-usa
php -S 127.0.0.1:8788
# domain-config apiUrl: "http://127.0.0.1:8788"
```
