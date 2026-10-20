import { db } from '@/lib/server/db';
import { requirePlatformAdmin } from '@/lib/server/auth';
import { handler, ok } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requirePlatformAdmin(req);
  return ok((await db().from('audit_logs').select('id,business_id,action,entity_type,entity_id,actor_type,created_at').order('created_at', { ascending: false }).limit(300)).data ?? []);
});
