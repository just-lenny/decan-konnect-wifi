import { db } from '@/lib/server/db';
import { requireRole } from '@/lib/server/auth';
import { handler, ok, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  return ok((await db().from('audit_logs').select('id,action,entity_type,entity_id,actor_type,detail,created_at').eq('business_id', id).order('created_at', { ascending: false }).limit(200)).data ?? []);
});
