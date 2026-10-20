# Acceptance and end-to-end test procedure

## Automated
```
npm test        # unit tests: slugs, durations/expiry, formats, voucher codes+hashing, AES-GCM, state machines, Daraja payloads/callback parsing, RouterOS script injection safety
npm run test:db # needs a DISPOSABLE Supabase project: slug constraints, RLS cross-tenant isolation, confirm_payment idempotency (8 parallel callbacks -> 1 entitlement),
                # amount mismatch, no downgrade of confirmed payments, duplicate receipts, voucher race (12 parallel redemptions -> 1 winner), cross-business voucher,
                # router command lifecycle (failure keeps payment confirmed, retry, wrong-router ack rejected, expiry sweep), append-only audit log
```
Add API-level authorization checks as you deploy: call `/api/v1/businesses/<B-id>/packages` with a user from business A and expect `404`; with no token `401`; as `staff`, expect `404` on admin-only routes; `/api/v1/admin/*` as a normal user `404`.

## Checklist mapped to the acceptance criteria
| # | Criterion | How to verify |
|---|---|---|
| 1-3 | Register, wizard, unique slug | Register two accounts; second tries the first's slug -> "already taken"; try `admin`, `api` -> rejected |
| 4-5 | Anonymous portal shows right brand/packages/prices/contacts | Open `/<slug>` in a private window, no login; compare with dashboard |
| 6-7 | Own M-Pesa destination, no silent central routing | Two businesses with different Tills: STK `PartyB` and manual instructions differ; businesses without verified STK are never offered STK |
| 8 | No "paid" without confirmation | Submit a manual claim -> stays *awaiting verification*, no internet. Callback with wrong secret path -> ignored |
| 9-10 | Voucher works once; invalid/reused rejected | Redeem, then redeem again -> "already used"; wrong code -> "not valid"; business B's portal with A's code -> "not valid" |
| 11 | Repeated callbacks -> 1 entitlement | Replay the same callback JSON 5x (`curl`); one entitlement, one `authorize` command; events deduplicated |
| 12-14 | Router really blocks / profiles / expiry | Physical test below |
| 15 | Tenant isolation | `npm run test:db` + manual API checks above |
| 16 | Outage keeps paid records | Pay while the router is powered off *after* page load: payment stays confirmed, customer sees *Connecting*; power on -> access starts without a second payment |
| 17 | Auditability | Dashboard > Security > Audit log shows slug/mode/package/config/payment/voucher/revoke actions |
| 18 | Mobile journey | Run the physical test on Android and iOS |
| 19-20 | Builds/deploys; env documented | `npm run build`, Vercel deploy, README table |

## Physical router end-to-end test (about 45 minutes)
Prerequisites: MikroTik (RouterOS v7) with working internet and HotSpot, deployed app, one approved business with a published 15-minute package, Daraja sandbox or production credentials (optional), a phone.
1. **Baseline:** phone joins guest Wi-Fi; any HTTP site redirects to your portal URL with `?r=...&mac=...`; HTTPS sites do not load before payment. *Blocking works if nothing but the portal loads.*
2. **Enroll:** generate the script, paste it; dashboard router becomes *Connected* within ~30 s; `/system scheduler print` shows `dk-poll`.
3. **Voucher path:** generate 1 voucher; redeem on the phone. Portal shows *Connecting* then *Connected*; `/ip hotspot user print` shows a user named after the phone MAC with `limit-uptime` ~15 m and comment `dk:<id>`; the internet works. Redeem the same code on another device -> "already used".
4. **Payment path (manual):** pay the business's Till with KES price, submit the code -> no internet. In Payments confirm with code+amount -> router grants access within ~15-30 s.
5. **Payment path (STK):** Run Test credentials, then KES 1 test prompt -> *Verified*. Buy a package via prompt; approve on phone; access starts. Cancel a prompt -> portal shows "cancelled", no access, no charge.
6. **Duplicate callback:** `curl -X POST` the logged callback body again to `/api/v1/callbacks/mpesa/<secret>`; no second entitlement.
7. **Expiry:** wait for the 15 minutes (or set `expires_at` to the past in SQL and wait one poll): the hotspot user disappears, the internet stops, the portal shows the package ended; session status *expired*.
8. **Revoke:** buy/redeem again, press **Revoke** in Active sessions; access ends within one poll.
9. **Outage:** unplug the router WAN, wait 3+ minutes: portal refuses payments/vouchers ("temporarily offline", voucher not consumed). Restore: router returns to *Connected*.
10. **Data cap:** package with 50 MB: download past it; router stops at the cap and the platform marks the entitlement expired.
11. **Mobile:** repeat 3-4 on Android and iOS (captive-portal mini-browser too), including the page refresh mid-purchase (it resumes from session storage).
Record results; do not announce paid Wi-Fi until every step passes.

## Known external prerequisites
Supabase project, Vercel project and domain, Safaricom Daraja account with STK-enabled shortcode (production), a MikroTik router on RouterOS v7, and a public HTTPS `APP_BASE_URL` reachable by Safaricom and the router.
