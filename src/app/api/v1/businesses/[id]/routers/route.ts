import { db, must } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, v } from '@/lib/server/http';
import { effectiveRouterStatus } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin', 'staff']);
  const { data } = await db().from('routers').select('id,site_id,public_id,name,vendor,model,auth_method,status,last_seen_at,last_error,ros_version,identity,created_at,agent_token_hash').eq('business_id', id).order('created_at');
  // Never return the token hash; report only whether a token has been issued.
  return ok((data ?? []).map(({ agent_token_hash, ...r }) => ({ ...r, token_issued: !!agent_token_hash, effective_status: effectiveRouterStatus(r) })));
});
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const b = await readJson(req);
  const site = (await db().from('hotspot_sites').select('id').eq('id', v.uuid(b.siteId, 'siteId')).eq('business_id', id).maybeSingle()).data;
  if (!site) throw new ApiError(404, 'not_found', 'Site not found.');
  const vendor = v.oneOf(b.vendor ?? 'mikrotik', 'Vendor', ['mikrotik'] as const); // adapter layer: add vendors here
  const r = must(await db().from('routers').insert({ business_id: id, site_id: site.id, name: v.str(b.name, 'Router name', { min: 2, max: 120 }), vendor, model: b.model ? v.str(b.model, 'Model', { max: 60 }) : null,
    status: 'awaiting_enrollment' }).select('id,public_id,name,status').single());
  await audit(id, user.id, 'router.created', 'router', r.id);
  return ok(r, 201);
});
