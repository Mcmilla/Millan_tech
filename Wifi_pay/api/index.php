<?php
declare(strict_types=1);

date_default_timezone_set('Africa/Nairobi');

const PLANS = [
    '1-hour' => ['name' => '1 Hour Unlimited', 'price' => 9, 'limit' => '1h'],
    '4-hours' => ['name' => '4 Hours Unlimited', 'price' => 19, 'limit' => '4h'],
    '24-hours' => ['name' => '24 Hours Unlimited', 'price' => 29, 'limit' => '1d'],
    '1-week' => ['name' => '1 Week Unlimited', 'price' => 189, 'limit' => '7d'],
    '2-weeks' => ['name' => '2 Weeks Unlimited', 'price' => 299, 'limit' => '14d'],
    '1-month' => ['name' => '1 Month Unlimited', 'price' => 479, 'limit' => '30d'],
];

function respond(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function requestMethod(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function readJsonBody(): array
{
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 4096) {
        respond(413, ['message' => 'The request is too large.']);
    }

    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if (is_string($raw) && strlen($raw) > 4096) {
        respond(413, ['message' => 'The request is too large.']);
    }
    $body = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($body)) {
        respond(400, ['message' => 'The request body must be valid JSON.']);
    }

    return $body;
}

function configuration(): array
{
    $path = getenv('WIFIPAY_CONFIG');
    if (!is_string($path) || $path === '') {
        $path = __DIR__ . '/config.php';
    }
    if (!is_file($path) || !is_readable($path)) {
        respond(503, ['message' => 'Online payments are not configured. Please contact support.']);
    }

    $config = require $path;
    if (!is_array($config)) {
        respond(503, ['message' => 'Online payments are not configured. Please contact support.']);
    }

    return $config;
}

function db(array $config): PDO
{
    static $connection;
    if ($connection instanceof PDO) {
        return $connection;
    }
    $database = $config['database'] ?? [];
    foreach (['dsn', 'username', 'password'] as $key) {
        if (!isset($database[$key]) || !is_string($database[$key]) || $database[$key] === '') {
            respond(503, ['message' => 'Online payments are not configured. Please contact support.']);
        }
    }

    $connection = new PDO(
        $database['dsn'],
        $database['username'],
        $database['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    $connection->exec("SET time_zone = '+00:00'");
    return $connection;
}

function normalizePhone(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $digits = preg_replace('/\D+/', '', $value);
    if (!is_string($digits)) {
        return null;
    }
    if (preg_match('/^0[17]\d{8}$/', $digits) === 1) {
        $digits = '254' . substr($digits, 1);
    } elseif (preg_match('/^[17]\d{8}$/', $digits) === 1) {
        $digits = '254' . $digits;
    }
    return preg_match('/^254[17]\d{8}$/', $digits) === 1 ? $digits : null;
}

function assertSameOrigin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    if (!is_string($origin) || $origin === '') {
        return;
    }
    $originHost = parse_url($origin, PHP_URL_HOST);
    $requestHost = explode(':', $_SERVER['HTTP_HOST'] ?? '', 2)[0];
    if (!is_string($originHost) || !hash_equals(strtolower($requestHost), strtolower($originHost))) {
        respond(403, ['message' => 'This request is not allowed.']);
    }
}

function applyRateLimit(PDO $pdo, array $config): void
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $key = hash_hmac('sha256', is_string($ip) ? $ip : '', (string) ($config['callback_token'] ?? ''));
    $statement = $pdo->prepare(
        'INSERT INTO payment_rate_limits (bucket_key, window_started_at, request_count)
         VALUES (:bucket, UTC_TIMESTAMP(), 1)
         ON DUPLICATE KEY UPDATE
           request_count = IF(window_started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), 1, request_count + 1),
           window_started_at = IF(window_started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), UTC_TIMESTAMP(), window_started_at)'
    );
    $statement->execute(['bucket' => $key]);
    $statement = $pdo->prepare('SELECT request_count FROM payment_rate_limits WHERE bucket_key = :bucket');
    $statement->execute(['bucket' => $key]);
    if ((int) $statement->fetchColumn() > 5) {
        respond(429, ['message' => 'Too many payment attempts. Wait a few minutes and try again.']);
    }
}

function httpJson(string $url, string $method, array $headers, ?array $body = null): array
{
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('The payment service is temporarily unavailable.');
    }
    $encodedBody = $body === null ? null : json_encode($body, JSON_UNESCAPED_SLASHES);
    curl_setopt_array($handle, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    if ($encodedBody !== null) {
        $headers[] = 'Content-Length: ' . strlen($encodedBody);
        curl_setopt($handle, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($handle, CURLOPT_POSTFIELDS, $encodedBody);
    }
    $response = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);

    if (!is_string($response) || $status < 200 || $status >= 300) {
        error_log('Wi-Fi billing upstream request failed; HTTP ' . $status . ($curlError !== '' ? ', cURL error' : ''));
        throw new RuntimeException('The payment service is temporarily unavailable. Please try again shortly.');
    }
    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('The payment service returned an invalid response.');
    }
    return $decoded;
}

function darajaSettings(array $config): array
{
    $settings = $config['mpesa'] ?? [];
    foreach (['consumer_key', 'consumer_secret', 'shortcode', 'passkey'] as $key) {
        if (!isset($settings[$key]) || !is_string($settings[$key]) || $settings[$key] === '' || str_starts_with($settings[$key], 'REPLACE_')) {
            throw new RuntimeException('Online payments are not configured. Please contact support.');
        }
    }
    if (!in_array($settings['transaction_type'] ?? '', ['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'], true)) {
        throw new RuntimeException('The M-Pesa transaction type is not configured correctly.');
    }
    return $settings;
}

function darajaAccessToken(array $settings): string
{
    $basicAuth = base64_encode($settings['consumer_key'] . ':' . $settings['consumer_secret']);
    $result = httpJson(
        'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        'GET',
        ['Authorization: Basic ' . $basicAuth, 'Accept: application/json']
    );
    if (!isset($result['access_token']) || !is_string($result['access_token'])) {
        throw new RuntimeException('Could not authenticate with M-Pesa. Please contact support.');
    }
    return $result['access_token'];
}

function callbackUrl(array $config): string
{
    $baseUrl = $config['base_url'] ?? '';
    $token = $config['callback_token'] ?? '';
    if (!is_string($baseUrl) || !str_starts_with($baseUrl, 'https://') ||
        !is_string($token) || strlen($token) < 48 || str_starts_with($token, 'REPLACE_')) {
        throw new RuntimeException('The secure payment callback is not configured. Please contact support.');
    }
    return rtrim($baseUrl, '/') . '/api/mpesa/callback?token=' . rawurlencode($token);
}

function validateProductionConfig(array $config): void
{
    darajaSettings($config);
    callbackUrl($config);
    $key = base64_decode((string) ($config['encryption_key'] ?? ''), true);
    if (!is_string($key) || strlen($key) !== 32) {
        throw new RuntimeException('Voucher encryption is not configured. Please contact support.');
    }
    $router = $config['router'] ?? [];
    foreach (['base_url', 'username', 'password', 'hotspot_profile'] as $key) {
        if (!isset($router[$key]) || !is_string($router[$key]) || $router[$key] === '' || str_starts_with($router[$key], 'REPLACE_')) {
            throw new RuntimeException('Wi-Fi activation is not configured. Please contact support.');
        }
    }
    if (!str_starts_with($router['base_url'], 'https://') || str_contains($router['base_url'], '@')) {
        throw new RuntimeException('The secure router connection is not configured. Please contact support.');
    }
}

function createStkPush(array $config, string $paymentId, string $phoneNumber, array $plan): array
{
    $settings = darajaSettings($config);
    $shortcode = (string) $settings['shortcode'];
    $timestamp = date('YmdHis');
    $password = base64_encode($shortcode . $settings['passkey'] . $timestamp);
    $token = darajaAccessToken($settings);

    $result = httpJson(
        'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        'POST',
        ['Authorization: Bearer ' . $token, 'Content-Type: application/json', 'Accept: application/json'],
        [
            'BusinessShortCode' => $shortcode,
            'Password' => $password,
            'Timestamp' => $timestamp,
            'TransactionType' => $settings['transaction_type'],
            'Amount' => $plan['price'],
            'PartyA' => $phoneNumber,
            'PartyB' => $shortcode,
            'PhoneNumber' => $phoneNumber,
            'CallBackURL' => callbackUrl($config),
            'AccountReference' => 'WIFI-' . substr(str_replace('-', '', $paymentId), 0, 12),
            'TransactionDesc' => substr('Wi-Fi ' . $plan['name'], 0, 30),
        ]
    );
    if ((string) ($result['ResponseCode'] ?? '') !== '0' ||
        !isset($result['CheckoutRequestID'], $result['MerchantRequestID']) ||
        !is_string($result['CheckoutRequestID']) || !is_string($result['MerchantRequestID'])) {
        throw new RuntimeException('M-Pesa could not start the payment. Check your phone before trying again.');
    }
    return $result;
}

function queryStkPush(array $config, array $payment): array
{
    $settings = darajaSettings($config);
    $shortcode = (string) $settings['shortcode'];
    $timestamp = date('YmdHis');
    $password = base64_encode($shortcode . $settings['passkey'] . $timestamp);
    $token = darajaAccessToken($settings);
    return httpJson(
        'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
        'POST',
        ['Authorization: Bearer ' . $token, 'Content-Type: application/json', 'Accept: application/json'],
        [
            'BusinessShortCode' => $shortcode,
            'Password' => $password,
            'Timestamp' => $timestamp,
            'CheckoutRequestID' => $payment['checkout_request_id'],
        ]
    );
}

function paymentById(PDO $pdo, string $id): ?array
{
    $statement = $pdo->prepare('SELECT * FROM payments WHERE id = :id LIMIT 1');
    $statement->execute(['id' => $id]);
    $payment = $statement->fetch();
    return is_array($payment) ? $payment : null;
}

function createPayment(PDO $pdo, array $config): void
{
    assertSameOrigin();
    validateProductionConfig($config);
    $body = readJsonBody();
    $planId = $body['planId'] ?? null;
    $phoneNumber = normalizePhone($body['phoneNumber'] ?? null);
    if (!is_string($planId) || !isset(PLANS[$planId])) {
        respond(422, ['message' => 'Choose a valid Wi-Fi package.']);
    }
    if ($phoneNumber === null) {
        respond(422, ['message' => 'Enter a valid Kenyan M-Pesa number.']);
    }
    applyRateLimit($pdo, $config);

    $id = sprintf(
        '%s-%s-%s-%s-%s',
        bin2hex(random_bytes(4)),
        bin2hex(random_bytes(2)),
        bin2hex(random_bytes(2)),
        bin2hex(random_bytes(2)),
        bin2hex(random_bytes(6))
    );
    $plan = PLANS[$planId];
    $pdo->beginTransaction();
    try {
        $lock = $pdo->prepare('INSERT IGNORE INTO payment_phone_locks (phone_number) VALUES (:phone)');
        $lock->execute(['phone' => $phoneNumber]);
        $lock = $pdo->prepare('SELECT phone_number FROM payment_phone_locks WHERE phone_number = :phone FOR UPDATE');
        $lock->execute(['phone' => $phoneNumber]);
        $lock->fetchColumn();

        $duplicate = $pdo->prepare(
            "SELECT id FROM payments
             WHERE phone_number = :phone
               AND status IN ('pending', 'verification_pending', 'paid', 'provisioning', 'provisioning_failed')
               AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 MINUTE)
             ORDER BY created_at DESC LIMIT 1"
        );
        $duplicate->execute(['phone' => $phoneNumber]);
        $existingId = $duplicate->fetchColumn();
        if (is_string($existingId)) {
            $pdo->commit();
            respond(200, [
                'paymentId' => $existingId,
                'status' => 'pending',
                'message' => 'A payment request for this number is already being processed. Check your phone before trying again.',
            ]);
        }

        $insert = $pdo->prepare('INSERT INTO payments (id, phone_number, plan_id, amount) VALUES (:id, :phone, :plan, :amount)');
        $insert->execute(['id' => $id, 'phone' => $phoneNumber, 'plan' => $planId, 'amount' => $plan['price']]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    try {
        $result = createStkPush($config, $id, $phoneNumber, $plan);
        $update = $pdo->prepare(
            'UPDATE payments SET merchant_request_id = :merchant, checkout_request_id = :checkout WHERE id = :id'
        );
        $update->execute([
            'merchant' => $result['MerchantRequestID'],
            'checkout' => $result['CheckoutRequestID'],
            'id' => $id,
        ]);
    } catch (Throwable $error) {
        error_log('Wi-Fi billing could not start STK Push for payment ' . $id . ': ' . $error->getMessage());
        respond(202, [
            'paymentId' => $id,
            'status' => 'pending',
            'message' => 'We could not confirm whether M-Pesa received the request. Check your phone and wait before trying again.',
        ]);
    }

    respond(201, [
        'paymentId' => $id,
        'status' => 'pending',
        'message' => 'Check your phone and approve the M-Pesa prompt.',
    ]);
}

function metadataItems(array $callback): array
{
    $items = $callback['CallbackMetadata']['Item'] ?? [];
    if (!is_array($items)) {
        return [];
    }
    $metadata = [];
    foreach ($items as $item) {
        if (is_array($item) && isset($item['Name'])) {
            $metadata[(string) $item['Name']] = $item['Value'] ?? null;
        }
    }
    return $metadata;
}

function confirmPayment(PDO $pdo, array $config, array $payment): bool
{
    if ($payment['status'] !== 'verification_pending') {
        return false;
    }
    $claim = $pdo->prepare(
        "UPDATE payments SET verification_checked_at = UTC_TIMESTAMP()
         WHERE id = :id AND status = 'verification_pending'
           AND (verification_checked_at IS NULL
                OR verification_checked_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 SECOND))"
    );
    $claim->execute(['id' => $payment['id']]);
    if ($claim->rowCount() !== 1) {
        return false;
    }

    try {
        $query = queryStkPush($config, $payment);
    } catch (Throwable $error) {
        error_log('Wi-Fi billing could not verify M-Pesa payment ' . $payment['id'] . ': ' . $error->getMessage());
        return false;
    }
    if ((string) ($query['ResultCode'] ?? '') !== '0' ||
        (isset($query['CheckoutRequestID']) &&
         !hash_equals((string) $payment['checkout_request_id'], (string) $query['CheckoutRequestID']))) {
        return false;
    }

    $markPaid = $pdo->prepare(
        "UPDATE payments SET status = 'paid', callback_result_code = 0
         WHERE id = :id AND status = 'verification_pending'"
    );
    $markPaid->execute(['id' => $payment['id']]);
    if ($markPaid->rowCount() === 1) {
        provisionPayment($pdo, $config, (string) $payment['id']);
    }
    return $markPaid->rowCount() === 1;
}

function encryptedVoucherPassword(array $config, string $password): string
{
    $encodedKey = $config['encryption_key'] ?? '';
    $key = is_string($encodedKey) ? base64_decode($encodedKey, true) : false;
    if (!is_string($key) || strlen($key) !== 32) {
        throw new RuntimeException('Voucher encryption is not configured. Please contact support.');
    }
    $nonce = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($password, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
    if (!is_string($ciphertext)) {
        throw new RuntimeException('Could not securely prepare Wi-Fi access. Please contact support.');
    }
    return base64_encode($nonce . $tag . $ciphertext);
}

function decryptedVoucherPassword(array $config, string $encrypted): string
{
    $key = base64_decode((string) ($config['encryption_key'] ?? ''), true);
    $packed = base64_decode($encrypted, true);
    if (!is_string($key) || strlen($key) !== 32 || !is_string($packed) || strlen($packed) < 29) {
        throw new RuntimeException('Wi-Fi access credentials are unavailable. Please contact support.');
    }
    $password = openssl_decrypt(
        substr($packed, 28),
        'aes-256-gcm',
        $key,
        OPENSSL_RAW_DATA,
        substr($packed, 0, 12),
        substr($packed, 12, 16)
    );
    if (!is_string($password)) {
        throw new RuntimeException('Wi-Fi access credentials are unavailable. Please contact support.');
    }
    return $password;
}

function routerRequest(array $config, string $method, string $path, ?array $body = null): array
{
    $router = $config['router'] ?? [];
    $baseUrl = $router['base_url'] ?? '';
    foreach (['username', 'password', 'hotspot_profile'] as $key) {
        if (!isset($router[$key]) || !is_string($router[$key]) || $router[$key] === '' || str_starts_with($router[$key], 'REPLACE_')) {
            throw new RuntimeException('Wi-Fi activation is not configured. Please contact support.');
        }
    }
    if (!is_string($baseUrl) || !str_starts_with($baseUrl, 'https://') || str_contains($baseUrl, '@')) {
        throw new RuntimeException('The secure router connection is not configured. Please contact support.');
    }

    $url = rtrim($baseUrl, '/') . '/rest/' . ltrim($path, '/');
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('The Wi-Fi router is temporarily unavailable.');
    }
    $headers = ['Accept: application/json'];
    $encodedBody = $body === null ? null : json_encode($body, JSON_UNESCAPED_SLASHES);
    if ($encodedBody !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    curl_setopt_array($handle, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
        CURLOPT_USERPWD => $router['username'] . ':' . $router['password'],
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    if ($encodedBody !== null) {
        curl_setopt($handle, CURLOPT_POSTFIELDS, $encodedBody);
    }
    $response = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);
    if (!is_string($response) || $status < 200 || $status >= 300) {
        error_log('Wi-Fi billing RouterOS request failed; HTTP ' . $status . ($curlError !== '' ? ', cURL error' : ''));
        throw new RuntimeException('Payment received, but Wi-Fi activation is delayed. Contact support and do not pay again.');
    }
    if ($response === '') {
        return [];
    }
    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('The Wi-Fi router returned an invalid response.');
    }
    return $decoded;
}

function provisionPayment(PDO $pdo, array $config, string $paymentId): void
{
    $payment = paymentById($pdo, $paymentId);
    if ($payment === null || $payment['status'] === 'active' || $payment['status'] === 'failed') {
        return;
    }
    if (!in_array($payment['status'], ['paid', 'provisioning_failed', 'provisioning'], true)) {
        return;
    }

    $claim = $pdo->prepare(
        "UPDATE payments
         SET status = 'provisioning', provisioning_started_at = UTC_TIMESTAMP(),
             provisioning_attempts = provisioning_attempts + 1
         WHERE id = :id AND (
           status = 'paid'
           OR (status = 'provisioning_failed' AND provisioning_attempts < 5
               AND provisioning_started_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 SECOND))
           OR (status = 'provisioning' AND provisioning_attempts < 5
               AND provisioning_started_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND))
         )"
    );
    $claim->execute(['id' => $paymentId]);
    if ($claim->rowCount() !== 1) {
        return;
    }
    $payment = paymentById($pdo, $paymentId);
    if ($payment === null) {
        return;
    }

    try {
        if (!is_string($payment['voucher_username']) || $payment['voucher_username'] === '' ||
            !is_string($payment['voucher_password_encrypted']) || $payment['voucher_password_encrypted'] === '') {
            $username = 'w' . bin2hex(random_bytes(6));
            $password = bin2hex(random_bytes(12));
            $encrypted = encryptedVoucherPassword($config, $password);
            $save = $pdo->prepare(
                'UPDATE payments SET voucher_username = :username, voucher_password_encrypted = :password WHERE id = :id'
            );
            $save->execute(['username' => $username, 'password' => $encrypted, 'id' => $paymentId]);
            $payment['voucher_username'] = $username;
            $payment['voucher_password_encrypted'] = $encrypted;
        }

        $password = decryptedVoucherPassword($config, $payment['voucher_password_encrypted']);
        $router = $config['router'];
        $existing = routerRequest($config, 'GET', 'ip/hotspot/user?name=' . rawurlencode($payment['voucher_username']));
        if (count($existing) === 0) {
            $plan = PLANS[$payment['plan_id']] ?? null;
            if ($plan === null) {
                throw new RuntimeException('The purchased Wi-Fi plan could not be verified.');
            }
            routerRequest($config, 'PUT', 'ip/hotspot/user', [
                'name' => $payment['voucher_username'],
                'password' => $password,
                'profile' => $router['hotspot_profile'],
                'limit-uptime' => $plan['limit'],
                'comment' => 'wifi-payment:' . $paymentId,
            ]);
        } elseif (!isset($existing[0]['comment']) ||
            !hash_equals('wifi-payment:' . $paymentId, (string) $existing[0]['comment'])) {
            throw new RuntimeException('Wi-Fi access could not be safely verified. Contact support and do not pay again.');
        }

        $activate = $pdo->prepare("UPDATE payments SET status = 'active' WHERE id = :id AND status = 'provisioning'");
        $activate->execute(['id' => $paymentId]);
    } catch (Throwable $error) {
        $failed = $pdo->prepare(
            "UPDATE payments SET status = 'provisioning_failed' WHERE id = :id AND status = 'provisioning'"
        );
        $failed->execute(['id' => $paymentId]);
        error_log('Wi-Fi activation failed for payment ' . $paymentId . ': ' . $error->getMessage());
    }
}

function processCallback(PDO $pdo, array $config): void
{
    $body = readJsonBody();
    $callback = $body['Body']['stkCallback'] ?? null;
    if (!is_array($callback) || !isset($callback['CheckoutRequestID'], $callback['ResultCode']) ||
        !is_string($callback['CheckoutRequestID'])) {
        respond(400, ['message' => 'Invalid payment callback.']);
    }
    $statement = $pdo->prepare('SELECT * FROM payments WHERE checkout_request_id = :checkout LIMIT 1');
    $statement->execute(['checkout' => $callback['CheckoutRequestID']]);
    $payment = $statement->fetch();
    if (!is_array($payment)) {
        error_log('Wi-Fi billing received an unknown M-Pesa callback.');
        respond(404, ['message' => 'Payment not found.']);
    }

    if ((int) $callback['ResultCode'] !== 0) {
        $fail = $pdo->prepare(
            "UPDATE payments SET status = 'failed', callback_result_code = :code
             WHERE id = :id AND status IN ('pending', 'verification_pending')"
        );
        $fail->execute(['code' => (int) $callback['ResultCode'], 'id' => $payment['id']]);
        respond(200, ['ResultCode' => 0, 'ResultDesc' => 'Callback received.']);
    }

    $metadata = metadataItems($callback);
    $phoneNumber = normalizePhone(isset($metadata['PhoneNumber']) ? (string) $metadata['PhoneNumber'] : null);
    $receipt = $metadata['MpesaReceiptNumber'] ?? null;
    $amount = $metadata['Amount'] ?? null;
    if (!is_string($receipt) || $receipt === '' || $phoneNumber !== $payment['phone_number'] ||
        !is_numeric($amount) || (int) $amount !== (int) $payment['amount']) {
        error_log('Wi-Fi billing rejected an M-Pesa callback with mismatched payment details.');
        respond(400, ['message' => 'Payment details could not be verified.']);
    }

    $pending = $pdo->prepare(
        "UPDATE payments
         SET status = 'verification_pending', receipt_number = :receipt,
             callback_phone_number = :phone, callback_amount = :amount, callback_result_code = 0
         WHERE id = :id AND status IN ('pending', 'verification_pending')"
    );
    $pending->execute([
        'receipt' => $receipt,
        'phone' => $phoneNumber,
        'amount' => (int) $amount,
        'id' => $payment['id'],
    ]);
    $payment = paymentById($pdo, (string) $payment['id']);
    if (is_array($payment)) {
        confirmPayment($pdo, $config, $payment);
    }
    respond(200, ['ResultCode' => 0, 'ResultDesc' => 'Callback received.']);
}

function readPaymentStatus(PDO $pdo, array $config, string $paymentId): void
{
    if (preg_match('/^[0-9a-fA-F-]{36}$/', $paymentId) !== 1) {
        respond(404, ['message' => 'Payment not found.']);
    }
    $payment = paymentById($pdo, $paymentId);
    if ($payment === null) {
        respond(404, ['message' => 'Payment not found.']);
    }
    if ($payment['status'] === 'verification_pending') {
        confirmPayment($pdo, $config, $payment);
        $payment = paymentById($pdo, $paymentId) ?? $payment;
    }
    if ($payment['status'] === 'paid' || $payment['status'] === 'provisioning_failed' || $payment['status'] === 'provisioning') {
        provisionPayment($pdo, $config, $paymentId);
        $payment = paymentById($pdo, $paymentId) ?? $payment;
    }

    if ($payment['status'] === 'active') {
        $password = decryptedVoucherPassword($config, (string) $payment['voucher_password_encrypted']);
        respond(200, [
            'status' => 'active',
            'receiptNumber' => $payment['receipt_number'],
            'credentials' => ['username' => $payment['voucher_username'], 'password' => $password],
        ]);
    }
    if ($payment['status'] === 'failed') {
        respond(200, ['status' => 'failed', 'message' => 'M-Pesa did not complete this payment. You can choose a plan and try again.']);
    }
    if ($payment['status'] === 'provisioning_failed') {
        if ((int) $payment['provisioning_attempts'] < 5) {
            respond(200, [
                'status' => 'pending',
                'message' => 'Payment received; Wi-Fi activation is being retried. Do not pay again.',
            ]);
        }
        respond(200, [
            'status' => 'provisioning_failed',
            'message' => 'Payment was received, but Wi-Fi activation needs support. Do not pay again; contact the network operator.',
        ]);
    }
    respond(200, ['status' => 'pending', 'message' => 'Waiting for M-Pesa payment confirmation.']);
}

try {
    $config = configuration();
    $method = requestMethod();
    if (isset($_GET['callback']) && $_GET['callback'] === 'mpesa') {
        if ($method !== 'POST') {
            respond(405, ['message' => 'Method not allowed.']);
        }
        $expectedToken = $config['callback_token'] ?? '';
        $receivedToken = $_GET['token'] ?? '';
        if (!is_string($expectedToken) || strlen($expectedToken) < 48 ||
            !is_string($receivedToken) || !hash_equals($expectedToken, $receivedToken)) {
            respond(404, ['message' => 'Not found.']);
        }
        $pdo = db($config);
        processCallback($pdo, $config);
    }
    $pdo = db($config);
    if ($method === 'POST' && !isset($_GET['payment_id'])) {
        try {
            createPayment($pdo, $config);
        } catch (Throwable $error) {
            error_log('Wi-Fi billing payment request failed: ' . $error->getMessage());
            respond(503, ['message' => $error->getMessage()]);
        }
    }
    if ($method === 'GET' && isset($_GET['payment_id']) && is_string($_GET['payment_id'])) {
        readPaymentStatus($pdo, $config, $_GET['payment_id']);
    }
    respond(404, ['message' => 'Not found.']);
} catch (Throwable $error) {
    error_log('Wi-Fi billing API error: ' . $error->getMessage());
    respond(500, ['message' => 'The service is temporarily unavailable. Please try again shortly.']);
}
