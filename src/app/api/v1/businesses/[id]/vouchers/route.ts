import { db, must } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, rateLimit, v } from '@/lib/server/http';
import { generateVoucherCode, hashVoucher } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'));
  const u = new URL(req.url);
  let q = db().from('vouchers').select('id,batch_id,package_id,code_last4,status,max_uses,use_count,expires_at,sale_class,price_amount,created_at,voucher_batches(name),packages(name)').eq('business_id', id).order('created_at', { ascending: false }).limit(500);
  const st = u.searchParams.get('status'); if (st) q = q.eq('status', st);
  const batch = u.searchParams.get('batch'); if (batch) q = q.eq('batch_id', v.uuid(batch, 'batch'));
  const search = u.searchParams.get('q')?.replace(/[^A-Za-z0-9]/g, '').slice(0, 4); if (search) q = q.ilike('code_last4', `%${search}%`);
  const { data: rows } = await q;
  const { data: batches } = await db().from('voucher_batches').select('id,name,quantity,created_at,package_id').eq('business_id', id).order('created_at', { ascending: false }).limit(100);
  return ok({ vouchers: rows ?? [], batches: batches ?? [] });
});

/** Generates a batch. Plaintext codes are returned ONCE in this response (for print/CSV); only HMAC hashes are stored. */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const { user } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin', 'staff']);
  await rateLimit(`vgen:${id}`, 30, 3600);
  const b = await readJson(req);
  const packageId = v.uuid(b.packageId, 'packageId');
  const qty = v.int(b.quantity, 'Quantity', 1, 500) as number;
  const maxUses = v.int(b.maxUses ?? 1, 'Uses per voucher', 1, 100) as number;
  const pkg = (await db().from('packages').select('id,name,status').eq('id', packageId).eq('business_id', id).maybeSingle()).data;
  if (!pkg || pkg.status === 'archived') throw new ApiError(404, 'not_found', 'Package not found.');
  let siteId: string | null = null, routerId: string | null = null;
  if (b.routerId) { const r = (await db().from('routers').select('id,site_id').eq('id', v.uuid(b.routerId, 'routerId')).eq('business_id', id).maybeSingle()).data; if (!r) throw new ApiError(404, 'not_found', 'Router not found.'); routerId = r.id; siteId = r.site_id; }
  else if (b.siteId) { const s = (await db().from('hotspot_sites').select('id').eq('id', v.uuid(b.siteId, 'siteId')).eq('business_id', id).maybeSingle()).data; if (!s) throw new ApiError(404, 'not_found', 'Site not found.'); siteId = s.id; }
  const saleClass = v.oneOf(b.saleClass ?? 'free', 'Sale class', ['free', 'sold', 'promo'] as const);
  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (expiresAt && (isNaN(expiresAt.getTime()) || expiresAt <= new Date())) throw new ApiError(400, 'invalid', 'Voucher expiry must be in the future.');
  const name = v.str(b.name || `Batch ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, 'Batch name', { max: 80 });

  const batch = must(await db().from('voucher_batches').insert({ business_id: id, package_id: packageId, name, quantity: qty, sale_class: saleClass,
    price_amount: b.priceAmount ? v.int(b.priceAmount, 'Price', 0, 150000) : null, max_uses: maxUses, expires_at: expiresAt?.toISOString() ?? null,
    site_id: siteId, router_id: routerId, device_restricted: b.deviceRestricted === true, created_by: user.id }).select('*').single(), 'create batch');

  const codes: string[] = []; const seen = new Set<string>();
  while (codes.length < qty) { const c = generateVoucherCode(); if (!seen.has(c)) { seen.add(c); codes.push(c); } }
  const rows = codes.map((c) => ({ business_id: id, batch_id: batch.id, package_id: packageId, code_hash: hashVoucher(id, c, env.pepper), code_last4: c.slice(-4).replace('-', ''),
    max_uses: maxUses, expires_at: expiresAt?.toISOString() ?? null, site_id: siteId, router_id: routerId, device_restricted: b.deviceRestricted === true,
    sale_class: saleClass, price_amount: batch.price_amount, created_by: user.id }));
  const { error } = await db().from('vouchers').insert(rows);
  if (error) { await db().from('voucher_batches').delete().eq('id', batch.id); throw new Error('voucher insert failed'); }
  await audit(id, user.id, 'voucher.batch_created', 'voucher_batch', batch.id, { quantity: qty, package: pkg.name }); // never logs codes
  return ok({ batch, packageName: pkg.name, codes }, 201);
});
