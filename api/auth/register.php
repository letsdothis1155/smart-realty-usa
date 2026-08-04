<?php
require_once dirname(__DIR__) . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$body = sru_body();
$name = trim((string)($body['name'] ?? ''));
$email = sru_valid_email($body['email'] ?? '');
$password = (string)($body['password'] ?? '');

if (strlen($name) < 2) {
    sru_json(['ok' => false, 'error' => 'Please enter your name.'], 400);
}
if (!$email) {
    sru_json(['ok' => false, 'error' => 'Please enter a valid email.'], 400);
}
if (strlen($password) < 8 || strlen($password) > 128) {
    sru_json(['ok' => false, 'error' => 'Password must be at least 8 characters.'], 400);
}

$users = sru_read_users();
foreach ($users as $u) {
    if (($u['email'] ?? '') === $email) {
        sru_json(['ok' => false, 'error' => 'That email is already registered. Sign in instead.'], 409);
    }
}

$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
$user = [
    'id' => 'u_' . bin2hex(random_bytes(6)),
    'name' => substr($name, 0, 80),
    'email' => $email,
    'passwordHash' => $hash,
    'role' => 'member',
    'createdAt' => gmdate('c'),
];
$users[] = $user;

if (!sru_write_users($users)) {
    sru_json(['ok' => false, 'error' => 'Could not save account. Check api/data is writable on the server.'], 500);
}

$pub = sru_public_user($user);
$token = sru_jwt_sign([
    'sub' => $pub['id'],
    'email' => $pub['email'],
    'role' => $pub['role'],
    'kind' => 'user',
]);

sru_json([
    'ok' => true,
    'token' => $token,
    'user' => $pub,
    'message' => 'Account created. Welcome to Smart Realty USA.',
], 201);
