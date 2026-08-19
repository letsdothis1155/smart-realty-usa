<?php
/**
 * Admin campaign records — no customer banking data.
 * GET/POST with admin password.
 */
require_once __DIR__ . '/growth-lib.php';
sru_send_cors();

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}
sru_growth_require_admin();

$data = sru_growth_read_json('campaigns.json', 'campaigns');
$items = is_array($data['campaigns'] ?? null) ? $data['campaigns'] : [];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    sru_json(['ok' => true, 'campaigns' => $items, 'paidAds' => 'disabled']);
}

$body = sru_body();
if (!empty($body['deleteId'])) {
    $items = array_values(array_filter($items, function ($c) use ($body) {
        return ($c['id'] ?? '') !== $body['deleteId'];
    }));
    $data['campaigns'] = $items;
    sru_growth_write_json('campaigns.json', $data);
    sru_json(['ok' => true, 'campaigns' => $items]);
}

$id = substr(trim((string)($body['id'] ?? '')), 0, 40);
if ($id === '') $id = 'cmp_' . bin2hex(random_bytes(4));
$row = [
    'id' => $id,
    'campaign_name' => substr(trim((string)($body['campaign_name'] ?? '')), 0, 80),
    'source' => substr(trim((string)($body['source'] ?? '')), 0, 40),
    'medium' => substr(trim((string)($body['medium'] ?? '')), 0, 40),
    'landing_page' => substr(trim((string)($body['landing_page'] ?? '/direct-deposit/')), 0, 120),
    'start_date' => substr(trim((string)($body['start_date'] ?? '')), 0, 20),
    'end_date' => substr(trim((string)($body['end_date'] ?? '')), 0, 20),
    'status' => substr(trim((string)($body['status'] ?? 'planned')), 0, 20),
    'spend' => (float)($body['spend'] ?? 0),
    'visitors' => (int)($body['visitors'] ?? 0),
    'signups' => (int)($body['signups'] ?? 0),
    'activated_users' => (int)($body['activated_users'] ?? 0),
];
$found = false;
foreach ($items as $i => $c) {
    if (($c['id'] ?? '') === $id) {
        $items[$i] = $row;
        $found = true;
        break;
    }
}
if (!$found) $items[] = $row;
$data['campaigns'] = $items;
sru_growth_write_json('campaigns.json', $data);
sru_json(['ok' => true, 'campaign' => $row, 'campaigns' => $items]);
