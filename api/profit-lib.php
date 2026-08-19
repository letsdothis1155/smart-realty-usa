<?php
/**
 * SmartRealty profit helpers.
 * Live charging is disabled. Never persist cards, bank numbers, or payroll secrets.
 * A user paycheck is not company revenue.
 */
require_once __DIR__ . '/growth-lib.php';

function sru_profit_default_catalog() {
    return [
        'liveCharging' => false,
        'productionComplianceReview' => 'required',
        'currency' => 'usd',
        'trialDays' => 0,
        'trialCopy' => 'No trial is running. You will not be charged.',
        'positioning' => [
            'plus' => 'Turn every paycheck into a smarter property plan.',
            'freeValue' => 'Free must stay useful. Direct deposit and one property goal stay free.',
        ],
        'phases' => ['current' => 1],
        'plans' => [
            'free' => [
                'id' => 'free', 'name' => 'SmartRealty Free', 'audience' => 'consumer',
                'tagline' => 'Organize a paycheck around a real property goal.',
                'priceMonthlyCents' => 0, 'priceAnnualCents' => 0, 'live' => true, 'comingSoon' => false,
                'limits' => ['propertyGoals' => 1, 'smartsplitRules' => 2],
                'features' => ['account','basic_dashboard','direct_deposit_setup','limited_property_goals','basic_income_organization','basic_property_search','standard_education','limited_smartsplit','basic_notifications','legally_required_financial_info'],
            ],
            'plus' => [
                'id' => 'plus', 'name' => 'SmartRealty Plus', 'audience' => 'consumer',
                'tagline' => 'Turn every paycheck into a smarter property plan.',
                'priceMonthlyCents' => 999, 'priceAnnualCents' => 9990, 'annualSavingsPercent' => 16.7,
                'live' => false, 'comingSoon' => true,
                'features' => ['unlimited_property_goals','advanced_smartsplit','ai_property_analysis','home_buying_prep'],
            ],
            'pro' => [
                'id' => 'pro', 'name' => 'SmartRealty Pro', 'audience' => 'professional',
                'tagline' => 'Portfolio, pipeline, and property operations in one place.',
                'priceMonthlyCents' => 2999, 'priceAnnualCents' => 29990, 'annualSavingsPercent' => 16.7,
                'live' => false, 'comingSoon' => true,
                'features' => ['portfolio_dashboard','crm','portfolio_analytics','ai_property_analysis'],
            ],
            'business' => [
                'id' => 'business', 'name' => 'SmartRealty Business', 'audience' => 'business',
                'priceMonthlyCents' => 7900, 'priceAnnualCents' => 79000, 'live' => false, 'comingSoon' => true,
            ],
            'enterprise' => [
                'id' => 'enterprise', 'name' => 'SmartRealty Enterprise', 'audience' => 'enterprise',
                'priceMonthlyCents' => null, 'contractBilling' => true, 'live' => false, 'comingSoon' => true,
            ],
            'agent_starter' => [
                'id' => 'agent_starter', 'name' => 'Agent Starter', 'audience' => 'agent',
                'priceMonthlyCents' => 4900, 'live' => false, 'comingSoon' => true,
            ],
            'agent_pro' => [
                'id' => 'agent_pro', 'name' => 'Agent Pro', 'audience' => 'agent',
                'priceMonthlyCents' => 9900, 'live' => false, 'comingSoon' => true,
            ],
            'brokerage' => [
                'id' => 'brokerage', 'name' => 'Brokerage', 'audience' => 'agent',
                'priceMonthlyCents' => 29900, 'live' => false, 'comingSoon' => true,
            ],
        ],
        'notice' => 'Default prices are catalog values. Live charging is disabled. Revenue $0.',
    ];
}

function sru_profit_db() {
    $raw = sru_growth_read_json('profit.json', 'revenueEvents');
    if (!isset($raw['revenueEvents'])) $raw['revenueEvents'] = [];
    if (!isset($raw['costEvents'])) $raw['costEvents'] = [];
    if (!isset($raw['subscriptions'])) $raw['subscriptions'] = [];
    if (!isset($raw['catalog'])) $raw['catalog'] = sru_profit_default_catalog();
    return $raw;
}

function sru_profit_sum($rows, $field, $sandboxOnly = null) {
    $n = 0;
    foreach ($rows as $r) {
        $sandbox = !empty($r['sandbox']);
        if ($sandboxOnly === false && $sandbox) continue;
        if ($sandboxOnly === true && !$sandbox) continue;
        $n += (int)($r[$field] ?? 0);
    }
    return $n;
}
