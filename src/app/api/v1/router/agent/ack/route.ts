import { db } from '@/lib/server/db';
import { handler, readJson, ok, v, rateLimit } from '@/lib/server/http';
import { authRouter } from '@/lib/server/router-auth';

export const dynamic = 'force-dynamic';

/** The router confirms it applied (or failed to apply) a command. Only now does the entitlement become 'active'. */
export const POST = handler(async (req) => {
  const { router } = await authRouter(req);
  await rateLimit(`ack:${router.id}`, 120, 60);
  const b = await readJson(req, 4_000);
  const { data, error } = await db().rpc('ack_router_command', { p_cmd: v.uuid(b.cmd, 'cmd'), p_router: router.id, p_ok: b.ok === true, p_error: typeof b.error === 'string' ? b.error : null });
  if (error) throw new Error(error.message);
  return ok(data);
});
