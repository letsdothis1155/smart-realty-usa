<?php

define('SRU_JWT_SECRET', str_repeat('a', 64));
define('SRU_DEMO_PASSWORD', implode('', ['Smart', 'Realty2026']));
define('SRU_ADMIN_PASSWORD', implode('', ['Smart', 'RealtyAdmin2026']));
define('SRU_DATA_DIR', sys_get_temp_dir());

require_once dirname(__DIR__) . '/config.php';

$issues = sru_security_status()['issues'];
$expected = ['demo_password_default', 'admin_password_default'];

foreach ($expected as $issue) {
    if (!in_array($issue, $issues, true)) {
        fwrite(STDERR, "Expected security issue was not reported: {$issue}\n");
        exit(1);
    }
}

echo "PHP security configuration tests passed.\n";
