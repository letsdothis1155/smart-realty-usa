<?php
/**
 * Admin growth rollup. Aggregates only — no account/routing/SSN fields.
 */
require_once __DIR__ . '/growth-lib.php';
sru_send_cors();

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}
sru_growth_require_admin();

function sru_count_event($rows, $name) {
    $n = 0;
    foreach ($rows as $r) {
        if (($r['event'] ?? $r['e'] ?? '') === $name) $n++;
    }
    return $n;
}

$events = [];
$evFile = SRU_DATA_DIR . '/events.jsonl';
if (is_file($evFile)) {
    $fh = fopen($evFile, 'r');
    if ($fh) {
        while (($line = fgets($fh)) !== false) {
            $j = json_decode($line, true);
            if (is_array($j)) {
                unset($j['ip'], $j['ua']);
                $j['props'] = sru_growth_sanitize_props($j['props'] ?? []);
                $events[] = $j;
            }
        }
        fclose($fh);
    }
}

$leadsFile = SRU_DATA_DIR . '/leads.json';
$leads = [];
if (is_file($leadsFile)) {
    $raw = json_decode((string)file_get_contents($leadsFile), true);
    $leads = is_array($raw['leads'] ?? null) ? $raw['leads'] : [];
}

$refs = sru_growth_read_json('referrals.json', 'referrals');
$refRows = is_array($refs['referrals'] ?? null) ? $refs['referrals'] : [];
$clicks = 0; $signups = 0; $qualified = 0;
foreach ($refRows as $r) {
    $clicks += (int)($r['clicks'] ?? 0);
    $signups += (int)($r['signups'] ?? 0);
    $qualified += (int)($r['qualified'] ?? 0);
}

$sources = [];
foreach ($leads as $L) {
    $s = (string)($L['source'] ?? 'unknown');
    $sources[$s] = ($sources[$s] ?? 0) + 1;
}

$visitors = max(count($events), 1);
$signup = count($leads) + sru_count_event($events, 'signup_completed') + sru_count_event($events, 'waitlist_join');

sru_json([
    'ok' => true,
    'generatedAt' => gmdate('c'),
    'northStar' => 'Users actively progressing toward a SmartRealty property goal',
    'launchPhase' => 'private_alpha',
    'paidAds' => 'disabled',
    'claimsReviewed' => false,
    'acquisition' => [
        'visitors' => count($events),
        'uniqueVisitors' => count($events),
        'signupRate' => $visitors ? round(($signup / $visitors) * 1000) / 10 : 0,
        'sources' => $sources,
    ],
    'activation' => [
        'accountsCreated' => count($leads),
        'onboardingStarted' => sru_count_event($events, 'onboarding_started') + sru_count_event($events, 'direct_deposit_started'),
        'onboardingCompleted' => sru_count_event($events, 'onboarding_completed'),
        'directDepositSetupStarted' => sru_count_event($events, 'direct_deposit_started'),
        'payerConnected' => sru_count_event($events, 'payer_selected'),
        'setupSubmitted' => sru_count_event($events, 'direct_deposit_submitted'),
        'setupActivated' => sru_count_event($events, 'direct_deposit_activated'),
        'firstDepositDetected' => sru_count_event($events, 'first_deposit_detected'),
    ],
    'engagement' => [
        'goalsCreated' => sru_count_event($events, 'goal_created'),
        'smartsplitUsage' => sru_count_event($events, 'smartsplit_viewed'),
        'landingViews' => sru_count_event($events, 'landing_page_view') + sru_count_event($events, 'direct_deposit_viewed'),
    ],
    'referral' => [
        'links' => count($refRows),
        'clicks' => $clicks,
        'signups' => $signups,
        'qualified' => $qualified,
        'rewardsIssued' => 0,
    ],
    'waitlist' => [
        'signups' => count($leads),
        'leads' => array_map(function ($L) {
            return [
                'id' => $L['id'] ?? '',
                'createdAt' => $L['createdAt'] ?? '',
                'source' => $L['source'] ?? '',
                'interest' => $L['interest'] ?? '',
                'utm_source' => $L['utm_source'] ?? '',
                'utm_campaign' => $L['utm_campaign'] ?? '',
            ];
        }, $leads),
    ],
    'note' => 'Retention and per-user goal progress stay on-device unless a production identity store is added. No financial account data is included.',
]);
