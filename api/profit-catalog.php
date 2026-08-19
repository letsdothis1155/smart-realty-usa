<?php
/**
 * Public plan catalog. No secrets. Live charging disabled.
 */
require_once __DIR__ . '/profit-lib.php';
sru_send_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sru_json(['ok' => false, 'error' => 'Method not allowed'], 405);
}

$db = sru_profit_db();
$catalog = $db['catalog'] ?? sru_profit_default_catalog();
$catalog['liveCharging'] = false;

sru_json([
    'ok' => true,
    'liveCharging' => false,
    'ethics' => [
        'neverSellBankingData' => true,
        'depositsAreNotCompanyRevenue' => true,
        'liveChargingDefault' => false,
        'cancellationMustBeStraightforward' => true,
    ],
    'catalog' => $catalog,
]);
