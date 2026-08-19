<?php
/**
 * Admin: update lead status / notes / assignment. No banking fields.
 * POST { password, id, status?, assigned?, notes?, followUpDate? }
 */
require_once __DIR__ . '/growth-lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}
sru_growth_require_admin();

$body = sru_body();
$id = substr(trim((string)($body['id'] ?? '')), 0, 40);
if ($id === '') {
    sru_json(['ok' => false, 'error' => 'id required'], 400);
}

$allowedStatus = ['new', 'contacted', 'qualified', 'follow_up', 'closed', 'spam'];
sru_ensure_data();
$file = SRU_DATA_DIR . '/leads.json';
$raw = is_file($file) ? json_decode((string)file_get_contents($file), true) : [];
$leads = is_array($raw['leads'] ?? null) ? $raw['leads'] : [];
$found = false;
foreach ($leads as $i => $L) {
    if (($L['id'] ?? '') !== $id) continue;
    if (isset($body['status'])) {
        $st = substr(trim((string)$body['status']), 0, 20);
        if (!in_array($st, $allowedStatus, true)) {
            sru_json(['ok' => false, 'error' => 'Invalid status'], 400);
        }
        $L['status'] = $st;
    }
    if (array_key_exists('assigned', $body)) {
        $L['assigned'] = substr(trim((string)$body['assigned']), 0, 80);
    }
    if (array_key_exists('notes', $body)) {
        $L['notes'] = substr(trim((string)$body['notes']), 0, 800);
    }
    if (array_key_exists('followUpDate', $body)) {
        $L['followUpDate'] = substr(trim((string)$body['followUpDate']), 0, 20);
    }
    $L['updatedAt'] = gmdate('c');
    $leads[$i] = $L;
    $found = $L;
    break;
}
if (!$found) {
    sru_json(['ok' => false, 'error' => 'Lead not found'], 404);
}
$tmp = $file . '.tmp';
file_put_contents($tmp, json_encode(['leads' => $leads, 'updatedAt' => gmdate('c')], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
rename($tmp, $file);
sru_json(['ok' => true, 'lead' => $found]);
