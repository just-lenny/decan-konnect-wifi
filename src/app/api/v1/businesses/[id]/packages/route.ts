import { db, must } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, v } from '@/lib/server/http';
import { computeExpiry } from '@/lib/durations';
import { parsePackage } from '@/lib/server/package-schema';

export const dynamic = 'force-dynamic';

export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'));
  const { data } = await db().from('packages').select('*').eq('business_id', id).neq('status', 'archived').order('sort_order').order('price_amount');
  // Show the admin the expiry a purchase made right now would get.
  return ok((data ?? []).map((p) => ({ ...p, expected_expiry_if_bought_now: computeExpiry(new Date(), p.duration_unit, p.duration_value).toISOString() })));
});

export const POST = handler<{ id: string }>(async (req, { id }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const row = parsePackage(await readJson(req));
  const p = must(await db().from('packages').insert({ ...row, business_id: id }).select('*').single(), 'create package');
  await audit(id, user.id, 'package.created', 'package', p.id, { name: p.name, price: p.price_amount });
  return ok(p, 201);
});
