# Decan Konnect Internet Services: multi-tenant captive portal platform

Next.js 15 (App Router) + Supabase (Postgres, Auth, RLS) + Vercel. Every business gets its own private dashboard, branded public portal
(`https://YOURDOMAIN/business-slug`), packages, vouchers, router and **its own M-Pesa receiving account**. Customers never create an account.

> **Read first: what was and was not verified.** This repository was written without access to your existing project, a Supabase instance,
> Safaricom Daraja or a MikroTik router. Pure logic (slugs, expiry maths, voucher hashing, encryption, state machines, Daraja payloads,
> RouterOS script safety) has automated passing tests (`npm test`). The SQL, API routes, UI and router agent have been
> carefully reviewed but **must be executed against real infrastructure** before you rely on them: follow `docs/TEST_PROCEDURE.md`.
> Nothing here pretends a router, payment or session works: statuses only change on real evidence.

## Integrating with your existing Decan Konnect site
This is a self-contained app that follows your stack (Next.js/Supabase/Vercel). To merge into the existing repo:
1. Copy `src/app/api/v1`, `src/app/dashboard`, `src/app/admin`, `src/app/[slug]`, `src/app/login`, `src/app/register`, `src/components`, `src/lib`, `supabase/migrations/0001_schema.sql`.
2. Keep your own `/`, `/blog`, admin and other routes: **add each of your existing top-level route names to the reserved list** in both
   `src/lib/slug.ts` and the `slug_not_reserved` constraint in the migration, so no business can claim e.g. `/blog`. Static routes already win over `/[slug]`.
3. Your official logo: set it in `Logo` (`src/components/ui.tsx`) and the portal footer. A neutral "DK" mark is used as a placeholder; no logo is invented.
4. Existing tables are untouched; all new tables are new. Review name clashes (`businesses`, `payments`, `customers`, `packages`) and prefix them if needed.

## Quick start
```bash
npm install
cp .env.example .env.local        # fill in values (see below)
# Supabase SQL editor (or `supabase db push`): run supabase/migrations/0001_schema.sql
npm run dev
npm test                          # unit tests (no network needed)
npm run test:db                   # DB/RLS/concurrency tests against a DISPOSABLE Supabase project
```

### Environment variables
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth only (anon key; data is protected by RLS + API) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Never expose to the browser |
| `APP_BASE_URL` | Production URL, no trailing slash; used for portal URLs and Daraja callbacks (must be public HTTPS) |
| `SECRET_ENCRYPTION_KEY` | `openssl rand -base64 32`. Encrypts each business's Daraja credentials (AES-256-GCM). Losing it = businesses must re-enter credentials |
| `VOUCHER_PEPPER` | `openssl rand -base64 48`. Keys the voucher-code HMAC. Changing it invalidates all existing vouchers |
| `CRON_SECRET` | Protects `/api/v1/cron/maintenance` (Vercel Cron sends it as a Bearer token) |
| `MPESA_VERIFY_CALLBACK_WITH_QUERY` | `true` (default): a Daraja success callback is only trusted after an STK Query confirms it |

### Deploying to Vercel
1. Import the repo, add the variables above (Production + Preview), deploy. `vercel.json` registers one daily cron (Hobby plan limit); the router poll sweeps expiries every ~15 s anyway.
2. In Supabase Auth settings add your domain to redirect URLs; decide whether email confirmation is required.
3. Create the first platform super-admin (after registering normally):
   ```sql
   insert into platform_admins(user_id) select id from auth.users where email = 'you@example.com';
   ```
4. Approve businesses at `/admin`. Businesses can build everything and use Preview mode while pending; **Live/Voucher-only publishing requires approval and a connected router**.

## Architecture
```
Customer phone ──Wi-Fi──> MikroTik HotSpot ──login.html redirect──> /<slug>?r=<routerId>&mac=<mac>   (no account)
                                  ▲   │ poll every 15 s (HTTPS, router token)            │
                       RouterOS   │   ▼                                                   ▼
                       script <───┴── /api/v1/router/agent/poll  <── Supabase (Postgres) ◄── /api/v1/public/* , callbacks
Business owner ──> /dashboard ──> /api/v1/businesses/[id]/*  (server-side membership check on every call, then service role)
Platform admin ──> /admin ──────> /api/v1/admin/*
Safaricom Daraja ──callback──> /api/v1/callbacks/mpesa/<per-business secret>
```
* **Tenant isolation:** every row has `business_id`; every `/businesses/[id]/*` handler calls `requireRole` (same 404 for "not yours" and "does not exist"); RLS blocks direct client access; secrets tables (`payment_provider_configs`, `routers`) have no client policies at all.
* **Money:** each business stores its own Till/Paybill + Daraja app credentials (encrypted). The platform never defaults to a central shortcode: if a business has no verified STK configuration it is simply not offered STK.
* **Two payment capabilities.** (A) *Pay-then-verify*: customer pays your Till/Paybill and submits the SMS code; the claim is stored as `awaiting_verification` and **never grants access** until the business confirms it against its own statement (amount must match exactly) or imports its M-Pesa statement CSV. (B) *STK Push*: confirmed only by a provider callback that is re-verified by STK Query, matched on business + checkout id + amount, deduplicated by event key; verified end-to-end by a KES 1 test payment before the config is ever labelled *Verified*.
* **Access enforcement:** the platform never routes customer traffic. After payment/voucher, an *entitlement* is created (`pending_authorization`) and a command is queued; the router polls, applies a HotSpot user for the device MAC with `limit-uptime`, optional `limit-bytes-total` and a rate-limit profile, then acknowledges. **Only the router's ack flips the entitlement to `active`** (and the customer sees *Connected*). Accounting (bytes, uptime) comes back on each poll; wall-clock expiry and data exhaustion queue revoke commands.
* **Router outages:** a router that has not polled for 3 minutes is *offline*: the portal refuses to take payment and refuses to consume a voucher. If it goes offline after payment, the payment stays `confirmed` (state machine + DB trigger forbid downgrades), the command retries with back-off (max 8) and admins can retry from Payments; customers see *Connecting* and are never asked to pay twice.
* **State machines** (enforced by DB triggers, mirrored and tested in `src/lib/transitions.ts`): payment `pending|awaiting_verification → confirmed|failed|cancelled|expired` (confirmed is terminal; a late *verified* callback may confirm failed/expired); entitlement `pending_authorization → active → expired|revoked`; command `pending → sent → acked|failed`.
* **RADIUS:** not used. Vercel Functions are not a persistent RADIUS server, so the first adapter is a pull-based RouterOS agent. A RADIUS/CoA adapter can be added later behind the same entitlement + command tables as a separate always-on service.

## Decisions and limits you should know
* **Durations:** only the standard set (15/30/45/60 min, 1/5/8/12 h, 1/7/14 d, 1 month) is allowed and enforced by a DB check; custom durations are not supported. See `docs/EXPIRY_POLICY.md`.
* **Currency:** KES only, whole shillings (Daraja requires integers).
* **Voucher codes** are 12 symbols (~59 bits), stored only as HMAC-SHA256(pepper, businessId:code); the plaintext is returned once at generation for print/CSV and can never be re-exported. Redemption is rate-limited per IP and per device and atomic (row lock).
* **MAC from the redirect is untrusted input.** Worst case a user buys/redeems access for someone else's MAC (harmless to the platform). Per-device binding is what the HotSpot actually enforces.
* **MAC randomization:** modern phones randomize MACs per network; this is stable per SSID, but "forget network" gives a new MAC (and a new session). Document this to customers.
* **Rate limits** are DB-backed (`rate_limit_hit`) so they work across serverless instances; they fail open on infrastructure error so payments are never blocked by the limiter.
* **Not included:** SMS/email notifications, platform subscription billing (design: keep it a separate ledger, never mixed with `payments`), non-MikroTik vendors, RADIUS, logo upload (links only; add Supabase Storage if wanted), multi-business switcher UI beyond the first membership (the API supports many).

## Docs
* `docs/SETUP_GUIDE.md`: business onboarding + router guide + troubleshooting
* `docs/EXPIRY_POLICY.md`: exact expiry rules
* `docs/TEST_PROCEDURE.md`: acceptance checklist and the physical router end-to-end test
* `docs/SECURITY.md`: threat model, data retention, backup and recovery
#   d e c a n - w i f i  
 