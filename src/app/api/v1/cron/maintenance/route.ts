import { db } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { handler, ok, ApiError } from '@/lib/server/http';
import { failPayment } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

/** Daily safety net (the router poll also sweeps per router every ~15s). Protected by CRON_SECRET. */
export const GET = handler(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) throw new ApiError(401, 'unauthorized', 'Unauthorized');
  const swept = (await db().rpc('sweep_expirations', {})).data;
  const stale = (await db().from('payments').select('id').eq('status', 'pending').lt('created_at', new Date(Date.now() - 15 * 60_000).toISOString()).limit(200)).data ?? [];
  for (const p of stale) await failPayment(p.id, 'expired', 'No confirmation received', null, 'system');
  await db().from('rate_limits').delete().lt('window_start', new Date(Date.now() - 86_400_000).toISOString());
  await db().from('router_commands').delete().in('status', ['acked', 'failed']).lt('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
  return ok({ expired_entitlements: swept, expired_payments: stale.length });
});
