/**
 * Database + authorization integration tests. Run against a DISPOSABLE Supabase project (never production):
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:db
 * Skipped automatically when the variables are missing.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL || !ANON || !SVC;
const admin = skip ? (null as any) : createClient(URL!, SVC!, { auth: { persistSession: false } });
const run = Date.now().toString(36);
const ctx: any = {};

async function mkUser(tag: string) {
  const email = `${tag}-${run}@example.test`, password = 'Passw0rd!' + run;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(error);
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password }); assert.ifError(s.error);
  return { id: data.user!.id, client };
}
async function mkBiz(owner: string, slug: string) {
  const { data: b, error } = await admin.from('businesses').insert({ owner_id: owner, name: slug, display_name: slug, slug, status: 'active', portal_mode: 'live' }).select().single(); assert.ifError(error);
  await admin.from('business_members').insert({ business_id: b.id, user_id: owner, role: 'owner' });
  await admin.from('payment_provider_configs').insert({ business_id: b.id });
  const { data: site } = await admin.from('hotspot_sites').insert({ business_id: b.id, name: 'Main' }).select().single();
  const { data: router } = await admin.from('routers').insert({ business_id: b.id, site_id: site.id, name: 'R1', status: 'connected', last_seen_at: new Date().toISOString() }).select().single();
  const { data: pkg } = await admin.from('packages').insert({ business_id: b.id, name: '1h', price_amount: 20, duration_unit: 'hour', duration_value: 1, is_published: true }).select().single();
  return { biz: b, router, pkg };
}
const mkPayment = async (c: any, mac: string, key: string) => (await admin.from('payments').insert({ business_id: c.biz.id, package_id: c.pkg.id, router_id: c.router.id, channel: 'stk', phone: '254712345678', device_mac: mac, amount: 20, purchase_token_hash: key, idempotency_key: key }).select().single()).data;

before(async () => {
  if (skip) return;
  ctx.ua = await mkUser('a'); ctx.ub = await mkUser('b');
  ctx.A = await mkBiz(ctx.ua.id, `biz-a-${run}`); ctx.B = await mkBiz(ctx.ub.id, `biz-b-${run}`);
});

test('slug rules enforced by the database', { skip }, async () => {
  const dup = await admin.from('businesses').insert({ owner_id: ctx.ua.id, name: 'x', display_name: 'x', slug: `BIZ-A-${run}` });
  assert.ok(dup.error, 'case-insensitive duplicate slug must be rejected');
  for (const bad of ['admin', 'api', 'login', 'dashboard', 'settings', 'support', 'Bad Slug', 'a'])
    assert.ok((await admin.from('businesses').insert({ owner_id: ctx.ua.id, name: 'x', display_name: 'x', slug: bad })).error, `${bad} must be rejected`);
});

test('RLS: business A cannot read business B records or secrets', { skip }, async () => {
  const pk = await ctx.ua.client.from('packages').select('id').eq('business_id', ctx.B.biz.id); assert.equal(pk.data?.length ?? 0, 0);
  const own = await ctx.ua.client.from('packages').select('id').eq('business_id', ctx.A.biz.id); assert.equal(own.data?.length, 1);
  const cfg = await ctx.ua.client.from('payment_provider_configs').select('*'); assert.ok(cfg.error || (cfg.data ?? []).length === 0, 'payment configs are not client-readable');
  const rt = await ctx.ua.client.from('routers').select('*'); assert.ok(rt.error || (rt.data ?? []).length === 0, 'routers (token hashes) are not client-readable');
  const w = await ctx.ua.client.from('packages').update({ price_amount: 1 }).eq('id', ctx.B.pkg.id).select(); assert.ok(w.error || (w.data ?? []).length === 0, 'cross-tenant write blocked');
  const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const a = await anon.from('businesses').select('id'); assert.ok(a.error || (a.data ?? []).length === 0, 'anonymous sees nothing');
});

test('confirm_payment is idempotent: repeated callbacks create exactly one entitlement', { skip }, async () => {
  const p = await mkPayment(ctx.A, 'AA:BB:CC:00:00:01', `k1-${run}`);
  const results = await Promise.all(Array.from({ length: 8 }, () => admin.rpc('confirm_payment', { p_payment: p.id, p_receipt: `RCP${run}`.slice(0, 10).toUpperCase(), p_amount: 20, p_source: 'daraja_callback', p_actor: null })));
  results.forEach((r) => assert.ifError(r.error));
  const { data: ents } = await admin.from('access_entitlements').select('id').eq('payment_id', p.id); assert.equal(ents?.length, 1);
  const { data: cmds } = await admin.from('router_commands').select('id').eq('entitlement_id', ents![0].id).eq('type', 'authorize'); assert.equal(cmds?.length, 1);
});

test('amount mismatch is not confirmed; confirmed payment can never be downgraded', { skip }, async () => {
  const p = await mkPayment(ctx.A, 'AA:BB:CC:00:00:02', `k2-${run}`);
  const bad = await admin.rpc('confirm_payment', { p_payment: p.id, p_receipt: 'AMT0000001', p_amount: 5, p_source: 'manual', p_actor: null });
  assert.equal(bad.data.ok, false); assert.equal(bad.data.error, 'amount_mismatch');
  assert.equal((await admin.from('payments').select('status').eq('id', p.id).single()).data!.status, 'pending');
  await admin.rpc('confirm_payment', { p_payment: p.id, p_receipt: 'AMT0000002', p_amount: 20, p_source: 'manual', p_actor: null });
  await admin.rpc('fail_payment', { p_payment: p.id, p_status: 'failed', p_reason: 'router offline', p_code: null, p_source: 'system' });
  assert.equal((await admin.from('payments').select('status').eq('id', p.id).single()).data!.status, 'confirmed');
  const direct = await admin.from('payments').update({ status: 'failed' }).eq('id', p.id); assert.ok(direct.error, 'trigger blocks direct downgrade');
});

test('duplicate M-Pesa receipt cannot confirm two payments', { skip }, async () => {
  const p1 = await mkPayment(ctx.A, 'AA:BB:CC:00:00:03', `k3-${run}`), p2 = await mkPayment(ctx.A, 'AA:BB:CC:00:00:04', `k4-${run}`);
  const r1 = await admin.rpc('confirm_payment', { p_payment: p1.id, p_receipt: 'DUPRCPT001', p_amount: 20, p_source: 'manual', p_actor: null }); assert.equal(r1.data.ok, true);
  const r2 = await admin.rpc('confirm_payment', { p_payment: p2.id, p_receipt: 'DUPRCPT001', p_amount: 20, p_source: 'manual', p_actor: null }); assert.equal(r2.data.ok, false);
});

test('voucher redemption is atomic under concurrency and tenant-scoped', { skip }, async () => {
  const hash = `h-${run}`;
  const { data: batch } = await admin.from('voucher_batches').insert({ business_id: ctx.A.biz.id, package_id: ctx.A.pkg.id, name: 'b', quantity: 1 }).select().single();
  await admin.from('vouchers').insert({ business_id: ctx.A.biz.id, batch_id: batch.id, package_id: ctx.A.pkg.id, code_hash: hash, code_last4: 'ABCD' });
  const attempts = await Promise.all(Array.from({ length: 12 }, (_, i) => admin.rpc('redeem_voucher', { p_business: ctx.A.biz.id, p_code_hash: hash, p_mac: `AA:BB:CC:00:01:${String(i).padStart(2, '0')}`, p_router: ctx.A.router.id, p_idem: `idem-${run}-${i}`, p_token_hash: `t${i}` })));
  const wins = attempts.filter((r) => r.data?.ok === true); assert.equal(wins.length, 1, 'exactly one redemption wins');
  attempts.filter((r) => r.data?.ok === false).forEach((r) => assert.equal(r.data.error, 'used'));
  assert.equal((await admin.from('vouchers').select('use_count,status').eq('code_hash', hash).single()).data!.status, 'redeemed');
  // same idempotency key replays safely
  const replay = await admin.rpc('redeem_voucher', { p_business: ctx.A.biz.id, p_code_hash: hash, p_mac: 'AA:BB:CC:00:01:00', p_router: ctx.A.router.id, p_idem: wins[0] && `idem-${run}-${attempts.indexOf(wins[0])}`, p_token_hash: 'x' });
  assert.equal(replay.data.ok, true); assert.equal(replay.data.already, true);
  // cross-business: same hash looked up under business B finds nothing
  const cross = await admin.rpc('redeem_voucher', { p_business: ctx.B.biz.id, p_code_hash: hash, p_mac: 'AA:BB:CC:00:02:00', p_router: ctx.B.router.id, p_idem: `x-${run}`, p_token_hash: 'x' });
  assert.equal(cross.data.error, 'invalid');
});

test('router command lifecycle: entitlement only becomes active after router ack', { skip }, async () => {
  const p = await mkPayment(ctx.A, 'AA:BB:CC:00:00:05', `k5-${run}`);
  const c = await admin.rpc('confirm_payment', { p_payment: p.id, p_receipt: 'LIFECYC001', p_amount: 20, p_source: 'manual', p_actor: null });
  assert.equal((await admin.from('access_entitlements').select('status').eq('id', c.data.entitlement_id).single()).data!.status, 'pending_authorization');
  const claimed = await admin.rpc('claim_router_commands', { p_router: ctx.A.router.id, p_limit: 50 });
  const cmd = claimed.data.find((x: any) => x.entitlement_id === c.data.entitlement_id); assert.ok(cmd); assert.ok(cmd.seconds >= 3500 && cmd.seconds <= 3601);
  // a router failure keeps the payment confirmed and retries later
  await admin.rpc('ack_router_command', { p_cmd: cmd.id, p_router: ctx.A.router.id, p_ok: false, p_error: 'boom' });
  assert.equal((await admin.from('payments').select('status').eq('id', p.id).single()).data!.status, 'confirmed');
  await admin.from('router_commands').update({ available_at: new Date().toISOString() }).eq('id', cmd.id);
  const again = await admin.rpc('claim_router_commands', { p_router: ctx.A.router.id, p_limit: 50 }); const cmd2 = again.data.find((x: any) => x.id === cmd.id); assert.ok(cmd2);
  await admin.rpc('ack_router_command', { p_cmd: cmd.id, p_router: ctx.A.router.id, p_ok: true, p_error: null });
  const e = (await admin.from('access_entitlements').select('status,expires_at').eq('id', c.data.entitlement_id).single()).data!; assert.equal(e.status, 'active'); assert.ok(new Date(e.expires_at).getTime() > Date.now());
  // another router cannot ack this command
  assert.equal((await admin.rpc('ack_router_command', { p_cmd: cmd.id, p_router: ctx.B.router.id, p_ok: true, p_error: null })).data.error, 'not_found');
  // expiry sweep queues a revoke
  await admin.from('access_entitlements').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', c.data.entitlement_id);
  await admin.rpc('sweep_expirations', { p_router: ctx.A.router.id });
  assert.equal((await admin.from('access_entitlements').select('status').eq('id', c.data.entitlement_id).single()).data!.status, 'expired');
  const rv = await admin.from('router_commands').select('id').eq('entitlement_id', c.data.entitlement_id).eq('type', 'revoke'); assert.equal(rv.data?.length, 1);
});

test('audit log is append-only', { skip }, async () => {
  const { data } = await admin.from('audit_logs').select('id').eq('business_id', ctx.A.biz.id).limit(1);
  assert.ok(data?.length);
  assert.ok((await admin.from('audit_logs').update({ action: 'tampered' }).eq('id', data![0].id)).error);
  assert.ok((await admin.from('audit_logs').delete().eq('id', data![0].id)).error);
});
