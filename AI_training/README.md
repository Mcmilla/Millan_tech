# Fieldwork AI contributor onboarding

This application accepts contributor applications, stores the three required identity images in a restricted Google Drive folder, records application details and status in Google Sheets, and keeps password hashes and account access state in MySQL. New applicants remain **pending** until a staff reviewer checks the documents and approves them. This is an onboarding and access-gating foundation; it does not yet include a catalog or interface for AI training jobs.

## Requirements

- PHP 8.1+ with `curl`, `fileinfo`, `openssl`, `pdo_mysql`, and `json`
- MySQL with InnoDB
- Apache with `mod_rewrite`, `mod_headers`, and HTTPS enabled
- A Google Workspace shared drive, service account, private folder, and spreadsheet

Identity photos and signup information are sensitive personal data. Configure access only for staff who need it, use a dedicated service account, enable HTTPS, and set a retention/deletion policy before accepting real applications. The app does not make Drive files public or include image links in the spreadsheet.

## Setup

1. Deploy this folder as its own HTTPS site/document root. Do not mix it with the Wi-Fi billing app.
2. Create a MySQL database and import [`api/schema.sql`](./api/schema.sql).
3. Create a **dedicated, access-restricted Google Workspace shared drive** for verification uploads. Add only the service account and staff who must review applications; give the service account Content manager access so it can upload files and clean up failed submissions. Share the onboarding spreadsheet with the service account as an editor. Using a shared drive avoids the storage-quota limitation of service-account-owned files.
4. Create a spreadsheet tab named `Signups` with this header row in columns A through I:

   ```text
   submission_id | created_at | full_name | email | phone | country | date_of_birth | id_type | status
   ```

5. Create a Google service account with the Drive and Sheets API enabled. Keep its JSON key outside the web root and never commit or upload it to the application. Configure the shared-drive folder ID and spreadsheet ID.
6. Copy `api/config.php.example` to a private `config.php`, fill in the database and Google values, and set a unique random `admin_key` of at least 32 characters. Prefer placing the config outside the document root and set `AI_TRAINING_CONFIG` to its absolute path. Otherwise, the included Apache rule denies web access to `config.php`.
7. Set PHP's upload limit above the 12 MB combined image limit (for example, `upload_max_filesize=5M`, `post_max_size=14M`) and confirm the host permits outbound HTTPS requests to Google APIs.
8. Test signup, sign-in, a rejected review, and an approved review using non-sensitive test data before launch. The staff review key can approve or reject by submission ID; reviewers must first manually compare the Sheet application with the three private files in Drive.

## Validation and access controls

- Server-side checks enforce valid email, international phone format, legal name and country lengths, supported ID type, age 18+, explicit consent, 12–128 character passwords, and genuine JPEG/PNG/WebP images no larger than 4 MB each.
- Passwords are hashed with PHP's password hashing API. Session cookies are HTTP-only and same-site strict; sessions rotate after sign-in.
- Signup and sign-in attempts are rate-limited per client IP (and email for sign-in). Same-origin checks protect state-changing requests.
- The backend validates image MIME from file contents, stores them under random submission IDs in Drive, and stores only Drive's private file IDs through Drive itself. The application does not provide image download endpoints.
- Applicant access remains disabled for `pending` and `rejected` accounts. The current approved-state page is an access gate; connect it to a job system before offering jobs.

## Operational limitations

The configured staff key is a shared secret for the review endpoint. Keep it private, rotate it if exposed, and restrict access to `review.html` at the web server or network layer where possible. Staff must use the spreadsheet and restricted Drive folder to perform identity checks. Maintain a documented retention schedule and delete expired submissions from both Drive and Sheets. A production launch should also establish an appropriate privacy notice, consent wording, data-controller contact, and applicable legal basis for identity/biometric processing in the regions served.
