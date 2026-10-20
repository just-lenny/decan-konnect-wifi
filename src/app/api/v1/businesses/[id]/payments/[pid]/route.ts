import { db } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, v } from '@/lib/server/http';
import { confirmPayment, failPayment } from '@/lib/server/payments';
import { isValidReceipt } from '@/lib/formats';

/**
 * Manual verification by the business (Capability A).
 * action=confirm: the admin states the receipt and amount they SAW in their own M-Pesa statement/SMS. Amount must equal the package price.
 * action=reject: the claim could not be found in the statement.
 * action=retry_authorization: re-queue router authorization for a confirmed payment that is still waiting for the router.
 */
export const POST = handler<{ id: string; pid: string }>(async (req, { id, pid }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  v.uuid(pid, 'pid');
  const b = await readJson(req);
  const action = v.oneOf(b.action, 'action', ['confirm', 'reject', 'retry_authorization'] as const);
  const p = (await db().from('payments').select('*').eq('id', pid).eq('business_id', id).maybeSingle()).data;
  if (!p) throw new ApiError(404, 'not_found', 'Payment not found.');

  if (action === 'retry_authorization') {
    if (p.status !== 'confirmed' || !p.entitlement_id) throw new ApiError(409, 'not_confirmed', 'Only confirmed payments can be re-authorized.');
    const { data } = await db().rpc('retry_authorization', { p_ent: p.entitlement_id, p_actor: user.id });
    return ok(data);
  }
  if (action === 'reject') {
    if (p.channel !== 'manual' || p.status !== 'awaiting_verification') throw new ApiError(409, 'invalid_state', 'Only unverified manual claims can be rejected.');
    await failPayment(pid, 'failed', 'Payment could not be verified by the business', null, 'manual');
    await audit(id, user.id, 'payment.rejected', 'payment', pid);
    return ok({ rejected: true });
  }
  if (p.channel !== 'manual' || p.status !== 'awaiting_verification') throw new ApiError(409, 'invalid_state', 'Only unverified manual claims can be confirmed here.');
  const receipt = String(b.receipt ?? '').trim().toUpperCase();
  if (!isValidReceipt(receipt)) throw new ApiError(400, 'invalid_receipt', 'Enter the 10-character M-Pesa code exactly as it appears in your statement.');
  const amount = v.int(b.amount, 'Amount received', 1, 150000) as number;
  const r = await confirmPayment(pid, receipt, amount, 'manual', user.id);
  if (!r.ok) throw new ApiError(409, r.error ?? 'failed', r.error === 'amount_mismatch' ? `Amount received (KES ${amount}) does not match the package price (KES ${p.amount}). Not confirmed.` : r.error === 'duplicate_receipt' ? 'That M-Pesa code has already been used for another payment.' : 'Could not confirm.');
  return ok(r);
});
