import { db, must } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, rateLimit, v } from '@/lib/server/http';
import { getAccessToken, stkPush } from '@/lib/mpesa';
import { normalizeKenyanPhone } from '@/lib/formats';
import { sha256, randomToken } from '@/lib/crypto';
import { loadDarajaConfig, failPayment, refreshPendingStk } from '@/lib/server/payments';

/**
 * Verification procedure (a configuration is only 'verified' after step 2 succeeds):
 *   step "credentials": OAuth against Daraja with the business's own app credentials  -> status 'testing'
 *   step "stk": sends KES 1 STK push to the admin's own phone; when the verified callback confirms it -> 'verified'
 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  await rateLimit(`paytest:${id}`, 10, 600);
  const b = await readJson(req);
  const step = v.oneOf(b.step, 'step', ['credentials', 'stk'] as const);
  const conf = await loadDarajaConfig(id);
  if (!conf) throw new ApiError(400, 'incomplete', 'Save your payment destination and Daraja credentials first.');
  const result = async (status: string, msg: string) => { await db().from('payment_provider_configs').update({ status, last_test_at: new Date().toISOString(), last_test_result: msg }).eq('business_id', id); };

  if (step === 'credentials') {
    try { await getAccessToken(conf.cfg); }
    catch (e: any) { await result('failed', e.message); await audit(id, user.id, 'payment_config.test_failed', 'payment_config', id, { step }); return ok({ passed: false, message: e.message }); }
    await result('testing', 'Credentials accepted by Daraja. Now confirm with a KES 1 test payment.');
    await audit(id, user.id, 'payment_config.credentials_ok', 'payment_config', id);
    return ok({ passed: true, message: 'Daraja accepted your credentials. Next: send the KES 1 test payment to your own phone.' });
  }

  const phone = normalizeKenyanPhone(b.phone);
  if (!phone) throw new ApiError(400, 'invalid_phone', 'Enter your own Safaricom number.');
  const key = randomToken(24);
  const p = must(await db().from('payments').insert({ business_id: id, channel: 'stk', status: 'pending', is_test: true, phone, amount: 1, purchase_token_hash: sha256(key), idempotency_key: key }).select('id').single());
  try {
    const r = await stkPush(conf.cfg, { amount: 1, phone, callbackUrl: `${env.baseUrl}/api/v1/callbacks/mpesa/${conf.row.callback_secret}`, accountRef: 'TEST', desc: 'Setup test' });
    await db().from('payments').update({ checkout_request_id: r.checkoutRequestId, merchant_request_id: r.merchantRequestId }).eq('id', p.id);
    await db().from('payment_provider_configs').update({ status: 'testing', last_test_at: new Date().toISOString(), last_test_result: 'Test prompt sent. Approve it on your phone.' }).eq('business_id', id);
    return ok({ passed: null, paymentId: p.id, message: 'Approve the KES 1 prompt on your phone. This page will update when the payment is confirmed.' });
  } catch (e: any) {
    await failPayment(p.id, 'failed', e.message, null, 'system');
    return ok({ passed: false, message: e.message });
  }
});

export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const pend = (await db().from('payments').select('*').eq('business_id', id).eq('is_test', true).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
  if (pend) await refreshPendingStk(pend); // resolves late callbacks via STK Query
  const { data } = await db().from('payment_provider_configs').select('status,last_test_at,last_test_result').eq('business_id', id).single();
  return ok(data);
});
