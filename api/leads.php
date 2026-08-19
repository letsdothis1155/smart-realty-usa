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
$name = trim((string)($body['name'] ?? $body['firstName'] ?? ''));
$source = substr(trim((string)($body['source'] ?? 'website')), 0, 80);
$interest = substr(trim((string)($body['interest'] ?? 'updates')), 0, 120);
$referralCode = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($body['referralCode'] ?? '')));
$partner = substr(preg_replace('/[^a-z0-9_-]/i', '', (string)($body['partner'] ?? '')), 0, 64);
$utmSource = substr(trim((string)($body['utm_source'] ?? '')), 0, 80);
$utmMedium = substr(trim((string)($body['utm_medium'] ?? '')), 0, 80);
$utmCampaign = substr(trim((string)($body['utm_campaign'] ?? '')), 0, 80);
$phone = substr(preg_replace('/[^0-9+(). \-]/', '', (string)($body['phone'] ?? '')), 0, 32);
$city = substr(trim((string)($body['city'] ?? '')), 0, 80);
$region = substr(trim((string)($body['state'] ?? $body['region'] ?? '')), 0, 40);
$intent = substr(trim((string)($body['intent'] ?? $interest)), 0, 40);
$budget = substr(trim((string)($body['budget'] ?? '')), 0, 40);
$property = substr(trim((string)($body['property'] ?? '')), 0, 160);
$notes = substr(trim((string)($body['notes'] ?? $body['message'] ?? '')), 0, 500);
$consent = !empty($body['consent']);

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

$existingIdx = -1;
foreach ($leads as $i => $L) {
    if (($L['email'] ?? '') === $email) {
        $existingIdx = $i;
        break;
    }
}

$now = gmdate('c');
if ($existingIdx >= 0) {
    $prev = $leads[$existingIdx];
    $leads[$existingIdx] = array_merge($prev, [
        'name' => $name !== '' ? substr($name, 0, 80) : ($prev['name'] ?? ''),
        'source' => $source,
        'interest' => $intent !== '' ? $intent : $interest,
        'intent' => $intent,
        'phone' => $phone !== '' ? $phone : ($prev['phone'] ?? ''),
        'city' => $city !== '' ? $city : ($prev['city'] ?? ''),
        'state' => $region !== '' ? $region : ($prev['state'] ?? ''),
        'budget' => $budget !== '' ? $budget : ($prev['budget'] ?? ''),
        'property' => $property !== '' ? $property : ($prev['property'] ?? ''),
        'notes' => $notes !== '' ? trim(($prev['notes'] ?? '') . "\n" . $notes) : ($prev['notes'] ?? ''),
        'consent' => $consent || !empty($prev['consent']),
        'consentAt' => (!empty($prev['consentAt']) ? $prev['consentAt'] : ($consent ? $now : '')),
        'referralCode' => substr($referralCode, 0, 12) ?: ($prev['referralCode'] ?? ''),
        'partner' => $partner !== '' ? $partner : ($prev['partner'] ?? ''),
        'utm_source' => $utmSource !== '' ? $utmSource : ($prev['utm_source'] ?? ''),
        'utm_medium' => $utmMedium !== '' ? $utmMedium : ($prev['utm_medium'] ?? ''),
        'utm_campaign' => $utmCampaign !== '' ? $utmCampaign : ($prev['utm_campaign'] ?? ''),
        'updatedAt' => $now,
        'status' => $prev['status'] ?? 'new',
    ]);
    $lead = $leads[$existingIdx];
} else {
    $lead = [
        'id' => 'lead_' . bin2hex(random_bytes(6)),
        'email' => $email,
        'name' => substr($name, 0, 80),
        'phone' => $phone,
        'city' => $city,
        'state' => $region,
        'source' => $source,
        'interest' => $intent !== '' ? $intent : $interest,
        'intent' => $intent,
        'budget' => $budget,
        'property' => $property,
        'notes' => $notes,
        'consent' => $consent,
        'consentAt' => $consent ? $now : '',
        'status' => 'new',
        'assigned' => '',
        'followUpDate' => '',
        'referralCode' => substr($referralCode, 0, 12),
        'partner' => $partner,
        'utm_source' => $utmSource,
        'utm_medium' => $utmMedium,
        'utm_campaign' => $utmCampaign,
        'createdAt' => $now,
    ];
    $leads[] = $lead;
}

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

$duplicate = $existingIdx >= 0;
sru_json([
    'ok' => true,
    'message' => $duplicate
        ? 'We updated your request. We will be in touch.'
        : 'You are on the Smart Realty list. Watch your inbox.',
    'lead' => ['email' => $email, 'id' => $lead['id']],
    'duplicate' => $duplicate,
    'email' => $mailed,
], $duplicate ? 200 : 201);
