import { db } from '@/lib/server/db';
import { authUser } from '@/lib/server/auth';
import { handler, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  const user = await authUser(req);
  const { data: m } = await db().from('business_members').select('role, businesses(id,name,display_name,slug,portal_mode,status,setup_step,setup_completed_at,logo_url)').eq('user_id', user.id);
  const { data: pa } = await db().from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  return ok({ user, platformAdmin: !!pa, memberships: (m ?? []).map((x: any) => ({ role: x.role, business: x.businesses })) });
});
