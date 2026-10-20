import { db } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { handler, ok, ApiError, readJson, rateLimit, clientIp, v } from '@/lib/server/http';
import { normalizeMac } from '@/lib/formats';
import { hashVoucher, normalizeVoucherInput, sha256 } from '@/lib/crypto';
import { routerOnline } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  invalid: 'That voucher code is not valid.', revoked: 'This voucher has been cancelled.', expired: 'This voucher has expired.',
  used: 'This voucher has already been used.', wrong_scope: 'This voucher cannot be used at this location.',
  device_mismatch: 'This voucher is locked to a different device.', package_unavailable: 'The package for this voucher is no longer available. Please contact the business.',
  router_invalid: 'Please connect through the venue Wi-Fi to redeem a voucher.',
};

export const POST = handler(async (req) => {
  const ip = clientIp(req);
  await rateLimit(`vr-ip:${ip}`, 10, 300);      // brute-force defence: ~59-bit codes + tight throttle
  const b = await readJson(req);
  const slug = v.str(b.slug, 'slug', { max: 60 }).toLowerCase();
  const idem = v.secretKey(b.idempotencyKey, 'idempotencyKey');
  const mac = normalizeMac(b.mac);
  if (!mac) throw new ApiError(400, 'invalid_device', 'We could not detect your device. Reconnect to the Wi-Fi and try again.');
  await rateLimit(`vr-mac:${mac}`, 8, 300);
  const code = normalizeVoucherInput(b.code);
  if (!code) throw new ApiError(400, 'invalid', MESSAGES.invalid);

  const { data: biz } = await db().from('businesses').select('id,status,portal_mode').eq('slug', slug).maybeSingle();
  if (!biz || biz.status !== 'active' || !['live', 'voucher_only'].includes(biz.portal_mode)) throw new ApiError(404, 'not_found', 'This portal is not accepting vouchers.');
  const { data: router } = await db().from('routers').select('id,status,last_seen_at').eq('business_id', biz.id).eq('public_id', String(b.routerPublicId ?? '')).maybeSingle();
  if (!router) throw new ApiError(400, 'router_invalid', MESSAGES.router_invalid);

  const hash = hashVoucher(biz.id, code, env.pepper);
  // Offline router: do not consume the voucher (unless this is an idempotent replay of an earlier redemption).
  if (!routerOnline(router)) {
    const { data: v0 } = await db().from('vouchers').select('id').eq('business_id', biz.id).eq('code_hash', hash).maybeSingle();
    const replay = v0 && (await db().from('voucher_redemptions').select('id').eq('voucher_id', v0.id).eq('idempotency_key', idem).maybeSingle()).data;
    if (!replay) throw new ApiError(503, 'router_offline', 'This hotspot is temporarily offline. Your voucher has NOT been used. Please try again shortly.');
  }

  const { data, error } = await db().rpc('redeem_voucher', { p_business: biz.id, p_code_hash: hash, p_mac: mac, p_router: router.id, p_idem: idem, p_token_hash: sha256(idem) });
  if (error) { console.error('[redeem_voucher]', error.message); throw new ApiError(500, 'internal', 'Something went wrong. Your voucher was not used. Please try again.'); }
  if (!data.ok) throw new ApiError(data.error === 'invalid' ? 404 : 409, data.error, MESSAGES[data.error] ?? MESSAGES.invalid);
  return ok({ entitlementId: data.entitlement_id, already: !!data.already });
});
