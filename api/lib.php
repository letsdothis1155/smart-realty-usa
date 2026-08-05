<?php
/**
 * Shared helpers for Smart Realty auth API
 */
require_once __DIR__ . '/config.php';

function sru_send_cors() {
    $origin = SRU_CORS_ORIGIN;
    if ($origin !== '') {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    } else {
        // Reflect request origin only if same host (simple same-site support)
        if (!empty($_SERVER['HTTP_ORIGIN'])) {
            $req = $_SERVER['HTTP_ORIGIN'];
            $host = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                . '://' . ($_SERVER['HTTP_HOST'] ?? '');
            // Allow any origin that matches our host (http/https www/apex)
            header('Access-Control-Allow-Origin: ' . $req);
            header('Vary: Origin');
            header('Access-Control-Allow-Headers: Content-Type, Authorization');
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        }
    }
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function sru_json($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

/**
 * Stop sensitive endpoints when server-only secrets are missing or weak.
 * The public health/security endpoints intentionally remain available.
 */
function sru_require_secure_config(array $required) {
    $status = sru_security_status();
    $issueFor = [
        'jwt' => 'jwt_secret_default',
        'demo' => 'demo_password_default',
        'admin' => 'admin_password_default',
    ];
    $blocking = [];
    foreach ($required as $key) {
        $issue = $issueFor[$key] ?? null;
        if ($issue !== null && in_array($issue, $status['issues'], true)) {
            $blocking[] = $issue;
        }
    }
    if ($blocking) {
        sru_json([
            'ok' => false,
            'error' => 'Authentication service is not configured.',
            'issues' => $blocking,
        ], 503);
    }
}

function sru_body() {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function sru_ensure_data() {
    if (!is_dir(SRU_DATA_DIR)) {
        @mkdir(SRU_DATA_DIR, 0755, true);
    }
    $file = SRU_DATA_DIR . '/users.json';
    if (!file_exists($file)) {
        file_put_contents($file, json_encode(['users' => []], JSON_PRETTY_PRINT));
    }
}

function sru_read_users() {
    sru_ensure_data();
    $file = SRU_DATA_DIR . '/users.json';
    $raw = @file_get_contents($file);
    $data = json_decode($raw ?: '{}', true);
    return isset($data['users']) && is_array($data['users']) ? $data['users'] : [];
}

function sru_write_users(array $users) {
    sru_ensure_data();
    $file = SRU_DATA_DIR . '/users.json';
    $tmp = $file . '.tmp';
    $payload = json_encode([
        'users' => $users,
        'updatedAt' => gmdate('c'),
    ], JSON_PRETTY_PRINT);
    if (file_put_contents($tmp, $payload) === false) {
        return false;
    }
    return rename($tmp, $file);
}

function sru_public_user(array $u) {
    return [
        'id' => $u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'role' => $u['role'] ?? 'member',
        'createdAt' => $u['createdAt'] ?? null,
    ];
}

function sru_b64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function sru_b64url_decode($data) {
    $remainder = strlen($data) % 4;
    if ($remainder) $data .= str_repeat('=', 4 - $remainder);
    return base64_decode(strtr($data, '-_', '+/'));
}

function sru_jwt_sign(array $payload) {
    sru_require_secure_config(['jwt']);
    $header = ['typ' => 'JWT', 'alg' => 'HS256'];
    $payload['iat'] = time();
    $payload['exp'] = time() + (SRU_JWT_DAYS * 86400);
    $h = sru_b64url_encode(json_encode($header));
    $p = sru_b64url_encode(json_encode($payload));
    $sig = sru_b64url_encode(hash_hmac('sha256', "$h.$p", SRU_JWT_SECRET, true));
    return "$h.$p.$sig";
}

function sru_jwt_verify($token) {
    $status = sru_security_status();
    if (in_array('jwt_secret_default', $status['issues'], true)) return null;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    list($h, $p, $s) = $parts;
    $check = sru_b64url_encode(hash_hmac('sha256', "$h.$p", SRU_JWT_SECRET, true));
    if (!hash_equals($check, $s)) return null;
    $payload = json_decode(sru_b64url_decode($p), true);
    if (!is_array($payload)) return null;
    if (($payload['exp'] ?? 0) < time()) return null;
    return $payload;
}

function sru_bearer_token() {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (stripos($hdr, 'Bearer ') === 0) {
        return trim(substr($hdr, 7));
    }
    // Some hosts need getallheaders
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp($k, 'Authorization') === 0 && stripos($v, 'Bearer ') === 0) {
                return trim(substr($v, 7));
            }
        }
    }
    return '';
}

function sru_valid_email($email) {
    $e = strtolower(trim((string)$email));
    return filter_var($e, FILTER_VALIDATE_EMAIL) ? $e : null;
}
