<?php
/**
 * Smart Realty USA — Auth / leads config (GoDaddy / cPanel)
 *
 * Load order:
 *   1) config.local.php  (preferred on server — gitignored)
 *   2) fail-closed defaults below (auth stays disabled until configured)
 *
 * BEFORE PUBLIC SHARE:
 *   cp config.sample.php config.local.php
 *   edit secrets with: openssl rand -hex 32
 */

// Optional override file (recommended on production)
$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    require_once $local;
}

// ---- Defaults only if not set in config.local.php ----
if (!defined('SRU_JWT_SECRET')) {
    define('SRU_JWT_SECRET', '');
}
if (!defined('SRU_DEMO_PASSWORD')) {
    define('SRU_DEMO_PASSWORD', '');
}
if (!defined('SRU_JWT_DAYS')) {
    define('SRU_JWT_DAYS', 14);
}
if (!defined('SRU_CORS_ORIGIN')) {
    define('SRU_CORS_ORIGIN', '');
}
if (!defined('SRU_DATA_DIR')) {
    define('SRU_DATA_DIR', __DIR__ . '/data');
}
if (!defined('SRU_NOTIFY_EMAIL')) {
    define('SRU_NOTIFY_EMAIL', 'ai@smartrealty.us');
}
if (!defined('SRU_MAIL_FROM')) {
    define('SRU_MAIL_FROM', 'noreply@smartrealty.us');
}
if (!defined('SRU_LEAD_AUTOREPLY')) {
    define('SRU_LEAD_AUTOREPLY', true);
}
if (!defined('SRU_SITE_URL')) {
    define('SRU_SITE_URL', 'https://smartrealty.us');
}
if (!defined('SRU_ADMIN_PASSWORD')) {
    define('SRU_ADMIN_PASSWORD', '');
}

/**
 * Known insecure defaults (do not echo secret values to clients).
 * @return array{insecure:bool,issues:string[]}
 */
function sru_security_status() {
    $issues = [];
    if (strlen(SRU_JWT_SECRET) < 32
        || stripos(SRU_JWT_SECRET, 'CHANGE-ME') !== false
        || stripos(SRU_JWT_SECRET, 'paste-openssl') !== false) {
        $issues[] = 'jwt_secret_default';
    }
    if (strlen(SRU_DEMO_PASSWORD) < 12) {
        $issues[] = 'demo_password_default';
    }
    if (strlen(SRU_ADMIN_PASSWORD) < 16) {
        $issues[] = 'admin_password_default';
    }
    if (!is_dir(SRU_DATA_DIR) || !is_writable(SRU_DATA_DIR)) {
        $issues[] = 'data_dir_not_writable';
    }
    return [
        'insecure' => count($issues) > 0,
        'issues' => $issues,
        'hasLocalConfig' => is_file(__DIR__ . '/config.local.php'),
    ];
}
