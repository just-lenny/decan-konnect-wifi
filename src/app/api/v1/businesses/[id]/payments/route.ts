import { db } from '@/lib/server/db';
import { requireRole } from '@/lib/server/auth';
import { handler, ok, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'));
  const u = new URL(req.url);
  let q = db().from('payments').select('id,status,channel,amount,currency,phone,mpesa_receipt,claimed_receipt,failure_reason,created_at,confirmed_at,confirmation_source,entitlement_id,is_test,packages(name),access_entitlements!payments_entitlement_fk(status)')
    .eq('business_id', id).order('created_at', { ascending: false }).limit(300);
  const st = u.searchParams.get('status'); if (st) q = q.eq('status', st);
  const { data } = await q;
  return ok(data ?? []);
});
