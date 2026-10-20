import { db } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, v } from '@/lib/server/http';

export const DELETE = handler<{ id: string; vid: string }>(async (req, { id, vid }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  v.uuid(vid, 'vid');
  const { data } = await db().from('vouchers').update({ status: 'revoked' }).eq('id', vid).eq('business_id', id).in('status', ['unused', 'active']).select('id').maybeSingle();
  if (!data) throw new ApiError(404, 'not_found', 'Voucher not found or already used.');
  await audit(id, user.id, 'voucher.revoked', 'voucher', vid);
  return ok({ revoked: true });
});
