import { db } from '@/lib/server/db';
import { authUser } from '@/lib/server/auth';
import { handler, ok, rateLimit } from '@/lib/server/http';
import { validateSlug } from '@/lib/slug';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  const user = await authUser(req);
  await rateLimit(`slugchk:${user.id}`, 60, 60);
  const u = new URL(req.url);
  const slug = (u.searchParams.get('slug') ?? '').toLowerCase();
  const exclude = u.searchParams.get('exclude');
  const err = validateSlug(slug);
  if (err) return ok({ available: false, reason: err });
  const { data } = await db().from('businesses').select('id').ilike('slug', slug).maybeSingle();
  const available = !data || data.id === exclude;
  return ok({ available, reason: available ? null : 'That portal address is already taken.' });
});
