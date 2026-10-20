# Business setup guide (also available step by step in the dashboard wizard)

## 1. Register and create your business
Sign up at `/register`, then name your business. Choose the portal address (slug). It is your public link and QR code
(`https://YOURDOMAIN/your-slug`). Reserved words (admin, api, login, dashboard, settings, support ...) are blocked and slugs are unique
across all businesses. Changing a published slug breaks printed QR codes: only the owner can do it, after confirmation.

## 2. Profile and branding
Add display name, logo link (https), description, support phone and WhatsApp, county/town, welcome message, terms and privacy text.
Customers see the support phone/WhatsApp on every portal screen.

## 3. Packages and prices
Create packages from the standard durations. **You** set each price; two businesses can charge differently for the same duration.
Optional data allowance, download/upload limits, devices allowed, promo label, schedule. Publish to show it on the portal.

## 4. Vouchers
Vouchers page: choose package and quantity, optional expiry, router restriction, multi-use or device lock. Download the CSV or print the sheet
**immediately**: codes are stored only as hashes and cannot be shown again. Revoke unused vouchers any time.

## 5. Your M-Pesa Till or Paybill
Payments > M-Pesa setup. Enter **your own** Till or Paybill. This does not prove ownership and nothing is verified by saving.
* **Pay-then-verify** works with any Till/Paybill: customers pay and submit the SMS code; you confirm it from your own statement (or upload your M-Pesa statement CSV and matching claims confirm automatically). A screenshot or a typed code alone is never proof.
* **Instant M-Pesa prompt (STK Push)** additionally needs: a Safaricom Daraja app (consumer key/secret), the Lipa na M-Pesa Online passkey for your shortcode, and a shortcode enabled for STK Push. For a **Till** enter the Till number and the store/head-office number Daraja requires. For a **Paybill** enter the Paybill and optional account rule. Then run **Step 1** (credentials) and **Step 2** (KES 1 test prompt to your own phone). The status becomes *Verified* only after that payment is confirmed. If Safaricom has not enabled STK for your shortcode you will see the provider's error: keep using pay-then-verify.
* Never type your M-Pesa PIN or Safaricom portal password anywhere in this product.

## 6. Router (MikroTik RouterOS v7)
1. Prepare: router has working internet; guest Wi-Fi on its own bridge (e.g. `bridge-guest`) with DHCP; **IP > Hotspot > Hotspot Setup** completed on that bridge; router clock correct (System > Clock) and DNS working.
2. Dashboard > Routers & sites: add a **site** (choose *Independent* = your own ISP, or *Central* = internet supplied by Decan Konnect/an authorized upstream) and a **router**.
3. Click **Generate setup script**, open Winbox > New Terminal, paste it. It sets MAC login on the hotspot profile, adds the walled-garden entry for the portal domain, installs `hotspot/login.html` (redirect to your portal with the router id and the device MAC) and a scheduler that polls every 15 s.
4. Click **Test connection**: the router becomes *Connected* only after its first real poll (it also records its serial number; a different device using the same token is rejected as *Authentication failure*).
5. Keep router admin services closed to the internet. The platform never stores or needs router passwords; the script contains a secret token, so treat it like a password. Generating a new script revokes the old token.
6. Package -> router policy mapping: each package becomes a hotspot user profile `dk-<down>-<up>-<devices>` (rate-limit and shared-users) created on demand; time and byte limits are set per user.

### Central vs independent internet
Recorded per site. It affects commercial arrangements only: customer traffic never passes through the platform.

## 7. Publish
Setup wizard step 6 shows the checklist. Modes: **Preview** (visible, buying disabled), **Voucher-only** (no M-Pesa), **Live**. Live/Voucher-only need an approved business, a connected router, a published package, and a support phone (Live also a payment destination). Then run the physical test in `TEST_PROCEDURE.md` before announcing paid Wi-Fi.

## Troubleshooting
| Symptom | Check |
|---|---|
| Router shows *Offline* | Router internet/DNS/clock; `/system scheduler print` shows `dk-poll`; `/log print where message~"decan"`; token regenerated? (old script stops working) |
| Customers are not redirected to the portal | Hotspot enabled on the guest bridge; `hotspot/login.html` present; walled-garden entry exists; test with a fresh device (HTTP site, not HTTPS) |
| Customer paid but has no internet | Payments page: look for "waiting for the router"; confirm router online; click **Retry**. The customer is never asked to pay twice |
| STK prompt never arrives | Phone is Safaricom, Daraja environment matches credentials (sandbox vs production), shortcode enabled for STK, `APP_BASE_URL` is public HTTPS |
| Callback delayed or missing | The customer's page and the Payments poll fall back to **STK Query** after ~20 s and resolve it; payments unresolved after 5 min are marked expired and may still be confirmed later if a verified result arrives |
| Voucher says "temporarily offline" | The router has not polled for 3 min: voucher was **not** consumed; fix router and retry |
| Voucher "already used" | Single-use vouchers are consumed exactly once. Multi-use shows uses used/max in the list |
| *Authentication failure* on router | Serial changed (router replaced?). Generate a new script on the new device |
