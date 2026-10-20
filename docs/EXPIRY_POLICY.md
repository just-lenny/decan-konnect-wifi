# Package expiry policy

| Rule | Behaviour |
|---|---|
| Clock start | When the **router confirms** authorization (`ack`), never when the portal is opened, a payment is initiated or a voucher is typed. Expiry is computed at command dispatch and stored in the command payload; the entitlement takes that exact `expires_at` on ack. |
| minute / hour | Exact elapsed time. |
| day | Exactly 24 h per day (Nairobi has no daylight-saving time). |
| month | Same time of day on the same date next month in **Africa/Nairobi**; if that date does not exist the last day of that month (31 Jan 10:00 -> 28/29 Feb 10:00). Implemented identically in SQL `compute_expiry()` and TS `computeExpiry()`; both are tested. |
| Maximum | 1 month. Anything else is rejected by a DB check constraint. |
| Enforcement | Router: HotSpot user `limit-uptime` (a never-early backstop because uptime <= wall time) and `limit-bytes-total`. Platform: each router poll runs `sweep_expirations`, flipping `active -> expired` at `expires_at` and queueing a `revoke` command; the daily cron is a safety net. |
| Unclaimed purchases | A paid/redeemed entitlement not authorized within 30 days (`valid_until`) is revoked instead of authorizing. |
| Admin preview | The package list shows "if bought now, ends ..." using the same function. |
| Data caps | Router enforces the byte cap; platform also revokes when reported usage reaches the cap. |
| Editing a package | Entitlements snapshot duration, limits and speeds at purchase; later edits never change what a customer already bought. |
