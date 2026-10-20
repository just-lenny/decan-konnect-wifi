import { db, must } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, v } from '@/lib/server/http';
import { parsePackage } from '@/lib/server/package-schema';

export const PATCH = handler<{ id: string; pid: string }>(async (req, { id, pid }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  v.uuid(pid, 'pid');
  const b = await readJson(req);
  // Merge duration fields so a partial update stays valid.
  const cur = (await db().from('packages').select('*').eq('id', pid).eq('business_id', id).maybeSingle()).data;
  if (!cur) throw new ApiError(404, 'not_found', 'Package not found.');
  if ((b.durationUnit !== undefined) !== (b.durationValue !== undefined)) throw new ApiError(400, 'invalid', 'Send duration unit and value together.');
  const row = parsePackage(b, true);
  const upd = must(await db().from('packages').update(row).eq('id', pid).eq('business_id', id).select('*').single(), 'update package');
  await audit(id, user.id, 'package.updated', 'package', pid, { fields: Object.keys(row), price_from: cur.price_amount, price_to: upd.price_amount });
  return ok(upd);
});

// "Delete" archives: sold entitlements and vouchers keep their package reference.
export const DELETE = handler<{ id: string; pid: string }>(async (req, { id, pid }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  v.uuid(pid, 'pid');
  const { data } = await db().from('packages').update({ status: 'archived', is_published: false }).eq('id', pid).eq('business_id', id).select('id').maybeSingle();
  if (!data) throw new ApiError(404, 'not_found', 'Package not found.');
  await audit(id, user.id, 'package.archived', 'package', pid);
  return ok({ archived: true });
});
