import { db, must } from '@/lib/server/db';
import { requireRole } from '@/lib/server/auth';
import { handler, ok, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'));
  const stats = must(await db().rpc('business_overview', { p_business: id }));
  const { data: recent } = await db().from('payments').select('id,status,channel,amount,phone,created_at,mpesa_receipt,claimed_receipt').eq('business_id', id).eq('is_test', false).order('created_at', { ascending: false }).limit(10);
  return ok({ stats, recent: (recent ?? []).map((p) => ({ ...p, phone: p.phone ? p.phone.slice(0, 6) + '***' + p.phone.slice(-2) : null })) });
});
