import { db, must } from '@/lib/server/db';
import { requireRole } from '@/lib/server/auth';
import { handler, ok, readJson, rateLimit, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'));
  return ok((await db().from('support_messages').select('*').eq('business_id', id).order('created_at', { ascending: false }).limit(100)).data ?? []);
});
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'));
  await rateLimit(`support:${user.id}`, 10, 3600);
  const b = await readJson(req);
  return ok(must(await db().from('support_messages').insert({ business_id: id, user_id: user.id, subject: v.str(b.subject, 'Subject', { min: 3, max: 150 }), body: v.str(b.body, 'Message', { min: 3, max: 4000 }) }).select('*').single()), 201);
});
