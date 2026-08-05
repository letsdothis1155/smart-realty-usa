<?php
/**
 * Smart Realty USA — Auth config (GoDaddy / cPanel)
 *
 * BEFORE GO-LIVE: change SRU_JWT_SECRET to a long random string.
 * Demo password should match domain-config.js auth.demoPassword.
 */

// Required: random secret for login tokens (change this!)
define('SRU_JWT_SECRET', 'CHANGE-ME-to-a-long-random-secret-before-public-use');

// Shared demo unlock password
define('SRU_DEMO_PASSWORD', 'SmartRealty2026');

// Token lifetime (days)
define('SRU_JWT_DAYS', 14);

// CORS: leave empty for same-origin only (recommended on GoDaddy)
// Or set e.g. 'https://smartrealty.us' if you split frontends later
define('SRU_CORS_ORIGIN', '');

// Data directory (users.json) — must be writable by PHP
define('SRU_DATA_DIR', __DIR__ . '/data');

// ---- Waitlist email notifications (GoDaddy / cPanel mail) ----
// Owner inbox for new lead alerts (empty = no notify mail)
define('SRU_NOTIFY_EMAIL', 'ai@smartrealty.us');
// From address (use a domain mailbox or noreply@yourdomain)
define('SRU_MAIL_FROM', 'noreply@smartrealty.us');
// Auto-reply to the person who joined the waitlist
define('SRU_LEAD_AUTOREPLY', true);
// Site URL used in emails
define('SRU_SITE_URL', 'https://smartrealty.us');
