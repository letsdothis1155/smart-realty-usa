<?php
/**
 * Demo-friendly forgot password:
 * Creates a one-time reset token. On a real host you would email the link.
 * For this demo we return resetPath so the UI can show it (or mail if configured).
 */
require_once dirname(__DIR__) . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$body = sru_body();
$email = sru_valid_email($body['email'] ?? '');
if (!$email) {
    sru_json(['ok' => false, 'error' => 'Please enter a valid email.'], 400);
}

// Always generic message to avoid email enumeration in production tone —
// but for demo we still issue token only if user exists.
$users = sru_read_users();
$found = null;
$idx = null;
foreach ($users as $i => $u) {
    if (($u['email'] ?? '') === $email) {
        $found = $u;
        $idx = $i;
        break;
    }
}

if ($found === null) {
    sru_json([
        'ok' => true,
        'message' => 'If that email is registered, a reset link is ready.',
        'demo' => true,
    ]);
}

$token = bin2hex(random_bytes(24));
$users[$idx]['resetToken'] = hash('sha256', $token);
$users[$idx]['resetExpires'] = time() + 3600; // 1 hour
sru_write_users($users);

// Demo: expose path (do not do this on a hardened production API without email)
$resetPath = '/account.html?reset=' . urlencode($token) . '&email=' . urlencode($email);

sru_json([
    'ok' => true,
    'message' => 'Reset ready for 1 hour. (Demo returns the link below — production would email it.)',
    'demo' => true,
    'resetPath' => $resetPath,
    'emailHint' => $email,
]);
