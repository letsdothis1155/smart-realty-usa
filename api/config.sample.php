<?php
/**
 * COPY THIS FILE → config.local.php on the server (or fill config.php)
 * Never commit real production secrets.
 *
 * Generate secrets:
 *   openssl rand -hex 32
 */

// Login tokens (REQUIRED — long random string)
define('SRU_JWT_SECRET', 'paste-openssl-rand-hex-32-here');

// Shared demo unlock (change before wide share)
define('SRU_DEMO_PASSWORD', 'choose-a-unique-demo-password');

define('SRU_JWT_DAYS', 14);
define('SRU_CORS_ORIGIN', '');
define('SRU_DATA_DIR', __DIR__ . '/data');

define('SRU_NOTIFY_EMAIL', 'ai@smartrealty.us');
define('SRU_MAIL_FROM', 'noreply@smartrealty.us');
define('SRU_LEAD_AUTOREPLY', true);
define('SRU_SITE_URL', 'https://smartrealty.us');

// Admin leads dashboard
define('SRU_ADMIN_PASSWORD', 'choose-a-unique-admin-password');
