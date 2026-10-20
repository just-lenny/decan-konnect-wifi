import { db } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, v } from '@/lib/server/http';
import { randomToken, sha256 } from '@/lib/crypto';
import { buildSetupScript } from '@/lib/routeros';

export const dynamic = 'force-dynamic';

/** Issues a NEW enrollment token and returns the router setup script. The token is shown once; the previous token stops working. */
export const POST = handler<{ id: string; rid: string }>(async (req, { id, rid }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  v.uuid(rid, 'rid');
  const biz = (await db().from('businesses').select('slug').eq('id', id).single()).data!;
  const r = (await db().from('routers').select('id,public_id').eq('id', rid).eq('business_id', id).maybeSingle()).data;
  if (!r) throw new ApiError(404, 'not_found', 'Router not found.');
  const token = randomToken(32);
  await db().from('routers').update({ agent_token_hash: sha256(token), status: 'configuration_pending', serial_number: null, last_seen_at: null, last_error: null }).eq('id', rid);
  await audit(id, user.id, 'router.token_issued', 'router', rid);
  return ok({ script: buildSetupScript({ base: env.baseUrl, slug: biz.slug, routerPublicId: r.public_id, token }), note: 'Shown once. Generating again invalidates this script.' });
});

export const GET = handler<{ id: string; rid: string }>(async (req, { id, rid }) => {
  await requireRole(req, v.uuid(id, 'id'));
  const { data: events } = await db().from('router_events').select('type,detail,created_at').eq('business_id', id).eq('router_id', v.uuid(rid, 'rid')).order('created_at', { ascending: false }).limit(30);
  const { count } = await db().from('router_commands').select('id', { count: 'exact', head: true }).eq('router_id', rid).eq('business_id', id).in('status', ['pending', 'sent']);
  return ok({ events: events ?? [], pending_commands: count ?? 0 });
});

export const DELETE = handler<{ id: string; rid: string }>(async (req, { id, rid }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner']);
  const { count } = await db().from('access_entitlements').select('id', { count: 'exact', head: true }).eq('router_id', v.uuid(rid, 'rid')).eq('business_id', id).in('status', ['active', 'pending_authorization']);
  if (count) throw new ApiError(409, 'in_use', 'This router has active customers. Revoke their sessions first.');
  await db().from('routers').update({ agent_token_hash: null, status: 'not_configured' }).eq('id', rid).eq('business_id', id);
  await audit(id, user.id, 'router.disabled', 'router', rid);
  return ok({ disabled: true });
});
