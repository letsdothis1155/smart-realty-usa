# GoDaddy deploy (short)

For the **full custom domain walkthrough** (DNS, SSL, email, troubleshooting), use:

👉 **[CUSTOM-DOMAIN-WALKTHROUGH.md](./CUSTOM-DOMAIN-WALKTHROUGH.md)**

Also:

- Printable boxes → [GO-LIVE-CHECKLIST.md](./GO-LIVE-CHECKLIST.md)
- Client email → [SHARE-EMAIL.txt](./SHARE-EMAIL.txt)
- Brand URL config → [domain-config.js](./domain-config.js)

---

## Ultra-short path

1. GoDaddy: domain + **cPanel Web Hosting** (not Website Builder only)
2. DNS: **A** record `@` → hosting IP · **CNAME** `www` → your domain
3. Pack: `./scripts/pack-for-upload.sh` → upload zip → Extract in `public_html`
4. Edit `.htaccess` → real `AuthUserFile` path to `.htpasswd`
5. cPanel → **AutoSSL** → wait for padlock
6. Set `siteUrl` in `domain-config.js` to `https://yourdomain`
7. Unlock with the private in-app password; use separate cPanel Basic Auth credentials if enabled
8. `./scripts/verify-live.sh yourdomain.com`
9. Email kit: fill `SHARE-EMAIL.txt` and send

**Contact:** ai@smartrealty.us
