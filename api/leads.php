<?php
/**
 * Growth: waitlist / lead capture
 * POST { email, name?, source?, interest? }
 */
require_once __DIR__ . '/lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$body = sru_body();
$email = sru_valid_email($body['email'] ?? '');
$name = trim((string)($body['name'] ?? ''));
$source = substr(trim((string)($body['source'] ?? 'website')), 0, 80);
$interest = substr(trim((string)($body['interest'] ?? 'updates')), 0, 120);

if (!$email) {
    sru_json(['ok' => false, 'error' => 'Please enter a valid email.'], 400);
}

sru_ensure_data();
$file = SRU_DATA_DIR . '/leads.json';
$leads = [];
if (file_exists($file)) {
    $raw = json_decode(file_get_contents($file), true);
    $leads = is_array($raw['leads'] ?? null) ? $raw['leads'] : [];
}

foreach ($leads as $L) {
    if (($L['email'] ?? '') === $email) {
        sru_json([
            'ok' => true,
            'message' => 'You are already on the list. We will be in touch.',
            'duplicate' => true,
        ]);
    }
}

$lead = [
    'id' => 'lead_' . bin2hex(random_bytes(6)),
    'email' => $email,
    'name' => substr($name, 0, 80),
    'source' => $source,
    'interest' => $interest,
    'createdAt' => gmdate('c'),
];
$leads[] = $lead;

$tmp = $file . '.tmp';
file_put_contents($tmp, json_encode(['leads' => $leads, 'updatedAt' => gmdate('c')], JSON_PRETTY_PRINT));
rename($tmp, $file);

sru_json([
    'ok' => true,
    'message' => 'You are on the Smart Realty list. Watch your inbox.',
    'lead' => ['email' => $email, 'id' => $lead['id']],
], 201);
