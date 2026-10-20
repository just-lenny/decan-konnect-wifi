import { db, must } from './db';
import { env } from './env';
import { decryptJson } from '../crypto';
import { stkQuery, type DarajaConfig } from '../mpesa';

export async function loadDarajaConfig(businessId: string): Promise<{ cfg: DarajaConfig; row: any } | null> {
  const { data: row } = await db().from('payment_provider_configs').select('*').eq('business_id', businessId).maybeSingle();
  if (!row || !row.encrypted_secrets || !row.method || !row.shortcode || !row.till_or_paybill) return null;
  const s = decryptJson<{ consumer_key: string; consumer_secret: string; passkey: string }>(row.encrypted_secrets, env.encKey);
  return { row, cfg: { env: row.daraja_env, method: row.method, shortcode: row.shortcode, partyB: row.till_or_paybill,
    consumerKey: s.consumer_key, consumerSecret: s.consumer_secret, passkey: s.passkey } };
}

export async function recordEvent(row: { business_id?: string | null; payment_id?: string | null; source: string; event_type: string; event_key?: string | null; raw?: unknown; processing_result?: string }) {
  const { error } = await db().from('payment_events').insert(row);
  if (error && !error.message.includes('duplicate')) console.error('[payment_events]', error.message);
  return !error;
}

export async function confirmPayment(paymentId: string, receipt: string | null, amount: number | null, source: string, actor: string | null = null) {
  const { data, error } = await db().rpc('confirm_payment', { p_payment: paymentId, p_receipt: receipt, p_amount: amount, p_source: source, p_actor: actor });
  if (error) { console.error('[confirm_payment]', error.message); throw new Error('Database error'); }
  return data as { ok: boolean; error?: string; already?: boolean; entitlement_id?: string };
}

export async function failPayment(paymentId: string, status: 'failed' | 'cancelled' | 'expired', reason: string, code: string | null, source: string) {
  return must(await db().rpc('fail_payment', { p_payment: paymentId, p_status: status, p_reason: reason, p_code: code, p_source: source }), 'fail_payment');
}

const STK_QUERY_AFTER_MS = 20_000;
const STK_EXPIRE_AFTER_MS = 5 * 60_000;

/** Resolve a pending STK payment whose callback is late, by asking Daraja directly (using the business's own credentials). */
export async function refreshPendingStk(p: any): Promise<void> {
  if (p.channel !== 'stk' || p.status !== 'pending' || !p.checkout_request_id) return;
  const age = Date.now() - new Date(p.created_at).getTime();
  const lastQ = p.last_provider_query_at ? Date.now() - new Date(p.last_provider_query_at).getTime() : Infinity;
  if (age < STK_QUERY_AFTER_MS || lastQ < 15_000) return;
  await db().from('payments').update({ last_provider_query_at: new Date().toISOString() }).eq('id', p.id);
  const conf = await loadDarajaConfig(p.business_id);
  if (!conf) return;
  try {
    const r = await stkQuery(conf.cfg, p.checkout_request_id);
    if (!r.known) { if (age > STK_EXPIRE_AFTER_MS) await failPayment(p.id, 'expired', 'No response from customer', null, 'stk_query'); return; }
    await recordEvent({ business_id: p.business_id, payment_id: p.id, source: 'stk_query', event_type: 'query_result', raw: r, processing_result: 'received' });
    if (r.resultCode === 0) await confirmPayment(p.id, null, null, 'stk_query');
    else if (r.resultCode === 1032) await failPayment(p.id, 'cancelled', 'Cancelled by customer', '1032', 'stk_query');
    else await failPayment(p.id, 'failed', r.resultDesc || 'Payment failed', String(r.resultCode), 'stk_query');
  } catch (e: any) {
    console.error('[stk_query]', e?.message);
    if (age > STK_EXPIRE_AFTER_MS) await failPayment(p.id, 'expired', 'Could not confirm payment in time', null, 'system');
  }
}

export function effectiveRouterStatus(r: { status: string; last_seen_at: string | null }): string {
  if (r.status === 'connected') {
    const fresh = r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < 3 * 60_000;
    return fresh ? 'connected' : 'offline';
  }
  return r.status;
}
export const routerOnline = (r: { status: string; last_seen_at: string | null }) => effectiveRouterStatus(r) === 'connected';
