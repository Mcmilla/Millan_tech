CREATE TABLE payments (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    phone_number CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    plan_id VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount INT UNSIGNED NOT NULL,
    status ENUM('pending', 'verification_pending', 'paid', 'provisioning', 'active', 'failed', 'provisioning_failed') NOT NULL DEFAULT 'pending',
    merchant_request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    checkout_request_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    receipt_number VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    callback_phone_number CHAR(12) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    callback_amount INT UNSIGNED DEFAULT NULL,
    voucher_username VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    voucher_password_encrypted TEXT DEFAULT NULL,
    callback_result_code INT DEFAULT NULL,
    provisioning_started_at DATETIME DEFAULT NULL,
    provisioning_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    verification_checked_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY payments_checkout_request_id_unique (checkout_request_id),
    UNIQUE KEY payments_receipt_number_unique (receipt_number),
    UNIQUE KEY payments_voucher_username_unique (voucher_username),
    KEY payments_phone_plan_created (phone_number, plan_id, created_at),
    KEY payments_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_rate_limits (
    bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    window_started_at DATETIME NOT NULL,
    request_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_phone_locks (
    phone_number CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    touched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
