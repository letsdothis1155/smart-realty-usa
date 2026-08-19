<?php
/**
 * Referral tracking only — no cash rewards issued.
 * POST { action: create|click|signup|verified|qualified, code? }
 */
require_once __DIR__ . '/growth-lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$body = sru_body();
$action = substr(trim((string)($body['action'] ?? 'create')), 0, 20);
$code = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($body['code'] ?? '')));
if (strlen($code) > 12) $code = substr($code, 0, 12);

$data = sru_growth_read_json('referrals.json', 'referrals');
$rows = is_array($data['referrals'] ?? null) ? $data['referrals'] : [];

function sru_ref_find(&$rows, $code) {
    foreach ($rows as $i => $r) {
        if (($r['code'] ?? '') === $code) return $i;
    }
    return -1;
}

if ($action === 'create') {
    if ($code === '') {
        $alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $code = '';
        for ($i = 0; $i < 6; $i++) $code .= $alpha[random_int(0, strlen($alpha) - 1)];
    }
    $idx = sru_ref_find($rows, $code);
    if ($idx < 0) {
        $rows[] = [
            'code' => $code,
            'createdAt' => gmdate('c'),
            'clicks' => 0,
            'signups' => 0,
            'verified' => 0,
            'qualified' => 0,
            'rewardsIssued' => 0,
            'status' => 'tracking_only',
        ];
    }
    $data['referrals'] = $rows;
    sru_growth_write_json('referrals.json', $data);
    sru_json(['ok' => true, 'code' => $code, 'url' => (defined('SRU_SITE_URL') ? SRU_SITE_URL : 'https://smartrealty.us') . '/invite/' . $code, 'rewards' => 'disabled']);
}

$allowed = ['click' => 'clicks', 'signup' => 'signups', 'verified' => 'verified', 'qualified' => 'qualified'];
if (!isset($allowed[$action])) {
    sru_json(['ok' => false, 'error' => 'Unknown action'], 400);
}
if ($code === '') {
    sru_json(['ok' => false, 'error' => 'code required'], 400);
}
$idx = sru_ref_find($rows, $code);
if ($idx < 0) {
    $rows[] = [
        'code' => $code,
        'createdAt' => gmdate('c'),
        'clicks' => 0,
        'signups' => 0,
        'verified' => 0,
        'qualified' => 0,
        'rewardsIssued' => 0,
        'status' => 'tracking_only',
    ];
    $idx = count($rows) - 1;
}
$field = $allowed[$action];
$rows[$idx][$field] = (int)($rows[$idx][$field] ?? 0) + 1;
$rows[$idx]['updatedAt'] = gmdate('c');
$data['referrals'] = $rows;
sru_growth_write_json('referrals.json', $data);
sru_json(['ok' => true, 'code' => $code, 'action' => $action, 'rewards' => 'disabled']);
