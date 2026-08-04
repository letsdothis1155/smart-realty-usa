<?php
require_once dirname(__DIR__) . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$body = sru_body();
$email = sru_valid_email($body['email'] ?? '');
$password = (string)($body['password'] ?? '');

if (!$email || $password === '') {
    sru_json(['ok' => false, 'error' => 'Email and password required.'], 400);
}

$users = sru_read_users();
$found = null;
foreach ($users as $u) {
    if (($u['email'] ?? '') === $email) {
        $found = $u;
        break;
    }
}

if (!$found || empty($found['passwordHash']) || !password_verify($password, $found['passwordHash'])) {
    sru_json(['ok' => false, 'error' => 'Invalid email or password.'], 401);
}

$pub = sru_public_user($found);
$token = sru_jwt_sign([
    'sub' => $pub['id'],
    'email' => $pub['email'],
    'role' => $pub['role'],
    'kind' => 'user',
]);

$first = explode(' ', $pub['name'])[0];
sru_json([
    'ok' => true,
    'token' => $token,
    'user' => $pub,
    'message' => "Welcome back, {$first}.",
]);
