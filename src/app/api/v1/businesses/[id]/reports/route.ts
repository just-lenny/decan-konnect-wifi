import { db } from '@/lib/server/db';
import { requireRole } from '@/lib/server/auth';
import { handler, ok, v } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days') ?? 30) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: pay } = await db().from('payments').select('amount,confirmed_at,channel,package_id,packages(name)').eq('business_id', id).eq('status', 'confirmed').eq('is_test', false).gte('confirmed_at', since).limit(20000);
  const byDay: Record<string, number> = {}, byPkg: Record<string, { count: number; revenue: number }> = {}, byChannel: Record<string, number> = {};
  let total = 0;
  for (const p of pay ?? []) {
    const d = new Date(new Date(p.confirmed_at).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
    byDay[d] = (byDay[d] ?? 0) + p.amount; total += p.amount; byChannel[p.channel] = (byChannel[p.channel] ?? 0) + p.amount;
    const n = (p as any).packages?.name ?? 'Unknown'; byPkg[n] = { count: (byPkg[n]?.count ?? 0) + 1, revenue: (byPkg[n]?.revenue ?? 0) + p.amount };
  }
  const { count: vouchersRedeemed } = await db().from('voucher_redemptions').select('id', { count: 'exact', head: true }).eq('business_id', id).gte('created_at', since);
  return ok({ days, total, payments: pay?.length ?? 0, vouchersRedeemed: vouchersRedeemed ?? 0, byDay, byPackage: byPkg, byChannel });
});
