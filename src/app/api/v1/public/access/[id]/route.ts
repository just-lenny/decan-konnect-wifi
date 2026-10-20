import { db } from '@/lib/server/db';
import { handler, ok, ApiError, rateLimit, clientIp, v } from '@/lib/server/http';
import { sha256 } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/** Connection status for one entitlement. Requires the secret purchase-session key. */
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await rateLimit(`access:${clientIp(req)}`, 90, 60);
  v.uuid(id, 'id');
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const { data: e } = await db().from('access_entitlements').select('*').eq('id', id).maybeSingle();
  if (!e || !token || sha256(token) !== e.access_token_hash) throw new ApiError(404, 'not_found', 'Not found.');
  const { data: s } = await db().from('access_sessions').select('bytes_in,bytes_out,uptime_seconds,status').eq('entitlement_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const used = s ? Number(s.bytes_in) + Number(s.bytes_out) : 0;
  return ok({
    status: e.status, package_name: e.package_name, expires_at: e.expires_at,
    remaining_seconds: e.expires_at ? Math.max(0, Math.floor((new Date(e.expires_at).getTime() - Date.now()) / 1000)) : null,
    data_remaining_mb: e.data_limit_mb ? Math.max(0, e.data_limit_mb - Math.floor(used / 1048576)) : null,
    // 'active' only once the ROUTER has confirmed; until then the customer sees "connecting".
    connected: e.status === 'active',
  });
});
