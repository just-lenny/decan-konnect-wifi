import { db, must } from '@/lib/server/db';
import { authUser, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, rateLimit, v } from '@/lib/server/http';
import { slugify, validateSlug } from '@/lib/slug';

export const POST = handler(async (req) => {
  const user = await authUser(req);
  await rateLimit(`bizcreate:${user.id}`, 5, 3600);
  const b = await readJson(req);
  const name = v.str(b.name, 'Business name', { min: 2, max: 120 });
  const slug = b.slug ? String(b.slug) : slugify(name);
  const err = validateSlug(slug);
  if (err) throw new ApiError(400, 'invalid_slug', err);
  const { data: taken } = await db().from('businesses').select('id').ilike('slug', slug).maybeSingle();
  if (taken) throw new ApiError(409, 'slug_taken', 'That portal address is already taken.');
  const biz = must(await db().from('businesses').insert({
    owner_id: user.id, name, display_name: v.str(b.displayName || name, 'Display name', { min: 2, max: 120 }), slug,
    category: v.str(b.category || 'cybercafe', 'Category', { max: 40 }), phone: b.phone ? v.str(b.phone, 'Phone', { max: 20 }) : null,
  }).select('*').single(), 'create business');
  await db().from('business_members').insert({ business_id: biz.id, user_id: user.id, role: 'owner' });
  await db().from('payment_provider_configs').insert({ business_id: biz.id });
  await audit(biz.id, user.id, 'business.created', 'business', biz.id, { slug });
  return ok(biz, 201);
});
