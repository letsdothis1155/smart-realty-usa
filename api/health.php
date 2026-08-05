<?php
require_once __DIR__ . '/lib.php';
sru_send_cors();

$writable = is_dir(SRU_DATA_DIR) ? is_writable(SRU_DATA_DIR) : @mkdir(SRU_DATA_DIR, 0755, true);
$sec = function_exists('sru_security_status') ? sru_security_status() : ['insecure' => true, 'issues' => ['unknown']];

sru_json([
    'ok' => true,
    'service' => 'smart-realty-auth-php',
    'host' => 'godaddy-cpanel',
    'dataWritable' => (bool)$writable,
    'security' => [
        'insecure' => !empty($sec['insecure']),
        'issues' => $sec['issues'] ?? [],
        'hasLocalConfig' => !empty($sec['hasLocalConfig']),
    ],
    'time' => gmdate('c'),
]);
