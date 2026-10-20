import { db } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, rateLimit, v } from '@/lib/server/http';
import { confirmPayment } from '@/lib/server/payments';
import { isValidReceipt, normalizeKenyanPhone } from '@/lib/formats';

/** Import rows from the business's own M-Pesa statement. Matching claims (same code + exact amount) are confirmed. */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  await rateLimit(`recon:${id}`, 20, 3600);
  const b = await readJson(req, 512_000);
  if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 2000) throw new ApiError(400, 'invalid', 'Provide between 1 and 2000 statement rows.');
  let imported = 0, matched = 0, skipped = 0; const problems: string[] = [];
  for (const row of b.rows) {
    const receipt = String(row.receipt ?? '').trim().toUpperCase(); const amount = Math.round(Number(row.amount));
    if (!isValidReceipt(receipt) || !Number.isFinite(amount) || amount <= 0) { skipped++; continue; }
    const ins = await db().from('reconciliation_entries').upsert({ business_id: id, receipt, amount, phone: row.phone ? normalizeKenyanPhone(String(row.phone)) : null, imported_by: user.id }, { onConflict: 'business_id,receipt', ignoreDuplicates: true }).select('id').maybeSingle();
    if (ins.data) imported++;
    const { data: claim } = await db().from('payments').select('id,amount').eq('business_id', id).eq('claimed_receipt', receipt).eq('status', 'awaiting_verification').limit(1).maybeSingle();
    if (claim) {
      const r = await confirmPayment(claim.id, receipt, amount, 'reconciliation', user.id);
      if (r.ok) { matched++; await db().from('reconciliation_entries').update({ matched_payment_id: claim.id }).eq('business_id', id).eq('receipt', receipt); }
      else problems.push(`${receipt}: ${r.error}`);
    }
  }
  await audit(id, user.id, 'payment.reconciliation_import', 'business', id, { rows: b.rows.length, imported, matched });
  return ok({ imported, matched, skipped, problems });
});
