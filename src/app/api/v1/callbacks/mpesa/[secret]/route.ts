import { db } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { handler, readJson, rateLimit, clientIp } from '@/lib/server/http';
import { parseCallback, stkQuery } from '@/lib/mpesa';
import { loadDarajaConfig, recordEvent, confirmPayment, failPayment } from '@/lib/server/payments';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const ACK = () => NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });

/**
 * Per-business callback URL: the unguessable path secret identifies the receiving business.
 * Safaricom does not sign callbacks, so a success is additionally verified with STK Query (MPESA_VERIFY_CALLBACK_WITH_QUERY).
 */
export const POST = handler<{ secret: string }>(async (req, { secret }) => {
  await rateLimit(`cb:${clientIp(req)}`, 300, 60);
  const body = await readJson(req, 32_000);
  const { data: cfg } = await db().from('payment_provider_configs').select('business_id').eq('callback_secret', secret).maybeSingle();
  if (!cfg) return ACK(); // unknown secret: reveal nothing
  const cb = parseCallback(body);
  if (!cb) { await recordEvent({ business_id: cfg.business_id, source: 'daraja_callback', event_type: 'malformed', raw: body, processing_result: 'ignored' }); return ACK(); }

  const eventKey = `${cfg.business_id}:${cb.checkoutRequestId}:${cb.resultCode}`;
  const { data: pay } = await db().from('payments').select('*').eq('business_id', cfg.business_id).eq('checkout_request_id', cb.checkoutRequestId).maybeSingle();
  const first = await recordEvent({ business_id: cfg.business_id, payment_id: pay?.id ?? null, source: 'daraja_callback', event_type: 'stk_callback', event_key: eventKey, raw: body, processing_result: pay ? 'received' : 'no_matching_payment' });
  if (!first || !pay) return ACK(); // duplicate delivery or unknown checkout id

  if (cb.resultCode === 0) {
    if (cb.amount !== undefined && cb.amount !== pay.amount) {
      await recordEvent({ business_id: cfg.business_id, payment_id: pay.id, source: 'daraja_callback', event_type: 'amount_mismatch', raw: { expected: pay.amount, got: cb.amount }, processing_result: 'rejected' });
      return ACK();
    }
    if (env.verifyCallbacks) {
      const conf = await loadDarajaConfig(cfg.business_id);
      try {
        const q = conf ? await stkQuery(conf.cfg, cb.checkoutRequestId) : null;
        if (!q || !q.known || q.resultCode !== 0) {
          // Not independently confirmed: leave pending; status polling/STK query will resolve it.
          await db().from('payment_events').update({ processing_result: 'unverified_left_pending' }).eq('event_key', eventKey);
          await db().from('payments').update({ last_provider_query_at: null }).eq('id', pay.id);
          return ACK();
        }
      } catch { await db().from('payment_events').update({ processing_result: 'verification_error_left_pending' }).eq('event_key', eventKey); return ACK(); }
    }
    const r = await confirmPayment(pay.id, cb.receipt ?? null, cb.amount ?? null, 'daraja_callback');
    await db().from('payment_events').update({ processing_result: r.ok ? (r.already ? 'duplicate_ignored' : 'confirmed') : `rejected:${r.error}` }).eq('event_key', eventKey);
  } else if (cb.resultCode === 1032) {
    await failPayment(pay.id, 'cancelled', 'Cancelled by customer', '1032', 'daraja_callback');
  } else {
    await failPayment(pay.id, 'failed', cb.resultDesc || 'Payment failed', String(cb.resultCode), 'daraja_callback');
  }
  return ACK();
});
