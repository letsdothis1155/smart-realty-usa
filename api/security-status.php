<?php
/**
 * Public-safe security flags for the site banner.
 * Never returns secret values.
 */
require_once __DIR__ . '/lib.php';
sru_send_cors();

$sec = sru_security_status();
$labels = [
    'jwt_secret_default' => 'JWT secret still default — create api/config.local.php',
    'demo_password_default' => 'Demo password still default (SmartRealty2026)',
    'admin_password_default' => 'Admin password still default',
    'data_dir_not_writable' => 'api/data is not writable — accounts/leads cannot save',
];
$messages = [];
foreach ($sec['issues'] as $code) {
    $messages[] = $labels[$code] ?? $code;
}

sru_json([
    'ok' => true,
    'insecure' => $sec['insecure'],
    'hasLocalConfig' => $sec['hasLocalConfig'],
    'issues' => $sec['issues'],
    'messages' => $messages,
    'docs' => 'SECRETS.md',
]);
