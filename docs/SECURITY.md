# Security notes

* **AuthN/Z:** Supabase Auth (bearer JWT verified server-side per request). Roles: owner > admin > staff, checked per business per request; unauthorized and nonexistent resources both return 404. Platform admin is a separate table.
* **Secrets:** Daraja credentials AES-256-GCM encrypted with `SECRET_ENCRYPTION_KEY`, decrypted only inside server handlers, masked in the UI, never logged. Router tokens and purchase keys are stored only as SHA-256 hashes. Voucher codes only as HMAC. The service-role key never reaches the browser.
* **Callbacks:** unguessable per-business path secret, deduplicated by event key, amount matched, re-verified with STK Query, raw payload kept in `payment_events`.
* **Abuse:** DB-backed rate limits on portal, payments, voucher redemption (IP + device), callbacks, router polling; request-size limits; strict validation; generic error messages.
* **Router scripts:** built only from regex-validated MAC/UUID/integers (unit-tested against injection). Router identity bound by serial number.
* **Headers:** HSTS, nosniff, frame deny, strict referrer policy (`next.config.mjs`). No CSRF cookie flow exists because API calls use bearer tokens, not ambient cookies.
* **Privacy/retention:** customers store phone (when paying by M-Pesa) and device MAC. Staff see masked phones. Suggested retention: purge `customers`/`payments` PII after your legal retention period (financial records typically 5-7 years; Kenya Data Protection Act applies: register as a data controller/processor where required, publish the privacy text on the portal). Router commands older than 30 days are pruned by the cron.
* **Backups/recovery:** enable Supabase daily backups/PITR. Back up `SECRET_ENCRYPTION_KEY` and `VOUCHER_PEPPER` in a password manager *separately* from the database: without them stored credentials/vouchers are unusable. Recovery drill: restore to a new project, set the same env vars, run `npm run test:db` against the restored copy.
* **Hardening to add before large scale:** WAF/bot protection on the portal, SMS/email alerts on router offline and failed callbacks, per-business API quotas, Supabase Storage for logos with image scanning.
