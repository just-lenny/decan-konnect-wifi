'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { Badge, Empty, ErrorBox, Field, Loading, kes, useToast, when, Confirm } from '../ui';
import { useBiz } from '../Shell';

const DURS: [string, number, string][] = [['minute', 15, '15 minutes'], ['minute', 30, '30 minutes'], ['minute', 45, '45 minutes'], ['minute', 60, '60 minutes'], ['hour', 1, '1 hour'], ['hour', 5, '5 hours'], ['hour', 8, '8 hours'], ['hour', 12, '12 hours'], ['day', 1, '1 day'], ['day', 7, '7 days'], ['day', 14, '14 days'], ['month', 1, '1 month']];
const blank = { name: '', description: '', price: '', dur: 'hour:1', dataLimitMb: '', downKbps: '', upKbps: '', maxDevices: 1, promoLabel: '', sortOrder: 0, isPublished: true };

export function PackagesManager() {
  const { biz, role } = useBiz();
  const { data, loading, error, reload } = useApi<any[]>(`/businesses/${biz.id}/packages`);
  const [f, setF] = useState<any>(null); const [editing, setEditing] = useState<string | null>(null); const toast = useToast();
  const canEdit = role !== 'staff';
  const body = (x: any) => { const [u, v] = x.dur.split(':'); return { name: x.name, description: x.description, price: Number(x.price), durationUnit: u, durationValue: Number(v), dataLimitMb: x.dataLimitMb ? Number(x.dataLimitMb) : null, downKbps: x.downKbps ? Number(x.downKbps) : null, upKbps: x.upKbps ? Number(x.upKbps) : null, maxDevices: Number(x.maxDevices), promoLabel: x.promoLabel, sortOrder: Number(x.sortOrder), isPublished: x.isPublished }; };
  const save = async () => {
    try { if (editing) await api(`/businesses/${biz.id}/packages/${editing}`, { method: 'PATCH', body: body(f) }); else await api(`/businesses/${biz.id}/packages`, { method: 'POST', body: body(f) });
      toast.ok('Package saved.'); setF(null); setEditing(null); reload(); } catch (e: any) { toast.err(e.message); }
  };
  const quick = async (p: any, patch: any) => { try { await api(`/businesses/${biz.id}/packages/${p.id}`, { method: 'PATCH', body: patch }); reload(); } catch (e: any) { toast.err(e.message); } };
  if (loading) return <Loading />;
  return (<div>
    {toast.node}<ErrorBox msg={error} />
    {canEdit && !f && <button className="btn mb" onClick={() => { setF({ ...blank }); setEditing(null); }}>+ New package</button>}
    {f && (<div className="card mb"><h2>{editing ? 'Edit package' : 'New package'}</h2>
      <div className="grid g2">
        <Field label="Package name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="1 Hour Browsing" /></Field>
        <Field label="Price (KES)" hint="You set the price. Whole shillings."><input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <Field label="Duration" hint="Maximum standard duration is 1 month."><select value={f.dur} onChange={(e) => setF({ ...f, dur: e.target.value })}>{DURS.map(([u, v, l]) => <option key={u + v} value={`${u}:${v}`}>{l}</option>)}</select></Field>
        <Field label="Devices allowed"><input type="number" min={1} max={10} value={f.maxDevices} onChange={(e) => setF({ ...f, maxDevices: e.target.value })} /></Field>
        <Field label="Data allowance (MB, optional)" hint="Leave blank for unlimited."><input inputMode="numeric" value={f.dataLimitMb} onChange={(e) => setF({ ...f, dataLimitMb: e.target.value })} /></Field>
        <Field label="Promo label (optional)"><input value={f.promoLabel} maxLength={30} onChange={(e) => setF({ ...f, promoLabel: e.target.value })} placeholder="Best value" /></Field>
        <Field label="Download limit (kbps, optional)"><input inputMode="numeric" value={f.downKbps} onChange={(e) => setF({ ...f, downKbps: e.target.value })} /></Field>
        <Field label="Upload limit (kbps, optional)"><input inputMode="numeric" value={f.upKbps} onChange={(e) => setF({ ...f, upKbps: e.target.value })} /></Field>
        <Field label="Display order"><input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} /></Field>
        <Field label="Visible to customers"><select value={f.isPublished ? 'y' : 'n'} onChange={(e) => setF({ ...f, isPublished: e.target.value === 'y' })}><option value="y">Published</option><option value="n">Hidden</option></select></Field>
      </div>
      <Field label="Description (optional)"><input value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <h3>Customer preview</h3>
      <div className="pkg" style={{ maxWidth: 420, cursor: 'default' }} aria-hidden><div><b>{f.name || 'Package name'}</b> {f.promoLabel && <span className="badge">{f.promoLabel}</span>}<div className="muted small">{DURS.find(([u, v]) => `${u}:${v}` === f.dur)?.[2]}{f.dataLimitMb ? ` · ${f.dataLimitMb} MB` : ''}{f.downKbps ? ` · ${f.downKbps} kbps` : ''}</div></div><div className="price">{kes(Number(f.price) || 0)}</div></div>
      <div className="row mt"><button className="btn" onClick={save}>Save package</button><button className="btn alt" onClick={() => { setF(null); setEditing(null); }}>Cancel</button></div>
    </div>)}
    {!data?.length ? <Empty>No packages yet. Create your first package, set your own price and publish it.</Empty> : (
      <div className="card tablewrap"><table><thead><tr><th>Name</th><th>Price</th><th>Duration</th><th>Limits</th><th>Status</th><th>If bought now, ends</th><th></th></tr></thead><tbody>
        {data.map((p) => (<tr key={p.id}><td><b>{p.name}</b></td><td>{kes(p.price_amount)}</td><td>{p.duration_value} {p.duration_unit}{p.duration_value > 1 ? 's' : ''}</td>
          <td className="small">{[p.data_limit_mb && `${p.data_limit_mb} MB`, p.down_kbps && `↓${p.down_kbps}k`, p.up_kbps && `↑${p.up_kbps}k`, `${p.max_devices} dev`].filter(Boolean).join(' · ')}</td>
          <td>{p.status === 'disabled' ? <Badge s="disabled" /> : p.is_published ? <Badge s="published" /> : <Badge s="draft" />}</td><td className="small">{when(p.expected_expiry_if_bought_now)}</td>
          <td className="row">{canEdit && <>
            <button className="btn alt sm" onClick={() => { setEditing(p.id); setF({ name: p.name, description: p.description ?? '', price: p.price_amount, dur: `${p.duration_unit}:${p.duration_value}`, dataLimitMb: p.data_limit_mb ?? '', downKbps: p.down_kbps ?? '', upKbps: p.up_kbps ?? '', maxDevices: p.max_devices, promoLabel: p.promo_label ?? '', sortOrder: p.sort_order, isPublished: p.is_published }); }}>Edit</button>
            <button className="btn alt sm" onClick={() => quick(p, { isPublished: !p.is_published })}>{p.is_published ? 'Unpublish' : 'Publish'}</button>
            <button className="btn alt sm" onClick={() => quick(p, { status: p.status === 'disabled' ? 'active' : 'disabled' })}>{p.status === 'disabled' ? 'Enable' : 'Disable'}</button>
            <Confirm small danger label="Archive" message="Archive this package? Existing customers and vouchers keep their access." onYes={async () => { await api(`/businesses/${biz.id}/packages/${p.id}`, { method: 'DELETE' }); reload(); }} /></>}</td></tr>))}
      </tbody></table></div>)}
    <p className="muted small mt">Expiry rule: access starts when the router confirms authorization. 1 month ends at the same time next month (Nairobi time), or the last day of a shorter month.</p>
  </div>);
}
