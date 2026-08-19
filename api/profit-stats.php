<?php
/**
 * Admin profit rollup. Production totals ignore sandbox rows.
 * Does not invent revenue. User deposits are not included.
 */
require_once __DIR__ . '/profit-lib.php';
sru_send_cors();

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}
sru_growth_require_admin();

$db = sru_profit_db();
$revenue = is_array($db['revenueEvents'] ?? null) ? $db['revenueEvents'] : [];
$costs = is_array($db['costEvents'] ?? null) ? $db['costEvents'] : [];
$subs = is_array($db['subscriptions'] ?? null) ? $db['subscriptions'] : [];

$net = sru_profit_sum($revenue, 'net_amount', false);
$gross = sru_profit_sum($revenue, 'gross_amount', false);
$costTotal = sru_profit_sum($costs, 'amount', false);
$paying = 0;
foreach ($subs as $s) {
    if (!empty($s['sandbox'])) continue;
    if (($s['status'] ?? '') === 'active' || ($s['status'] ?? '') === 'trialing') $paying++;
}

sru_json([
    'ok' => true,
    'generatedAt' => gmdate('c'),
    'liveCharging' => false,
    'liveMoneyMovement' => 'disabled',
    'invented' => false,
    'founder' => [
        'title' => 'SMARTREALTY TODAY',
        'users' => 0,
        'activeUsers' => 0,
        'payingUsers' => $paying,
        'mrrCents' => 0,
        'revenueThisMonthCents' => $net,
        'costsThisMonthCents' => $costTotal,
        'netOperatingResultCents' => $net - $costTotal,
        'newDirectDepositSetups' => 0,
        'propertyGoalsCreated' => 0,
        'plusConversions' => 0,
        'businessCustomers' => 0,
        'areWeMovingTowardProfitability' => ($net === 0 && $costTotal === 0) ? 'not_yet_zero_activity' : (($net - $costTotal) > 0 ? 'yes' : 'no'),
        'liveMoneyMovement' => 'disabled',
        'liveCharging' => false,
        'invented' => false,
        'notice' => 'PHP rollup of api/data/profit.json. Sandbox rows excluded. $0 stays $0.',
    ],
    'economics' => [
        'revenue' => ['grossRevenue' => $gross, 'netRevenue' => $net, 'byType' => new stdClass()],
        'costs' => ['total' => $costTotal, 'costOfRevenue' => 0, 'operatingExpenses' => $costTotal, 'byCategory' => new stdClass()],
        'results' => ['grossProfit' => $net, 'operatingProfit' => $net - $costTotal, 'contribution' => $net],
        'unit' => [
            'ARPU' => null, 'ARPPU' => null, 'MRR' => 0, 'ARR' => 0, 'CAC' => null, 'LTV' => null,
            'GrossMargin' => null, 'ContributionMargin' => null, 'Churn' => null, 'ConversionRate' => null,
            'PaybackPeriodMonths' => null, 'LTV:CAC' => null,
        ],
        'users' => ['payingUsers' => $paying, 'freeUsers' => 0, 'customers' => 0],
        'definitions' => [
            'ContributionMargin' => 'Revenue - Variable Costs',
            'MRR' => 'Monthly recurring revenue from active production subscriptions.',
        ],
        'notice' => 'Null means not computable. Values are not invented.',
        'alerts' => [
            ['code' => 'no_live_revenue', 'severity' => 'info', 'message' => 'No production revenue recorded. Live charging is disabled.'],
        ],
        'series' => [],
        'byProduct' => new stdClass(),
    ],
    'profitability' => [
        'results' => [
            'revenue' => $net,
            'costOfRevenue' => 0,
            'grossProfit' => $net,
            'operatingExpenses' => $costTotal,
            'operatingProfit' => $net - $costTotal,
        ],
        'liveCharging' => false,
    ],
]);
