import { db, must } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, v } from '@/lib/server/http';
import { encryptJson, decryptJson, maskSecret } from '@/lib/crypto';
import { isValidShortcode, isValidAccountRule } from '@/lib/formats';

export const dynamic = 'force-dynamic';

function present(row: any) {
  let secrets: any = null;
  if (row.encrypted_secrets) { try { secrets = decryptJson(row.encrypted_secrets, env.encKey); } catch { /* unreadable */ } }
  return {
    method: row.method, till_or_paybill: row.till_or_paybill, shortcode: row.shortcode, account_reference_rule: row.account_reference_rule,
    instructions: row.instructions, daraja_env: row.daraja_env, status: row.status, last_test_at: row.last_test_at, last_test_result: row.last_test_result,
    callback_url: `${env.baseUrl}/api/v1/callbacks/mpesa/${row.callback_secret}`,
    secrets: { consumer_key: maskSecret(secrets?.consumer_key), consumer_secret: maskSecret(secrets?.consumer_secret), passkey: maskSecret(secrets?.passkey) },
    has_secrets: !!secrets,
  };
}

export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  return ok(present(must(await db().from('payment_provider_configs').select('*').eq('business_id', id).single())));
});

export const PUT = handler<{ id: string }>(async (req, { id }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const b = await readJson(req);
  const cur = must(await db().from('payment_provider_configs').select('*').eq('business_id', id).single());
  const upd: Record<string, any> = {};
  if (b.disable === true) { upd.status = 'disabled'; }
  else {
    const method = v.oneOf(b.method, 'Payment method', ['till', 'paybill'] as const);
    const number = v.str(b.tillOrPaybill, method === 'till' ? 'Till number' : 'Paybill number');
    if (!isValidShortcode(number)) throw new ApiError(400, 'invalid', `${method === 'till' ? 'Till' : 'Paybill'} number must be 5-7 digits.`);
    // Paybill: shortcode == paybill. Till: Daraja needs the store/head-office number as BusinessShortCode.
    const shortcode = method === 'paybill' ? number : v.str(b.shortcode, 'Store / head-office number');
    if (!isValidShortcode(shortcode)) throw new ApiError(400, 'invalid', 'Store / head-office number must be 5-7 digits.');
    if (b.accountRule && !isValidAccountRule(b.accountRule)) throw new ApiError(400, 'invalid', 'Account reference may use letters, numbers, space, dash, underscore and {phone}.');
    Object.assign(upd, { method, till_or_paybill: number, shortcode, account_reference_rule: method === 'paybill' && b.accountRule ? String(b.accountRule) : null,
      instructions: b.instructions ? v.str(b.instructions, 'Instructions', { max: 1000 }) : null, daraja_env: v.oneOf(b.darajaEnv ?? 'sandbox', 'Environment', ['sandbox', 'production'] as const) });
    // Secrets are optional per save: blank keeps the stored value. Never echoed back.
    let secrets: any = {}; if (cur.encrypted_secrets) { try { secrets = decryptJson(cur.encrypted_secrets, env.encKey); } catch { secrets = {}; } }
    for (const [k, col] of [['consumerKey', 'consumer_key'], ['consumerSecret', 'consumer_secret'], ['passkey', 'passkey']] as const)
      if (b[k]) secrets[col] = v.secretKey(b[k], k);
    const complete = secrets.consumer_key && secrets.consumer_secret && secrets.passkey;
    if (Object.keys(secrets).length) upd.encrypted_secrets = encryptJson(secrets, env.encKey);
    // Saving never marks anything verified: only a successful test payment does (see /test).
    upd.status = complete ? (cur.status === 'verified' && cur.till_or_paybill === number && cur.shortcode === shortcode && cur.daraja_env === upd.daraja_env ? 'verified' : 'awaiting_authorization') : 'awaiting_credentials';
    if (!complete && cur.till_or_paybill !== number) upd.status = 'awaiting_credentials';
  }
  const row = must(await db().from('payment_provider_configs').update(upd).eq('business_id', id).select('*').single(), 'update payment config');
  await audit(id, user.id, 'payment_config.updated', 'payment_config', id, { method: upd.method, status: upd.status, secrets_changed: !!upd.encrypted_secrets }); // never logs values
  return ok(present(row));
});
