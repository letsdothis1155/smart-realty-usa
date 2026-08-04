<?php
require_once dirname(__DIR__) . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$token = sru_bearer_token();
if ($token === '') {
    sru_json(['ok' => false, 'error' => 'Not signed in'], 401);
}

$payload = sru_jwt_verify($token);
if (!$payload) {
    sru_json(['ok' => false, 'error' => 'Session expired. Please sign in again.'], 401);
}

if (($payload['kind'] ?? '') === 'demo' || ($payload['sub'] ?? '') === 'demo') {
    sru_json([
        'ok' => true,
        'user' => [
            'id' => 'demo',
            'name' => 'Demo Guest',
            'email' => 'demo@smartrealty.us',
            'role' => 'demo',
        ],
    ]);
}

$users = sru_read_users();
$found = null;
foreach ($users as $u) {
    if (($u['id'] ?? '') === ($payload['sub'] ?? '')) {
        $found = $u;
        break;
    }
}
if (!$found) {
    sru_json(['ok' => false, 'error' => 'Account not found.'], 401);
}

sru_json(['ok' => true, 'user' => sru_public_user($found)]);
