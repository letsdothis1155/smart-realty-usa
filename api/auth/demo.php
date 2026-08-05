<?php
require_once dirname(__DIR__) . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}
sru_require_secure_config(['jwt', 'demo']);

$body = sru_body();
$password = (string)($body['password'] ?? '');

if (!hash_equals(SRU_DEMO_PASSWORD, $password)) {
    sru_json(['ok' => false, 'error' => 'Incorrect demo password.'], 401);
}

$user = [
    'id' => 'demo',
    'name' => 'Demo Guest',
    'email' => 'demo@smartrealty.us',
    'role' => 'demo',
    'createdAt' => gmdate('c'),
];

$token = sru_jwt_sign([
    'sub' => 'demo',
    'email' => $user['email'],
    'role' => 'demo',
    'kind' => 'demo',
]);

sru_json([
    'ok' => true,
    'token' => $token,
    'user' => $user,
    'message' => 'Demo unlocked.',
]);
