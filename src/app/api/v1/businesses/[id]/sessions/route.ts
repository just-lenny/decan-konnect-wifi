import { db } from '@/lib/server/db';
import { requireRole } from '@/lib/server/auth';
import { handler, ok, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'));
  const { data } = await db().from('access_entitlements').select('id,status,source,package_name,device_mac,activated_at,expires_at,created_at,router_id,routers(name),access_sessions(status,bytes_in,bytes_out,uptime_seconds)')
    .eq('business_id', id).in('status', ['active', 'pending_authorization']).order('created_at', { ascending: false }).limit(300);
  return ok(data ?? []);
});
