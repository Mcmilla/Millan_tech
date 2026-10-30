# WINSNET Wi-Fi billing

This project contains the Wi-Fi package portal, a live-only M-Pesa Daraja backend, a MySQL transaction schema, and MikroTik RouterOS hotspot voucher provisioning. It has **no demo payment mode**. Payment is reported as successful only after Daraja's STK Push callback and transaction query confirm the amount and phone number; hotspot credentials are disclosed only after RouterOS accepts the voucher.

The checkout plans and prices are enforced on the server as well as shown in the browser.

| Plan | RouterOS online-time limit | Price |
| --- | --- | ---: |
| 1 Hour Unlimited | 1 hour | KSh 9 |
| 4 Hours Unlimited | 4 hours | KSh 19 |
| 24 Hours Unlimited | 1 day | KSh 29 |
| 1 Week Unlimited | 7 days | KSh 189 |
| 2 Weeks Unlimited | 14 days | KSh 299 |
| 1 Month Unlimited | 30 days | KSh 479 |

## Important: go-live requirements

This source code is **not live until deployed and configured** with your own cPanel database, Safaricom production Daraja credentials, HTTPS domain/callback, and securely reachable MikroTik router. Do not copy credentials into browser files or share them in chat. For a cPanel shared host that cannot privately reach the router, you need a secured VPN/network route or another production integration host; do not expose an unrestricted RouterOS management API to the public internet.

### 1. Prepare cPanel

1. Point your domain's document root at this project directory and enable **Force HTTPS** in cPanel. Use a valid TLS certificate.
2. Select PHP 8.1 or newer and enable `curl`, `pdo_mysql`, and `openssl`. Apache `mod_rewrite` and `mod_headers` must be available for the supplied `.htaccess` files.
3. Create a MySQL database and user in cPanel. Import [`api/schema.sql`](./api/schema.sql) into that database and grant its user the required table permissions.
4. Copy `api/config.php.example` to `api/config.php`. Protect the copy from public access; the included Apache rules deny direct web access. Prefer storing it outside the document root and setting `WIFIPAY_CONFIG` to its absolute server path. Set restrictive file permissions (for example, `600`) where your hosting account permits.
5. In `api/config.php`, fill in the actual public HTTPS `base_url`, database credentials, production Daraja credentials, RouterOS connection, and security secrets. Generate independent random secrets on the server, for example:

   ```sh
   php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
   php -r 'echo base64_encode(random_bytes(32)), PHP_EOL;'
   ```

   Use the first output for `callback_token` (at least 48 hex characters) and the second for `encryption_key`. Do not reuse either for another purpose.

### 2. Configure Safaricom Daraja

Use the **production** consumer key, consumer secret, approved PayBill/Till shortcode, and passkey from your Safaricom Daraja application. Set `transaction_type` to the transaction type approved for that shortcode (`CustomerPayBillOnline` or `CustomerBuyGoodsOnline`). Register this exact callback URL with the M-Pesa application:

```text
https://YOUR-DOMAIN/api/mpesa/callback?token=YOUR_CALLBACK_TOKEN
```

The server uses Safaricom's production OAuth, STK Push, and STK Push Query endpoints. The callback URL must be publicly reachable over valid HTTPS. Test a real, low-value transaction before announcing the service. Do not set demo/sandbox credentials as production credentials.

### 3. Configure MikroTik RouterOS

The server provisions one unique hotspot user per confirmed purchase using the RouterOS REST API.

1. Use a RouterOS version that supports REST API (v7.1beta4 or newer). Enable **`www-ssl` only** with a certificate trusted by the cPanel server. Never use the unencrypted `www` REST service in production.
2. Make the router REST API reachable from the PHP server **only through an access-restricted VPN/private route or strict firewall allow-list**. The configured `base_url` must use HTTPS and a hostname/IP that matches a trusted certificate.
3. Create a dedicated RouterOS service account with the minimum read/write/API/REST permissions needed to manage hotspot users. Set the account name/password in the private PHP config. Do not use the router's full administrator account.
4. Configure the hotspot server and its login page to accept users stored in `/ip hotspot user`, and choose a suitable existing hotspot user profile in `hotspot_profile`. Set that profile's rate limits/shared-device policy to suit your service.
5. After payment, the customer sees a unique username and password. They must connect to the Wi-Fi network and enter those credentials on the MikroTik hotspot sign-in page. The `limit-uptime` limit counts actual connected time (not calendar time from purchase).
6. Allow the portal domain, Daraja callback, and payment-status endpoints through your hotspot's walled garden so an unauthenticated customer can finish checkout and see their voucher.

The displayed support phone number in `index.html` is a placeholder; update it before publishing.

## Payment and activation API

The frontend calls same-origin `POST /api/payments` and `GET /api/payments/{paymentId}`. The server owns prices, normalizes/validates Kenyan numbers, limits attempts, prevents concurrent duplicate prompts for a phone number, stores transactions in MySQL, checks callback metadata against the order, and queries Daraja before marking payment paid. The random payment ID is the customer's status capability; keep it private and serve the entire site over HTTPS.

If payment is confirmed but RouterOS is unavailable, the transaction remains recorded and the checkout tells the customer not to pay again. Activation retries are rate-limited and capped. The operator must resolve router connectivity and assist affected customers. Verify this failure and recovery process before launch.

## Local preview

Opening `index.html` shows the package page, but payment requires the configured PHP/MySQL API on the same HTTPS origin. There is deliberately no simulated payment success.
