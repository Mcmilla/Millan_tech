<?php
declare(strict_types=1);

function respond(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message): void
{
    respond($status, ['error' => $message]);
}

function request_id(): string
{
    return bin2hex(random_bytes(8));
}

function require_same_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $originHost = parse_url($origin, PHP_URL_HOST);
    $hostName = parse_url('http://' . $host, PHP_URL_HOST);
    $originPort = parse_url($origin, PHP_URL_PORT) ?? (parse_url($origin, PHP_URL_SCHEME) === 'https' ? 443 : 80);
    $hostPort = parse_url('http://' . $host, PHP_URL_PORT) ?? ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 443 : 80);
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    if (
        !is_string($originHost)
        || !is_string($hostName)
        || strtolower((string) parse_url($origin, PHP_URL_SCHEME)) !== $scheme
        || !hash_equals(strtolower($hostName), strtolower($originHost))
        || $originPort !== $hostPort
    ) {
        fail(403, 'Request origin was not accepted.');
    }
}

function json_body(): array
{
    try {
        $data = json_decode((string) file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        fail(400, 'Request data is not valid JSON.');
    }
    if (!is_array($data)) {
        fail(400, 'Request data is invalid.');
    }
    return $data;
}

function normalize_email(mixed $value): string
{
    if (!is_string($value)) {
        fail(422, 'Enter a valid email address.');
    }
    $email = strtolower(trim($value));
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail(422, 'Enter a valid email address.');
    }
    return $email;
}

function post_value(string $key): string
{
    $value = $_POST[$key] ?? null;
    if (!is_string($value)) {
        fail(422, 'Complete all required application fields.');
    }
    return $value;
}

function valid_uuid(string $value): bool
{
    return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value) === 1;
}

function new_uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function rate_limit(PDO $pdo, string $key, int $limit, int $seconds): void
{
    $bucket = hash('sha256', $key);
    $statement = $pdo->prepare(
        'INSERT INTO training_rate_limits (bucket_key, request_count, reset_at)
         VALUES (:bucket, 1, :initial_reset_at)
         ON DUPLICATE KEY UPDATE
         request_count = IF(reset_at <= UTC_TIMESTAMP(), 1, request_count + 1),
         reset_at = IF(reset_at <= UTC_TIMESTAMP(), :updated_reset_at, reset_at)'
    );
    $resetAt = gmdate('Y-m-d H:i:s', time() + $seconds);
    $statement->execute(['bucket' => $bucket, 'initial_reset_at' => $resetAt, 'updated_reset_at' => $resetAt]);
    $statement = $pdo->prepare('SELECT request_count FROM training_rate_limits WHERE bucket_key = :bucket');
    $statement->execute(['bucket' => $bucket]);
    if ((int) $statement->fetchColumn() > $limit) {
        fail(429, 'Too many attempts. Please wait and try again later.');
    }
}

function google_token(array $config): string
{
    static $token = null;
    if (is_string($token)) {
        return $token;
    }
    $credentials = json_decode((string) file_get_contents($config['service_account_json']), true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($credentials) || empty($credentials['client_email']) || empty($credentials['private_key']) || empty($credentials['token_uri'])) {
        throw new RuntimeException('Google service account configuration is incomplete.');
    }
    $now = time();
    $encode = static fn(string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    $header = $encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
    $claims = $encode(json_encode([
        'iss' => $credentials['client_email'],
        'scope' => 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
        'aud' => $credentials['token_uri'],
        'iat' => $now,
        'exp' => $now + 3600,
    ], JSON_THROW_ON_ERROR));
    $unsigned = $header . '.' . $claims;
    if (!openssl_sign($unsigned, $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Could not sign Google service account assertion.');
    }
    $assertion = $unsigned . '.' . $encode($signature);
    $response = google_http($credentials['token_uri'], 'POST', [
        'Content-Type: application/x-www-form-urlencoded',
    ], http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $assertion,
    ]));
    if (!is_string($response['access_token'] ?? null)) {
        throw new RuntimeException('Google token response did not contain an access token.');
    }
    $token = $response['access_token'];
    return $token;
}

function google_http(string $url, string $method, array $headers = [], ?string $body = null): array
{
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Could not initialize Google API request.');
    }
    curl_setopt_array($handle, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 35,
    ]);
    $result = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);
    if (!is_string($result) || $status < 200 || $status >= 300) {
        throw new RuntimeException('Google API request failed with HTTP ' . $status . ($curlError !== '' ? ': ' . $curlError : ''));
    }
    if ($result === '') {
        return [];
    }
    try {
        $decoded = json_decode($result, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new RuntimeException('Google API returned invalid JSON.');
    }
    if (!is_array($decoded)) {
        throw new RuntimeException('Google API returned an invalid response.');
    }
    return $decoded;
}

function drive_upload(array $google, string $token, array $file, string $name): string
{
    $mime = $file['mime'];
    $metadata = json_encode([
        'name' => $name,
        'mimeType' => $mime,
        'parents' => [$google['drive_folder_id']],
    ], JSON_THROW_ON_ERROR);
    $boundary = 'ai-training-' . bin2hex(random_bytes(12));
    $contents = file_get_contents($file['tmp_name']);
    if (!is_string($contents)) {
        throw new RuntimeException('Could not read validated image upload.');
    }
    $body = "--{$boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{$metadata}\r\n";
    $body .= "--{$boundary}\r\nContent-Type: {$mime}\r\n\r\n{$contents}\r\n--{$boundary}--";
    $url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id';
    $response = google_http($url, 'POST', [
        'Authorization: Bearer ' . $token,
        'Content-Type: multipart/related; boundary=' . $boundary,
    ], $body);
    if (!is_string($response['id'] ?? null)) {
        throw new RuntimeException('Drive did not return the uploaded file ID.');
    }
    return $response['id'];
}

function drive_delete(array $google, string $token, string $fileId): void
{
    google_http('https://www.googleapis.com/drive/v3/files/' . rawurlencode($fileId) . '?supportsAllDrives=true', 'DELETE', [
        'Authorization: Bearer ' . $token,
    ]);
}

function sheets_append(array $google, string $token, array $values): int
{
    $range = rawurlencode("'" . str_replace("'", "''", $google['sheet_name']) . "'!A:I");
    $url = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode($google['spreadsheet_id'])
        . '/values/' . $range . ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
    $response = google_http($url, 'POST', [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
    ], json_encode(['values' => [$values]], JSON_THROW_ON_ERROR));
    $updatedRange = $response['updates']['updatedRange'] ?? '';
    if (!is_string($updatedRange) || preg_match('/![A-Z]+(\d+):[A-Z]+(\d+)$/', $updatedRange, $matches) !== 1) {
        throw new RuntimeException('Google Sheets did not return the updated row.');
    }
    return (int) $matches[1];
}

function sheets_update_status(array $google, string $token, int $row, string $status): void
{
    $range = rawurlencode("'" . str_replace("'", "''", $google['sheet_name']) . "'!I" . $row);
    $url = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode($google['spreadsheet_id'])
        . '/values/' . $range . '?valueInputOption=RAW';
    google_http($url, 'PUT', [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
    ], json_encode(['values' => [[$status]]], JSON_THROW_ON_ERROR));
}

function uploaded_image(string $key): array
{
    $file = $_FILES[$key] ?? null;
    if (
        !is_array($file)
        || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
        || !is_string($file['tmp_name'] ?? null)
        || !is_uploaded_file($file['tmp_name'])
    ) {
        fail(422, 'Upload all three required identity photos.');
    }
    $size = (int) $file['size'];
    if ($size < 1 || $size > 4 * 1024 * 1024) {
        fail(422, 'Each identity photo must be no larger than 4 MB.');
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);
    $image = @getimagesize($file['tmp_name']);
    $allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (
        !is_string($mime)
        || !in_array($mime, $allowed, true)
        || !is_array($image)
        || ($image['mime'] ?? '') !== $mime
        || ($image[0] ?? 0) < 1
        || ($image[1] ?? 0) < 1
        || $image[0] > 10000
        || $image[1] > 10000
        || $image[0] * $image[1] > 25000000
    ) {
        fail(422, 'Identity photos must be valid JPEG, PNG, or WebP images.');
    }
    return [
        'tmp_name' => $file['tmp_name'],
        'mime' => $mime,
        'extension' => ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime],
    ];
}

function account_response(array $account): array
{
    return [
        'status' => $account['status'],
        'submission_id' => $account['id'],
    ];
}

function validate_age(mixed $value): string
{
    if (!is_string($value)) {
        fail(422, 'Enter a valid date of birth. Applicants must be at least 18.');
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) || $date->format('Y-m-d') !== $value) {
        fail(422, 'Enter a valid date of birth. Applicants must be at least 18.');
    }
    $today = new DateTimeImmutable('today', new DateTimeZone('UTC'));
    if ($date > $today || $date->diff($today)->y < 18) {
        fail(422, 'Applicants must be at least 18 years old.');
    }
    return $value;
}

$requestId = request_id();
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
try {
    $configPath = getenv('AI_TRAINING_CONFIG') ?: dirname(__DIR__) . '/config.php';
    if (!is_file($configPath)) {
        throw new RuntimeException('Private application configuration is missing.');
    }
    $config = require $configPath;
    if (!is_array($config) || !isset($config['database'], $config['google'], $config['admin_key'])) {
        throw new RuntimeException('Application configuration is incomplete.');
    }
    $pdo = new PDO($config['database']['dsn'], $config['database']['username'], $config['database']['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    ini_set('session.use_strict_mode', '1');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'samesite' => 'Strict',
        'path' => '/',
    ]);
    session_start();

    $route = $_GET['route'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($route === 'me' && $method === 'GET') {
        if (!isset($_SESSION['account_id'])) {
            fail(401, 'Not signed in.');
        }
        $statement = $pdo->prepare('SELECT id, status FROM training_accounts WHERE id = :id');
        $statement->execute(['id' => $_SESSION['account_id']]);
        $account = $statement->fetch();
        if (!$account) {
            session_destroy();
            fail(401, 'Not signed in.');
        }
        respond(200, ['account' => account_response($account)]);
    }

    if ($route === 'logout' && $method === 'POST') {
        require_same_origin();
        $_SESSION = [];
        session_destroy();
        respond(200, ['ok' => true]);
    }

    if ($route === 'signup' && $method === 'POST') {
        require_same_origin();
        rate_limit($pdo, 'signup:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 5, 3600);

        $name = trim(post_value('full_name'));
        if (strlen($name) > 300 || preg_match('/^[\p{L}\p{M}][\p{L}\p{M}\s\'’.-]{1,99}$/u', $name) !== 1) {
            fail(422, 'Enter your full legal name using 2 to 100 letters.');
        }
        $email = normalize_email($_POST['email'] ?? null);
        $phone = trim(post_value('phone'));
        if (preg_match('/^\+[1-9][0-9]{7,14}$/', $phone) !== 1) {
            fail(422, 'Enter your phone number in international format, for example +254712345678.');
        }
        $country = trim(post_value('country'));
        if (preg_match('/^[\p{L}\p{M}][\p{L}\p{M}\s,.\'-]{1,79}$/u', $country) !== 1) {
            fail(422, 'Enter a valid country of residence.');
        }
        $birthDate = validate_age($_POST['date_of_birth'] ?? null);
        $idType = $_POST['id_type'] ?? '';
        if (!in_array($idType, ['national_id', 'passport'], true)) {
            fail(422, 'Select a supported identity document type.');
        }
        $password = $_POST['password'] ?? null;
        if (!is_string($password) || strlen($password) < 12 || strlen($password) > 128) {
            fail(422, 'Use a password between 12 and 128 characters.');
        }
        if (!is_string($_POST['password_confirmation'] ?? null) || !hash_equals($password, $_POST['password_confirmation'])) {
            fail(422, 'The passwords do not match.');
        }
        if (($_POST['consent'] ?? '') !== 'on') {
            fail(422, 'Consent is required to submit your application.');
        }
        $images = [
            'id_front' => uploaded_image('id_front'),
            'id_back' => uploaded_image('id_back'),
            'selfie' => uploaded_image('selfie'),
        ];
        $submissionId = new_uuid();
        $google = $config['google'];
        $googleToken = google_token($google);
        $uploadedIds = [];
        $sheetRow = null;
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare('INSERT INTO training_accounts (id, email, password_hash, status, sheet_row) VALUES (:id, :email, :password_hash, \'pending\', 0)');
            $statement->execute([
                'id' => $submissionId,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ]);
            foreach ($images as $key => $image) {
                $uploadedIds[] = drive_upload($google, $googleToken, $image, $submissionId . '_' . $key . '.' . $image['extension']);
            }
            $sheetRow = sheets_append($google, $googleToken, [
                $submissionId,
                gmdate('c'),
                $name,
                $email,
                $phone,
                $country,
                $birthDate,
                $idType,
                'pending',
            ]);
            $statement = $pdo->prepare('UPDATE training_accounts SET sheet_row = :sheet_row WHERE id = :id');
            $statement->execute(['sheet_row' => $sheetRow, 'id' => $submissionId]);
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            foreach ($uploadedIds as $fileId) {
                try {
                    drive_delete($google, $googleToken, $fileId);
                } catch (Throwable) {
                    error_log('AI training upload cleanup failed; request ' . $requestId);
                }
            }
            if (is_int($sheetRow)) {
                try {
                    sheets_update_status($google, $googleToken, $sheetRow, 'setup_failed');
                } catch (Throwable) {
                    error_log('AI training sheet cleanup failed; request ' . $requestId);
                }
            }
            throw $exception;
        }
        session_regenerate_id(true);
        $_SESSION['account_id'] = $submissionId;
        respond(201, ['account' => ['status' => 'pending', 'submission_id' => $submissionId]]);
    }

    if ($route === 'login' && $method === 'POST') {
        require_same_origin();
        $data = json_body();
        $email = normalize_email($data['email'] ?? null);
        rate_limit($pdo, 'login:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . ':' . $email, 10, 900);
        $password = $data['password'] ?? null;
        $statement = $pdo->prepare('SELECT id, password_hash, status FROM training_accounts WHERE email = :email');
        $statement->execute(['email' => $email]);
        $account = $statement->fetch();
        if (!$account || !is_string($password) || !password_verify($password, $account['password_hash'])) {
            fail(401, 'Email or password is incorrect.');
        }
        session_regenerate_id(true);
        $_SESSION['account_id'] = $account['id'];
        respond(200, ['account' => account_response($account)]);
    }

    if ($route === 'review' && $method === 'POST') {
        require_same_origin();
        rate_limit($pdo, 'review:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 10, 900);
        $key = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
        if (
            !is_string($config['admin_key'])
            || strlen($config['admin_key']) < 32
            || str_starts_with($config['admin_key'], 'REPLACE_WITH_')
            || !is_string($key)
            || !hash_equals($config['admin_key'], $key)
        ) {
            fail(403, 'Staff authorization failed.');
        }
        $data = json_body();
        $submissionId = $data['submission_id'] ?? '';
        $status = $data['status'] ?? '';
        if (!is_string($submissionId) || !valid_uuid($submissionId) || !in_array($status, ['approved', 'rejected'], true)) {
            fail(422, 'Enter a valid submission ID and review decision.');
        }
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare('SELECT sheet_row FROM training_accounts WHERE id = :id FOR UPDATE');
            $statement->execute(['id' => $submissionId]);
            $sheetRow = $statement->fetchColumn();
            if ($sheetRow === false) {
                $pdo->rollBack();
                fail(404, 'Application was not found.');
            }
            sheets_update_status($config['google'], google_token($config['google']), (int) $sheetRow, $status);
            $statement = $pdo->prepare('UPDATE training_accounts SET status = :status WHERE id = :id');
            $statement->execute(['status' => $status, 'id' => $submissionId]);
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
        respond(200, ['status' => $status]);
    }

    fail(404, 'Endpoint not found.');
} catch (PDOException $exception) {
    error_log('AI training database error; request ' . $requestId);
    if (str_contains($exception->getMessage(), 'training_accounts_email_unique')) {
        fail(409, 'An account already exists for this email address. Sign in instead.');
    }
    fail(500, 'The request could not be completed. Please try again later. Reference: ' . $requestId);
} catch (Throwable $exception) {
    error_log('AI training request failed (' . get_class($exception) . '); request ' . $requestId);
    fail(503, 'Secure storage or account service is temporarily unavailable. Please try again later. Reference: ' . $requestId);
}
