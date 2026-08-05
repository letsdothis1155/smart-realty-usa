<?php
require_once dirname(__DIR__) . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$token = sru_bearer_token();
$payload = $token ? sru_jwt_verify($token) : null;
if (!$payload || ($payload['kind'] ?? '') === 'demo') {
    sru_json(['ok' => false, 'error' => 'Sign in with a real account to change password.'], 401);
}

$body = sru_body();
$current = (string)($body['currentPassword'] ?? '');
$next = (string)($body['newPassword'] ?? '');
if (strlen($next) < 8 || strlen($next) > 128) {
    sru_json(['ok' => false, 'error' => 'New password must be at least 8 characters.'], 400);
}

$users = sru_read_users();
$idx = null;
foreach ($users as $i => $u) {
    if (($u['id'] ?? '') === ($payload['sub'] ?? '')) {
        $idx = $i;
        break;
    }
}
if ($idx === null) {
    sru_json(['ok' => false, 'error' => 'Account not found.'], 401);
}
if (empty($users[$idx]['passwordHash']) || !password_verify($current, $users[$idx]['passwordHash'])) {
    sru_json(['ok' => false, 'error' => 'Current password is incorrect.'], 401);
}

$users[$idx]['passwordHash'] = password_hash($next, PASSWORD_BCRYPT, ['cost' => 12]);
$users[$idx]['passwordChangedAt'] = gmdate('c');
if (!sru_write_users($users)) {
    sru_json(['ok' => false, 'error' => 'Could not save password.'], 500);
}

sru_json(['ok' => true, 'message' => 'Password updated.']);
