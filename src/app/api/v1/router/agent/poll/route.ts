import { db } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { handler, readJson, rateLimit, ApiError } from '@/lib/server/http';
import { authRouter } from '@/lib/server/router-auth';
import { buildCommandScript, type RouterCmd } from '@/lib/routeros';

export const dynamic = 'force-dynamic';

const text = (s: string, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Router heartbeat + accounting in, RouterOS command script out. */
export const POST = handler(async (req) => {
  const { router, token } = await authRouter(req);
  await rateLimit(`poll:${router.id}`, 20, 60);
  const body = await readJson(req, 256_000);
  const serial = String(body.serial ?? '').slice(0, 64);

  // Router identity binding: first poll records the serial; a different device using the same token is rejected.
  if (router.serial_number && serial && router.serial_number !== serial && router.serial_number !== 'unknown') {
    await db().from('routers').update({ status: 'authentication_failure', last_error: 'Router identity changed (serial mismatch)' }).eq('id', router.id);
    await db().from('router_events').insert({ business_id: router.business_id, router_id: router.id, type: 'identity_mismatch', detail: { expected: router.serial_number, got: serial } });
    throw new ApiError(403, 'identity_mismatch', 'Router identity mismatch');
  }
  const first = router.status !== 'connected' || !router.last_seen_at;
  await db().from('routers').update({
    status: 'connected', last_seen_at: new Date().toISOString(), last_error: null,
    serial_number: router.serial_number ?? (serial || null), identity: String(body.identity ?? '').slice(0, 80), ros_version: String(body.version ?? '').slice(0, 30),
  }).eq('id', router.id);
  if (first) await db().from('router_events').insert({ business_id: router.business_id, router_id: router.id, type: 'connected', detail: { serial, version: body.version } });

  const acc = Array.isArray(body.accounting) ? body.accounting.slice(0, 500) : [];
  if (acc.length) await db().rpc('apply_accounting', { p_router: router.id, p_rows: acc });
  await db().rpc('sweep_expirations', { p_router: router.id });
  const { data: cmds, error } = await db().rpc('claim_router_commands', { p_router: router.id, p_limit: 25 });
  if (error) { console.error('[claim]', error.message); return text('# error\n', 500); }

  const base = `${env.baseUrl}/api/v1/router/agent`;
  return text(buildCommandScript((cmds ?? []) as RouterCmd[], base, token));
});
