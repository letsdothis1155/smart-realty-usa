# Go-Live Checklist — Smart Realty USA

Print or keep open while deploying. Check every box before sending client links.

**Domain:** _______________________________  
**Hosting IP:** ____________________________  
**Plan:** ☐ A main site  ☐ B /demo  ☐ C subdomain  
**Date:** _______________

---

## Pre-flight (local)

- [ ] Demo opens locally (`open index.html` or `python3 -m http.server`)
- [ ] Password unlock works with the private server-configured value
- [ ] Listings render (18 homes)
- [ ] BTC ticker gets a live rate
- [ ] Search + map work
- [ ] `./scripts/pack-for-upload.sh` created zip on Desktop

## Domain & DNS

- [ ] Domain active in GoDaddy (not expired)
- [ ] Web Hosting (cPanel) active and domain assigned
- [ ] A record `@` → hosting IP **or** subdomain A/CNAME set
- [ ] `www` CNAME set (if using www)
- [ ] `dig +short YOURDOMAIN A` returns hosting IP

## Upload

- [ ] Show Hidden Files enabled in File Manager
- [ ] Correct folder (`public_html` / `demo` / subdomain dir)
- [ ] `index.html`, `styles.css`, `app.js`, `domain-config.js` uploaded
- [ ] `images/` folder complete
- [ ] `.htaccess` uploaded; `.htpasswd` created directly on the server if Basic Auth is used
- [ ] `robots.txt` uploaded
- [ ] `.htaccess` `AuthUserFile` path matches real server path

## SSL & access

- [ ] AutoSSL / certificate **Active**
- [ ] `https://` loads with padlock
- [ ] HTTP redirects to HTTPS (if enabled)
- [ ] Server auth works (user `demo` or Directory Privacy user)
- [ ] In-app gate unlocks
- [ ] No 500 error

## Config

- [ ] `domain-config.js` → `siteUrl` = final HTTPS URL
- [ ] `contactEmail` correct
- [ ] `presenterMode` true while setting up; **false** before wide share
- [ ] Passwords changed if this is more than a private friend demo

## Email

- [ ] `ai@YOURDOMAIN` forwards or mailbox works
- [ ] Sent yourself a test message
- [ ] Mailto links open compose window

## Product smoke test (on live URL)

- [ ] Hero + images load
- [ ] BTC live price shows
- [ ] Search “Vegas” / “Austin”
- [ ] Grid / List / Map views
- [ ] Property modal + Buy with BTC
- [ ] Blue Book form
- [ ] Rental booking modal
- [ ] Live chat opens
- [ ] Mobile Safari layout OK

## Share

- [ ] `SHARE-EMAIL.txt` filled with real URL
- [ ] Credentials sent privately (not public social posts)
- [ ] Ran `./scripts/verify-live.sh YOURDOMAIN`

## Done

- [ ] Bookmarked live HTTPS URL
- [ ] Documented passwords in a password manager
- [ ] Turned off `presenterMode` if clients will browse unsupervised

---

**Live URL:** https://_______________________________  
**Server user:** _____________  
**In-app password:** _____________  
**Contact:** ai@_______________________________
