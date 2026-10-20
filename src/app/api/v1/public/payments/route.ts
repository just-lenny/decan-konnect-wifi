import { db, must } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { handler, ok, ApiError, readJson, rateLimit, clientIp, v } from '@/lib/server/http';
import { normalizeKenyanPhone, normalizeMac, isValidReceipt } from '@/lib/formats';
import { sha256 } from '@/lib/crypto';
import { isAvailableNow } from '@/lib/durations';
import { stkPush } from '@/lib/mpesa';
import { loadDarajaConfig, routerOnline, confirmPayment, failPayment } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req) => {
  const ip = clientIp(req);
  await rateLimit(`pay-ip:${ip}`, 20, 600);
  const b = await readJson(req);
  const slug = v.str(b.slug, 'slug', { max: 60 }).toLowerCase();
  const packageId = v.uuid(b.packageId, 'packageId');
  const channel = v.oneOf(b.channel, 'channel', ['stk', 'manual'] as const);
  const mac = normalizeMac(b.mac);
  if (!mac) throw new ApiError(400, 'invalid_device', 'We could not detect your device. Reconnect to the Wi-Fi and try again.');
  const phone = normalizeKenyanPhone(b.phone);
  if (!phone) throw new ApiError(400, 'invalid_phone', 'Enter a valid Safaricom number, e.g. 0712 345 678.');
  const idem = v.secretKey(b.idempotencyKey, 'idempotencyKey');
  await rateLimit(`pay-phone:${phone}`, 6, 600);

  const { data: biz } = await db().from('businesses').select('id,status,portal_mode,slug').eq('slug', slug).maybeSingle();
  if (!biz || biz.status !== 'active' || biz.portal_mode !== 'live') throw new ApiError(404, 'not_found', 'This portal is not accepting payments.');

  // Idempotent replay: same purchase session returns the same payment, never a second charge.
  const existing = (await db().from('payments').select('id,status').eq('business_id', biz.id).eq('idempotency_key', idem).maybeSingle()).data;
  if (existing) return ok({ paymentId: existing.id, status: existing.status });

  const { data: pkg } = await db().from('packages').select('*').eq('id', packageId).eq('business_id', biz.id).maybeSingle();
  if (!pkg || !pkg.is_published || pkg.status !== 'active' || !isAvailableNow(pkg.schedule)) throw new ApiError(404, 'package_unavailable', 'That package is not available right now.');

  const { data: router } = await db().from('routers').select('id,site_id,status,last_seen_at').eq('business_id', biz.id).eq('public_id', String(b.routerPublicId ?? '')).maybeSingle();
  if (!router) throw new ApiError(400, 'invalid_router', 'Please connect through the venue Wi-Fi to buy a package.');
  // Never take money when the router cannot grant access.
  if (!routerOnline(router)) throw new ApiError(503, 'router_offline', 'This hotspot is temporarily offline, so we have not charged you. Please try again shortly or ask staff for a voucher.');

  const { data: cfg } = await db().from('payment_provider_configs').select('status,till_or_paybill').eq('business_id', biz.id).maybeSingle();
  const base = { business_id: biz.id, package_id: pkg.id, router_id: router.id, channel, phone, device_mac: mac, amount: pkg.price_amount, currency: pkg.currency,
    purchase_token_hash: sha256(idem), idempotency_key: idem };

  if (channel === 'manual') {
    if (!cfg?.till_or_paybill) throw new ApiError(400, 'not_available', 'Manual payment is not set up for this business.');
    const receipt = String(b.receipt ?? '').trim().toUpperCase();
    if (!isValidReceipt(receipt)) throw new ApiError(400, 'invalid_receipt', 'Enter the 10-character M-Pesa confirmation code from your SMS.');
    const p = must(await db().from('payments').insert({ ...base, status: 'awaiting_verification', claimed_receipt: receipt }).select('id').single(), 'insert manual payment');
    // Auto-confirm ONLY if the business already imported a matching statement line (independent proof).
    const { data: entry } = await db().from('reconciliation_entries').select('id,amount').eq('business_id', biz.id).eq('receipt', receipt).is('matched_payment_id', null).maybeSingle();
    if (entry && entry.amount === pkg.price_amount) {
      const r = await confirmPayment(p.id, receipt, entry.amount, 'reconciliation');
      if (r.ok) await db().from('reconciliation_entries').update({ matched_payment_id: p.id }).eq('id', entry.id);
    }
    return ok({ paymentId: p.id, status: 'awaiting_verification' }, 201);
  }

  if (cfg?.status !== 'verified') throw new ApiError(400, 'stk_unavailable', 'Instant M-Pesa prompt is not available for this business. Use the pay-then-verify option or a voucher.');
  const conf = await loadDarajaConfig(biz.id);
  if (!conf) throw new ApiError(400, 'stk_unavailable', 'Instant M-Pesa prompt is not available for this business.');

  // Guard against double prompts from rapid taps with different keys.
  const { data: recent } = await db().from('payments').select('id,status').eq('business_id', biz.id).eq('phone', phone).eq('package_id', pkg.id).eq('channel', 'stk')
    .eq('status', 'pending').gt('created_at', new Date(Date.now() - 60_000).toISOString()).limit(1);
  if (recent?.length) return ok({ paymentId: recent[0].id, status: 'pending', note: 'A prompt was already sent to your phone.' });

  const p = must(await db().from('payments').insert({ ...base, status: 'pending' }).select('id').single(), 'insert stk payment');
  try {
    const r = await stkPush(conf.cfg, { amount: pkg.price_amount, phone, callbackUrl: `${env.baseUrl}/api/v1/callbacks/mpesa/${conf.row.callback_secret}`,
      accountRef: (conf.row.account_reference_rule && conf.cfg.method === 'paybill' ? conf.row.account_reference_rule.replace('{phone}', phone.slice(-9)) : biz.slug), desc: 'WiFi access' });
    await db().from('payments').update({ checkout_request_id: r.checkoutRequestId, merchant_request_id: r.merchantRequestId }).eq('id', p.id);
    return ok({ paymentId: p.id, status: 'pending' }, 201);
  } catch (e: any) {
    await failPayment(p.id, 'failed', 'Could not send the M-Pesa prompt', null, 'system');
    console.error('[stk_push]', e?.message);
    throw new ApiError(502, 'stk_failed', 'We could not send the M-Pesa prompt. You have not been charged. Please try again.');
  }
});
