import { db, must } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, readJson, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'));
  return ok((await db().from('hotspot_sites').select('*').eq('business_id', id).order('created_at')).data ?? []);
});
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const b = await readJson(req);
  const s = must(await db().from('hotspot_sites').insert({ business_id: id, name: v.str(b.name, 'Site name', { min: 2, max: 120 }), location: b.location ? v.str(b.location, 'Location', { max: 200 }) : null,
    network_model: v.oneOf(b.networkModel ?? 'independent', 'Network model', ['independent', 'central'] as const), hotspot_name: b.hotspotName ? v.str(b.hotspotName, 'Hotspot name', { max: 60 }) : null }).select('*').single());
  await audit(id, user.id, 'site.created', 'site', s.id);
  return ok(s, 201);
});
