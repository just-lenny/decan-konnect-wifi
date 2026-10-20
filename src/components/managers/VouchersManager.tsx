'use client';
import { useState } from 'react';
import { api, useApi, downloadCsv } from '@/lib/client/api';
import { Badge, Empty, ErrorBox, Field, Loading, when, useToast, Confirm } from '../ui';
import { useBiz } from '../Shell';

export function VouchersManager() {
  const { biz, role } = useBiz();
  const [status, setStatus] = useState(''); const [q, setQ] = useState(''); const [batch, setBatch] = useState('');
  const qs = new URLSearchParams({ ...(status && { status }), ...(q && { q }), ...(batch && { batch }) }).toString();
  const { data, loading, error, reload } = useApi<any>(`/businesses/${biz.id}/vouchers?${qs}`);
  const pk = useApi<any[]>(`/businesses/${biz.id}/packages`); const rt = useApi<any[]>(`/businesses/${biz.id}/routers`);
  const [f, setF] = useState({ packageId: '', quantity: 10, name: '', maxUses: 1, saleClass: 'free', routerId: '', expiresAt: '', deviceRestricted: false });
  const [gen, setGen] = useState<{ codes: string[]; packageName: string; name: string } | null>(null); const toast = useToast(); const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api<any>(`/businesses/${biz.id}/vouchers`, { method: 'POST', body: { ...f, quantity: Number(f.quantity), maxUses: Number(f.maxUses), routerId: f.routerId || undefined, expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : undefined } });
      setGen({ codes: r.codes, packageName: r.packageName, name: r.batch.name }); toast.ok(`${r.codes.length} vouchers created. Save or print them now: codes are not stored in readable form.`); reload();
    } catch (e: any) { toast.err(e.message); }
    setBusy(false);
  };
  return (<div>
    {toast.node}
    <div className="card mb noprint"><h2>Generate vouchers</h2>
      <div className="grid g2">
        <Field label="Package"><select value={f.packageId} onChange={(e) => setF({ ...f, packageId: e.target.value })}><option value="">Select…</option>{pk.data?.filter((p) => p.status === 'active').map((p) => <option key={p.id} value={p.id}>{p.name} (KES {p.price_amount})</option>)}</select></Field>
        <Field label="How many (1-500)"><input type="number" min={1} max={500} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} /></Field>
        <Field label="Batch name (optional)"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Weekend promo" /></Field>
        <Field label="Classification"><select value={f.saleClass} onChange={(e) => setF({ ...f, saleClass: e.target.value })}><option value="free">Free / complimentary</option><option value="sold">Sold over the counter</option><option value="promo">Promotion</option></select></Field>
        <Field label="Uses per voucher" hint="1 = single use. Higher values create explicit multi-use vouchers."><input type="number" min={1} max={100} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: Number(e.target.value) })} /></Field>
        <Field label="Redeem before (optional)"><input type="datetime-local" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></Field>
        <Field label="Restrict to a router (optional)"><select value={f.routerId} onChange={(e) => setF({ ...f, routerId: e.target.value })}><option value="">Any of my routers</option>{rt.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <Field label="Lock to first device used"><select value={f.deviceRestricted ? 'y' : 'n'} onChange={(e) => setF({ ...f, deviceRestricted: e.target.value === 'y' })}><option value="n">No</option><option value="y">Yes</option></select></Field>
      </div>
      <button className="btn" disabled={busy || !f.packageId} onClick={generate}>Generate</button>
    </div>
    {gen && (<div className="card mb"><div className="row between noprint"><h2>{gen.name}: {gen.codes.length} codes</h2><div className="row">
      <button className="btn alt sm" onClick={() => downloadCsv(`vouchers-${gen.name}.csv`, [['code', 'package'], ...gen.codes.map((c) => [c, gen.packageName])])}>Download CSV</button>
      <button className="btn alt sm" onClick={() => window.print()}>Print sheet</button><button className="btn alt sm" onClick={() => setGen(null)}>Done</button></div></div>
      <div className="alert warn noprint">These codes are shown once. Only encrypted hashes are stored, so they cannot be re-exported later.</div>
      <div className="vgrid grid g4">{gen.codes.map((c) => <div className="vcard card" key={c}><div className="small muted">{biz.display_name}</div><code>{c}</code><div className="small">{gen.packageName}</div></div>)}</div></div>)}
    <div className="card noprint"><div className="row between mb"><h2 style={{ margin: 0 }}>Vouchers</h2>
      <div className="row"><input style={{ width: 120 }} placeholder="Last 4…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search last four characters" />
        <select style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{['unused', 'active', 'redeemed', 'expired', 'revoked'].map((s) => <option key={s}>{s}</option>)}</select>
        <select style={{ width: 170 }} value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Batch"><option value="">All batches</option>{data?.batches?.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div></div>
      <ErrorBox msg={error} />{loading ? <Loading /> : !data?.vouchers?.length ? <Empty>No vouchers match.</Empty> : (
        <div className="tablewrap"><table><thead><tr><th>Code</th><th>Batch</th><th>Package</th><th>Status</th><th>Uses</th><th>Class</th><th>Redeem before</th><th></th></tr></thead><tbody>
          {data.vouchers.map((v: any) => (<tr key={v.id}><td><code>••••-••••-{v.code_last4}</code></td><td>{v.voucher_batches?.name}</td><td>{v.packages?.name}</td><td><Badge s={v.status} /></td><td>{v.use_count}/{v.max_uses}</td><td>{v.sale_class}</td><td className="small">{when(v.expires_at)}</td>
            <td>{role !== 'staff' && ['unused', 'active'].includes(v.status) && <Confirm small danger label="Revoke" message="Revoke this voucher? It can no longer be redeemed." onYes={async () => { await api(`/businesses/${biz.id}/vouchers/${v.id}`, { method: 'DELETE' }); reload(); }} />}</td></tr>))}
        </tbody></table></div>)}
    </div>
  </div>);
}
