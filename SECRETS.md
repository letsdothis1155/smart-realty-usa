# Secrets checklist — Smart Realty USA

Do this **before** wide public share or client demos beyond friends.

## 1. Create local config on the server

In cPanel File Manager → `public_html/api/`:

1. Copy `config.sample.php` → **`config.local.php`**
2. Edit `config.local.php` (not the sample)

## 2. Generate strong secrets

On your Mac:

```bash
openssl rand -hex 32   # JWT
openssl rand -hex 16   # demo password seed
openssl rand -hex 16   # admin password seed
```

Put them in `config.local.php`:

```php
define('SRU_JWT_SECRET', '…32+ char random…');
define('SRU_DEMO_PASSWORD', '…unique…');
define('SRU_ADMIN_PASSWORD', '…unique…');
```

## 3. Keep secrets out of browser files

Do not put the demo or admin password in `domain-config.js`, HTML, JavaScript,
email templates, or a committed `.htpasswd`. The browser sends the entered
demo password to the PHP API, which compares it with `SRU_DEMO_PASSWORD`.

Keep this safe browser configuration:

```javascript
auth: {
  apiUrl: "",
  demoPassword: "",
  allowOfflineDemo: false,
}
```

## 4. Verify

Open: `https://yourdomain/api/security-status.php`  
Expect: `"insecure": false`

Or check the **yellow banner** on the site is gone.

## 5. Never commit

- `api/config.local.php` is gitignored  
- Do not paste production secrets into chat or git  

## Missing configuration

The API now fails closed: account tokens, demo access, and the admin dashboard
stay unavailable until their server-only secrets meet the minimum lengths.
