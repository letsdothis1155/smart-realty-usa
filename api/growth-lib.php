<?php
/**
 * Shared helpers for SmartRealty growth APIs.
 * Never persist payroll passwords, SSNs, or raw account/routing numbers here.
 */
require_once __DIR__ . '/lib.php';

function sru_growth_blocked_key($key) {
    $k = strtolower((string)$key);
    $blocked = [
        'account', 'accountnumber', 'routing', 'routingnumber', 'ssn',
        'password', 'payrollpassword', 'credentials', 'pin', 'cvv',
        'token', 'secret', 'bankaccount', 'iban',
    ];
    if (in_array($k, $blocked, true)) return true;
    return (bool)preg_match('/account[_\s-]?number|routing|ssn|social.?security|password|payroll.?pass|credential|iban|swift|full.?ssn/i', $k);
}

function sru_growth_sanitize_props($props) {
    if (!is_array($props)) return [];
    $clean = [];
    foreach ($props as $k => $v) {
        $key = substr((string)$k, 0, 40);
        if (sru_growth_blocked_key($key)) continue;
        if (is_array($v) || is_object($v)) continue;
        if (is_string($v)) {
            if (sru_growth_blocked_key($v)) continue;
            $digits = preg_replace('/\s+/', '', $v);
            if (preg_match('/^\d{8,17}$/', $digits)) continue;
            $v = substr($v, 0, 200);
        }
        $clean[$key] = $v;
    }
    return $clean;
}

function sru_growth_read_json($name, $defaultKey) {
    sru_ensure_data();
    $file = SRU_DATA_DIR . '/' . $name;
    if (!file_exists($file)) {
        return [$defaultKey => []];
    }
    $raw = json_decode((string)file_get_contents($file), true);
    return is_array($raw) ? $raw : [$defaultKey => []];
}

function sru_growth_write_json($name, $data) {
    sru_ensure_data();
    $file = SRU_DATA_DIR . '/' . $name;
    $tmp = $file . '.tmp';
    $data['updatedAt'] = gmdate('c');
    if (file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
        return false;
    }
    return rename($tmp, $file);
}

function sru_growth_require_admin() {
    sru_require_secure_config(['admin']);
    $pass = '';
    if (!empty($_SERVER['HTTP_X_ADMIN_PASSWORD'])) {
        $pass = (string)$_SERVER['HTTP_X_ADMIN_PASSWORD'];
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = sru_body();
        $pass = (string)($body['password'] ?? '');
    }
    $expected = defined('SRU_ADMIN_PASSWORD') ? SRU_ADMIN_PASSWORD : '';
    if ($expected === '' || !hash_equals($expected, $pass)) {
        sru_json(['ok' => false, 'error' => 'Unauthorized'], 401);
    }
}
