import { db } from '@/lib/server/db';
import { requirePlatformAdmin } from '@/lib/server/auth';
import { handler, ok, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  await requirePlatformAdmin(req);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const c = async (q: any) => (await q).count ?? 0;
  const head = (t: string) => db().from(t).select('id', { count: 'exact', head: true });
  const [businesses, pending, suspended, confirmedNoAccess, stuckPending, failedLastHour, failedCommands, offlineRouters, mismatches] = await Promise.all([
    c(head('businesses')), c(head('businesses').eq('status', 'pending')), c(head('businesses').eq('status', 'suspended')),
    c(head('access_entitlements').eq('status', 'pending_authorization').lt('created_at', new Date(Date.now() - 5 * 60_000).toISOString())),
    c(head('payments').eq('status', 'pending').lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString())),
    c(head('payments').in('status', ['failed', 'expired']).gte('created_at', hourAgo)),
    c(head('router_commands').eq('status', 'failed')),
    c(head('routers').eq('status', 'connected').lt('last_seen_at', new Date(Date.now() - 3 * 60_000).toISOString())),
    c(head('payment_events').eq('event_type', 'amount_mismatch')),
  ]);
  const { data: problems } = await db().from('access_entitlements').select('id,business_id,created_at,businesses(display_name)').eq('status', 'pending_authorization').lt('created_at', new Date(Date.now() - 5 * 60_000).toISOString()).limit(50);
  return ok({ businesses, pending_approval: pending, suspended, confirmed_not_authorized: confirmedNoAccess, stuck_pending_payments: stuckPending, failed_last_hour: failedLastHour,
    failed_router_commands: failedCommands, offline_routers: offlineRouters, amount_mismatches: mismatches, problems: problems ?? [] });
});
