<?php
require_once dirname(__DIR__) . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$body = sru_body();
$email = sru_valid_email($body['email'] ?? '');
$token = (string)($body['token'] ?? '');
$password = (string)($body['password'] ?? '');

if (!$email || $token === '') {
    sru_json(['ok' => false, 'error' => 'Reset link is invalid.'], 400);
}
if (strlen($password) < 8 || strlen($password) > 128) {
    sru_json(['ok' => false, 'error' => 'Password must be at least 8 characters.'], 400);
}

$users = sru_read_users();
$idx = null;
foreach ($users as $i => $u) {
    if (($u['email'] ?? '') === $email) {
        $idx = $i;
        break;
    }
}
if ($idx === null) {
    sru_json(['ok' => false, 'error' => 'Reset link is invalid or expired.'], 400);
}

$u = $users[$idx];
$hash = $u['resetToken'] ?? '';
$exp = (int)($u['resetExpires'] ?? 0);
if (!$hash || $exp < time() || !hash_equals($hash, hash('sha256', $token))) {
    sru_json(['ok' => false, 'error' => 'Reset link is invalid or expired.'], 400);
}

$users[$idx]['passwordHash'] = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
unset($users[$idx]['resetToken'], $users[$idx]['resetExpires']);
$users[$idx]['passwordChangedAt'] = gmdate('c');
sru_write_users($users);

$pub = sru_public_user($users[$idx]);
$jwt = sru_jwt_sign([
    'sub' => $pub['id'],
    'email' => $pub['email'],
    'role' => $pub['role'],
    'kind' => 'user',
]);

sru_json([
    'ok' => true,
    'message' => 'Password reset. You are signed in.',
    'token' => $jwt,
    'user' => $pub,
]);
