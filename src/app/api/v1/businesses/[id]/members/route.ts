import { db } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const { data } = await db().from('business_members').select('user_id,role,created_at').eq('business_id', id);
  const out = [];
  for (const m of data ?? []) { const u = await db().auth.admin.getUserById(m.user_id); out.push({ ...m, email: u.data.user?.email ?? null }); }
  return ok(out);
});
/** Add an existing, registered user (by email) as staff or admin. Only the owner may grant 'admin'. */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const { user, role } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const b = await readJson(req);
  const newRole = v.oneOf(b.role, 'role', ['admin', 'staff'] as const);
  if (newRole === 'admin' && role !== 'owner') throw new ApiError(403, 'forbidden', 'Only the owner can add administrators.');
  const email = v.str(b.email, 'Email', { max: 200 }).toLowerCase();
  const list = await db().auth.admin.listUsers({ perPage: 1000 });
  const target = list.data.users.find((u) => u.email?.toLowerCase() === email);
  if (!target) throw new ApiError(404, 'not_registered', 'No account with that email. Ask them to register at the sign-up page first.');
  const { error } = await db().from('business_members').upsert({ business_id: id, user_id: target.id, role: newRole }, { onConflict: 'business_id,user_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await audit(id, user.id, 'member.added', 'member', target.id, { role: newRole });
  return ok({ added: true }, 201);
});
export const DELETE = handler<{ id: string }>(async (req, { id }) => {
  const { user, role } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const uid = v.uuid(new URL(req.url).searchParams.get('user'), 'user');
  const t = (await db().from('business_members').select('role').eq('business_id', id).eq('user_id', uid).maybeSingle()).data;
  if (!t) throw new ApiError(404, 'not_found', 'Member not found.');
  if (t.role === 'owner') throw new ApiError(403, 'forbidden', 'The owner cannot be removed.');
  if (t.role === 'admin' && role !== 'owner') throw new ApiError(403, 'forbidden', 'Only the owner can remove administrators.');
  await db().from('business_members').delete().eq('business_id', id).eq('user_id', uid);
  await audit(id, user.id, 'member.removed', 'member', uid);
  return ok({ removed: true });
});
