import { db } from '@/lib/server/db';
import { requirePlatformAdmin } from '@/lib/server/auth';
import { handler, ok } from '@/lib/server/http';
import { effectiveRouterStatus } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requirePlatformAdmin(req);
  const { data: biz } = await db().from('businesses').select('id,name,display_name,slug,category,status,portal_mode,setup_step,setup_completed_at,created_at,phone').order('created_at', { ascending: false }).limit(500);
  const { data: routers } = await db().from('routers').select('business_id,status,last_seen_at');
  const { data: cfg } = await db().from('payment_provider_configs').select('business_id,status');
  return ok((biz ?? []).map((b) => ({
    ...b,
    routers: (routers ?? []).filter((r) => r.business_id === b.id).map(effectiveRouterStatus),
    payment_status: cfg?.find((c) => c.business_id === b.id)?.status ?? 'not_configured',
  })));
});
