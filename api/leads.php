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

// ---- Email notifications (best-effort; never fail the signup if mail fails) ----
$mailed = ['notify' => false, 'autoreply' => false];
$site = defined('SRU_SITE_URL') ? SRU_SITE_URL : 'https://smartrealty.us';
$from = defined('SRU_MAIL_FROM') ? SRU_MAIL_FROM : 'noreply@smartrealty.us';
$headersBase = "From: Smart Realty USA <{$from}>\r\n"
    . "Reply-To: " . (defined('SRU_NOTIFY_EMAIL') && SRU_NOTIFY_EMAIL ? SRU_NOTIFY_EMAIL : $from) . "\r\n"
    . "MIME-Version: 1.0\r\n"
    . "Content-Type: text/plain; charset=UTF-8\r\n"
    . "X-Mailer: SmartRealty-Leads\r\n";

if (defined('SRU_NOTIFY_EMAIL') && SRU_NOTIFY_EMAIL !== '' && function_exists('mail')) {
    $subj = '[Smart Realty] New waitlist lead';
    $bodyMail = "New waitlist signup\n"
        . "====================\n"
        . "Name: " . ($name !== '' ? $name : '(none)') . "\n"
        . "Email: {$email}\n"
        . "Source: {$source}\n"
        . "Interest: {$interest}\n"
        . "Time (UTC): " . $lead['createdAt'] . "\n"
        . "Lead ID: " . $lead['id'] . "\n"
        . "Site: {$site}\n";
    $mailed['notify'] = @mail(SRU_NOTIFY_EMAIL, $subj, $bodyMail, $headersBase);
}

if (defined('SRU_LEAD_AUTOREPLY') && SRU_LEAD_AUTOREPLY && function_exists('mail')) {
    $subj2 = 'You are on the Smart Realty USA list';
    $hello = $name !== '' ? $name : 'there';
    $body2 = "Hi {$hello},\n\n"
        . "Thanks for joining the Smart Realty USA waitlist.\n"
        . "We will share Blue Book drops, market updates, and private demo invites.\n\n"
        . "Explore the demo: {$site}\n"
        . "Questions? Reply to this email or write ai@smartrealty.us\n\n"
        . "— Smart Realty USA\n"
        . "(Demo platform — not a licensed brokerage transaction system.)\n";
    $mailed['autoreply'] = @mail($email, $subj2, $body2, $headersBase);
}

sru_json([
    'ok' => true,
    'message' => 'You are on the Smart Realty list. Watch your inbox.',
    'lead' => ['email' => $email, 'id' => $lead['id']],
    'email' => $mailed,
], 201);
