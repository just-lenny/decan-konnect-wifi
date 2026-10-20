'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { Badge, CopyButton, Empty, Field, Loading, when, useToast, Confirm } from '../ui';
import { useBiz } from '../Shell';

export function RoutersManager() {
  const { biz, role } = useBiz();
  const sites = useApi<any[]>(`/businesses/${biz.id}/sites`); const routers = useApi<any[]>(`/businesses/${biz.id}/routers`);
  const [s, setS] = useState({ name: '', location: '', hotspotName: '', networkModel: 'independent' }); const [r, setR] = useState({ siteId: '', name: '', model: '' });
  const [script, setScript] = useState<{ id: string; text: string } | null>(null); const [detail, setDetail] = useState<any>(null); const toast = useToast();
  const admin = role !== 'staff';
  const run = async (fn: () => Promise<any>, ok?: string) => { toast.clear(); try { const x = await fn(); if (ok) toast.ok(ok); return x; } catch (e: any) { toast.err(e.message); } };
  if (sites.loading || routers.loading) return <Loading />;
  return (<div>
    {toast.node}
    <div className="alert info"><b>Why a router is required.</b> A website alone cannot block internet access. A compatible router (MikroTik RouterOS v7 supported first) enforces who is online, for how long, at what speed. A router shows <b>Connected</b> only after it has actually contacted the platform.</div>
    {admin && <div className="grid g2 mb">
      <div className="card"><h3>1. Add a site</h3>
        <Field label="Site name"><input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Main shop" /></Field>
        <Field label="Location"><input value={s.location} onChange={(e) => setS({ ...s, location: e.target.value })} /></Field>
        <Field label="Hotspot (Wi-Fi) name"><input value={s.hotspotName} onChange={(e) => setS({ ...s, hotspotName: e.target.value })} /></Field>
        <Field label="Internet source" hint="Independent = your own ISP. Central = internet supplied by Decan Konnect or an authorized upstream provider."><select value={s.networkModel} onChange={(e) => setS({ ...s, networkModel: e.target.value })}><option value="independent">Independent (my own ISP)</option><option value="central">Centrally provided</option></select></Field>
        <button className="btn" disabled={s.name.length < 2} onClick={async () => { await run(() => api(`/businesses/${biz.id}/sites`, { method: 'POST', body: s }), 'Site added.'); sites.reload(); }}>Add site</button></div>
      <div className="card"><h3>2. Add a router</h3>
        <Field label="Site"><select value={r.siteId} onChange={(e) => setR({ ...r, siteId: e.target.value })}><option value="">Select…</option>{sites.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Router name"><input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Shop hAP ax2" /></Field>
        <Field label="Model (optional)"><input value={r.model} onChange={(e) => setR({ ...r, model: e.target.value })} /></Field>
        <div className="small muted mb">Vendor: MikroTik RouterOS (more vendors can be added later).</div>
        <button className="btn" disabled={!r.siteId || r.name.length < 2} onClick={async () => { await run(() => api(`/businesses/${biz.id}/routers`, { method: 'POST', body: r }), 'Router added. Now generate its setup script.'); routers.reload(); }}>Add router</button></div>
    </div>}
    {!routers.data?.length ? <Empty>No routers yet.</Empty> : routers.data.map((x) => (
      <div className="card mb" key={x.id}>
        <div className="row between"><div><b>{x.name}</b> <span className="muted small">{sites.data?.find((y) => y.id === x.site_id)?.name} · {x.model ?? 'model not set'}</span></div><Badge s={x.effective_status} /></div>
        <div className="small muted">Last contact: {when(x.last_seen_at)} {x.ros_version && `· RouterOS ${x.ros_version}`} {x.last_error && <span style={{ color: 'var(--bad)' }}>· {x.last_error}</span>}</div>
        {admin && <div className="row mt">
          <Confirm label="Generate setup script" message="This creates a new enrollment token. Any previous script for this router stops working." onYes={async () => { const d = await run(() => api(`/businesses/${biz.id}/routers/${x.id}`, { method: 'POST' })); if (d) { setScript({ id: x.id, text: d.script }); routers.reload(); } }} />
          <button className="btn alt" onClick={async () => { const d = await run(() => api(`/businesses/${biz.id}/routers/${x.id}`)); if (d) setDetail({ id: x.id, ...d }); routers.reload(); }}>Test connection / view events</button>
          {role === 'owner' && <Confirm danger label="Disable" message="Disable this router? It will stop receiving commands." onYes={async () => { await run(() => api(`/businesses/${biz.id}/routers/${x.id}`, { method: 'DELETE' }), 'Router disabled.'); routers.reload(); }} />}</div>}
        {script?.id === x.id && <div className="mt"><div className="alert warn">Shown once. Paste into the router terminal (Winbox → New Terminal). Generating again invalidates it. Never share this script publicly: it contains the router&apos;s secret token.</div><pre className="code">{script.text}</pre><CopyButton text={script.text} label="Copy script" /></div>}
        {detail?.id === x.id && <div className="mt small"><b>Connection check:</b> {x.effective_status === 'connected' ? 'Router contacted the platform recently.' : 'No recent contact. Check the router can reach the internet, the script ran without errors, and /system scheduler shows dk-poll.'} Pending commands: {detail.pending_commands}.
          <ul>{detail.events.map((e: any, i: number) => <li key={i}>{when(e.created_at)}: {e.type}</li>)}</ul></div>}
      </div>))}
    <div className="card"><h3>Router compatibility checklist</h3><ul className="small">
      <li>MikroTik with RouterOS v7.x (hAP, RB, CCR or CHR) and a working HotSpot on your guest LAN bridge.</li>
      <li>Router has internet and can reach <code>{typeof window !== 'undefined' ? window.location.host : 'your domain'}</code> over HTTPS (check router clock and DNS).</li>
      <li>HotSpot profile uses MAC login (the setup script configures it). Customers must reach the portal via the walled garden entry added by the script.</li>
      <li>Keep router admin access (Winbox/SSH/API) closed to the internet. The platform never needs your router password.</li></ul></div>
  </div>);
}
