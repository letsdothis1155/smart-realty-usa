<?php
/**
 * Lightweight event beacon (product analytics)
 * POST { event, props?, t? }
 * Stored in api/data/events.jsonl (append-only, capped)
 */
require_once __DIR__ . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$body = sru_body();
$event = substr(trim((string)($body['event'] ?? '')), 0, 64);
if ($event === '') {
    sru_json(['ok' => false, 'error' => 'event required'], 400);
}

$props = $body['props'] ?? [];
if (!is_array($props)) $props = [];
// strip oversized props
$clean = [];
foreach ($props as $k => $v) {
    $key = substr((string)$k, 0, 40);
    if (is_scalar($v) || $v === null) {
        $clean[$key] = is_string($v) ? substr($v, 0, 200) : $v;
    }
}

sru_ensure_data();
$file = SRU_DATA_DIR . '/events.jsonl';
$row = json_encode([
    'event' => $event,
    'props' => $clean,
    't' => $body['t'] ?? gmdate('c'),
    'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
    'ua' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 160),
], JSON_UNESCAPED_SLASHES);

// append; rotate if huge (> 2MB)
if (file_exists($file) && filesize($file) > 2 * 1024 * 1024) {
    @rename($file, $file . '.' . date('YmdHis') . '.bak');
}
file_put_contents($file, $row . "\n", FILE_APPEND | LOCK_EX);

// 204 No Content (no JSON body)
http_response_code(204);
exit;
