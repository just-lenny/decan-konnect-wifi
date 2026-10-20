import { db } from '@/lib/server/db';
import { handler, ok, ApiError, rateLimit, clientIp, v } from '@/lib/server/http';
import { sha256 } from '@/lib/crypto';
import { refreshPendingStk } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

/** Customer polls with the secret purchase-session key (the idempotency key they generated). Other customers' payments are unreachable. */
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await rateLimit(`paystat:${clientIp(req)}`, 90, 60);
  v.uuid(id, 'id');
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const { data: p } = await db().from('payments').select('*').eq('id', id).maybeSingle();
  if (!p || !token || sha256(token) !== p.purchase_token_hash) throw new ApiError(404, 'not_found', 'Payment not found.');
  await refreshPendingStk(p);
  const fresh = (await db().from('payments').select('status,failure_reason,entitlement_id').eq('id', id).single()).data!;
  let access = null;
  if (fresh.entitlement_id) {
    const e = (await db().from('access_entitlements').select('id,status,expires_at,package_name,data_limit_mb').eq('id', fresh.entitlement_id).single()).data;
    access = e ? { entitlement_id: e.id, status: e.status, expires_at: e.expires_at, package_name: e.package_name } : null;
  }
  return ok({ status: fresh.status, failure_reason: fresh.failure_reason, access });
});
