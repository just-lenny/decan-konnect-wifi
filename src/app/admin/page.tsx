'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useApi } from '@/lib/client/api';
import { sb } from '@/lib/client/supabase';
import { Badge, Confirm, ErrorBox, Loading, Logo, useToast, when } from '@/components/ui';

export default function Admin() {
  const r = useRouter(); const [ok, setOk] = useState<boolean | null>(null); const [tab, setTab] = useState<'biz' | 'diag' | 'audit'>('biz');
  useEffect(() => { (async () => { const { data } = await sb().auth.getSession(); if (!data.session) return r.replace('/login'); try { const me = await api<any>('/me'); setOk(me.platformAdmin); } catch { r.replace('/login'); } })(); /* eslint-disable-next-line */ }, []);
  if (ok === null) return <Loading />;
  if (!ok) return <div className="auth"><div className="alert err">This area is restricted.</div></div>;
  return <div style={{ maxWidth: 1180, margin: '0 auto', padding: '1.2rem' }}>
    <div className="row between mb"><div className="row"><Logo /><h1 style={{ margin: 0 }}>Decan Konnect super-admin</h1></div><Link className="btn alt sm" href="/dashboard">Back to dashboard</Link></div>
    <div className="tabs" style={{ maxWidth: 480 }} role="tablist">{([['biz', 'Businesses'], ['diag', 'Diagnostics'], ['audit', 'Audit log']] as const).map(([k, l]) => <button key={k} role="tab" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'biz' && <Businesses />}{tab === 'diag' && <Diag />}{tab === 'audit' && <Audit />}</div>;
}

function Businesses() {
  const { data, loading, error, reload } = useApi<any[]>('/admin/businesses'); const t = useToast();
  const set = async (id: string, status: string) => { try { await api(`/admin/businesses/${id}`, { method: 'POST', body: { status } }); t.ok(`Business ${status}.`); reload(); } catch (e: any) { t.err(e.message); } };
  if (loading) return <Loading />;
  return <div className="card">{t.node}<ErrorBox msg={error} /><div className="tablewrap"><table><thead><tr><th>Business</th><th>Category</th><th>Status</th><th>Portal</th><th>Setup</th><th>Routers</th><th>Payments</th><th>Created</th><th></th></tr></thead><tbody>
    {data?.map((b) => <tr key={b.id}><td><b>{b.display_name}</b><div className="small muted">/{b.slug}</div></td><td>{b.category}</td><td><Badge s={b.status} /></td><td><Badge s={b.portal_mode} /></td><td>{b.setup_completed_at ? 'Complete' : `Step ${b.setup_step}/6`}</td>
      <td>{b.routers.length ? b.routers.map((s: string, i: number) => <Badge key={i} s={s} />) : '-'}</td><td><Badge s={b.payment_status} /></td><td className="small">{when(b.created_at)}</td>
      <td className="row">{b.status !== 'active' && <button className="btn sm" onClick={() => set(b.id, 'active')}>Approve</button>}{b.status !== 'suspended' && <Confirm small danger label="Suspend" message={`Suspend ${b.display_name}? Their portal goes offline immediately.`} onYes={() => set(b.id, 'suspended')} />}</td></tr>)}</tbody></table></div></div>;
}

function Diag() {
  const { data, loading, error } = useApi<any>('/admin/diagnostics');
  if (loading || !data) return <Loading />;
  const cards: [string, number, boolean][] = [['Businesses', data.businesses, false], ['Awaiting approval', data.pending_approval, data.pending_approval > 0], ['Suspended', data.suspended, false], ['Paid but not authorized (>5 min)', data.confirmed_not_authorized, data.confirmed_not_authorized > 0],
    ['Stuck pending payments (>10 min)', data.stuck_pending_payments, data.stuck_pending_payments > 0], ['Failed/expired last hour', data.failed_last_hour, false], ['Failed router commands', data.failed_router_commands, data.failed_router_commands > 0], ['Routers offline', data.offline_routers, data.offline_routers > 0], ['Amount mismatches', data.amount_mismatches, data.amount_mismatches > 0]];
  return <div><ErrorBox msg={error} /><div className="grid g4 mt">{cards.map(([l, n, w]) => <div className="card stat" key={l} style={w ? { borderColor: '#f1d29a' } : {}}><b>{n}</b><span>{l}</span></div>)}</div>
    <div className="card mt"><h2>Reconciliation problems</h2><p className="muted small">Confirmed payments whose access is still waiting for a router. Only identifiers are shown, not customer details.</p>
      {!data.problems.length ? <div className="muted">None.</div> : <table><thead><tr><th>Business</th><th>Entitlement</th><th>Since</th></tr></thead><tbody>{data.problems.map((p: any) => <tr key={p.id}><td>{p.businesses?.display_name}</td><td className="small">{p.id.slice(0, 8)}</td><td className="small">{when(p.created_at)}</td></tr>)}</tbody></table>}</div></div>;
}

function Audit() {
  const { data, loading } = useApi<any[]>('/admin/audit');
  if (loading) return <Loading />;
  return <div className="card tablewrap"><table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Entity</th></tr></thead><tbody>{data?.map((a) => <tr key={a.id}><td className="small">{when(a.created_at)}</td><td>{a.action}</td><td>{a.actor_type}</td><td className="small">{a.entity_type} {a.entity_id?.slice(0, 8)}</td></tr>)}</tbody></table></div>;
}
