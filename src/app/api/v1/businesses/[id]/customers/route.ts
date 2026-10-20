import { db } from '@/lib/server/db';
import { requireRole } from '@/lib/server/auth';
import { handler, ok, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  const { role } = await requireRole(req, v.uuid(id, 'id'));
  const { data } = await db().from('customers').select('id,phone,device_mac,first_seen_at,last_seen_at').eq('business_id', id).order('last_seen_at', { ascending: false }).limit(300);
  // Privacy: staff see masked phone numbers; owners/admins see them in full.
  return ok((data ?? []).map((c) => ({ ...c, phone: c.phone && role === 'staff' ? c.phone.slice(0, 6) + '***' + c.phone.slice(-2) : c.phone })));
});
