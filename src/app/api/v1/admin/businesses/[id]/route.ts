import { db } from '@/lib/server/db';
import { requirePlatformAdmin, audit } from '@/lib/server/auth';
import { handler, ok, readJson, v } from '@/lib/server/http';

/** Approve / suspend. Super-admin sees operational status only, never customer payments detail or secrets. */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const admin = await requirePlatformAdmin(req);
  const b = await readJson(req);
  const status = v.oneOf(b.status, 'status', ['active', 'suspended', 'pending'] as const);
  const upd: any = { status }; if (status === 'suspended') upd.portal_mode = 'draft';
  await db().from('businesses').update(upd).eq('id', v.uuid(id, 'id'));
  await audit(id, admin.id, `admin.business_${status}`, 'business', id, { reason: String(b.reason ?? '').slice(0, 300) }, 'platform_admin');
  return ok({ status });
});
