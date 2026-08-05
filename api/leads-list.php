<?php
/**
 * Admin: list waitlist leads
 * GET or POST with header X-Admin-Password or JSON { password }
 */
require_once __DIR__ . '/lib.php';
sru_send_cors();

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$pass = '';
if (!empty($_SERVER['HTTP_X_ADMIN_PASSWORD'])) {
    $pass = (string)$_SERVER['HTTP_X_ADMIN_PASSWORD'];
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = sru_body();
    $pass = (string)($body['password'] ?? '');
} elseif (!empty($_GET['password'])) {
    $pass = (string)$_GET['password'];
}

$expected = defined('SRU_ADMIN_PASSWORD') ? SRU_ADMIN_PASSWORD : '';
if ($expected === '' || !hash_equals($expected, $pass)) {
    sru_json(['ok' => false, 'error' => 'Unauthorized'], 401);
}

sru_ensure_data();
$file = SRU_DATA_DIR . '/leads.json';
$leads = [];
if (file_exists($file)) {
    $raw = json_decode(file_get_contents($file), true);
    $leads = is_array($raw['leads'] ?? null) ? $raw['leads'] : [];
}

// newest first
usort($leads, function ($a, $b) {
    return strcmp($b['createdAt'] ?? '', $a['createdAt'] ?? '');
});

sru_json([
    'ok' => true,
    'count' => count($leads),
    'leads' => $leads,
]);
