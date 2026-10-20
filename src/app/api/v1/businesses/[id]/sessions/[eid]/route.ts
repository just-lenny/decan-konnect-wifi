import { db } from '@/lib/server/db';
import { requireRole } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, v } from '@/lib/server/http';

export const POST = handler<{ id: string; eid: string }>(async (req, { id, eid }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  v.uuid(eid, 'eid');
  const b = await readJson(req);
  const e = (await db().from('access_entitlements').select('id').eq('id', eid).eq('business_id', id).maybeSingle()).data;
  if (!e) throw new ApiError(404, 'not_found', 'Session not found.');
  const { data } = await db().rpc('revoke_entitlement', { p_ent: eid, p_actor: user.id, p_reason: v.str(b.reason || 'Revoked by administrator', 'Reason', { max: 200 }) });
  return ok(data);
});
