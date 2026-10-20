'use client';
import { api, useApi } from '@/lib/client/api';
import { Badge, Confirm, Empty, ErrorBox, Loading, useToast, when } from '@/components/ui';
import { useBiz } from '@/components/Shell';
export default function P() {
  const { biz, role } = useBiz(); const { data, loading, error, reload } = useApi<any[]>(`/businesses/${biz.id}/sessions`); const t = useToast();
  return <div><h1>Active sessions</h1><p className="muted mb">A session is Active only after the router confirmed it. Pending means paid but waiting for the router.</p>{t.node}<ErrorBox msg={error} />
    <div className="card">{loading ? <Loading /> : !data?.length ? <Empty>No active sessions.</Empty> : <div className="tablewrap"><table><thead><tr><th>Device</th><th>Package</th><th>Source</th><th>Router</th><th>Status</th><th>Started</th><th>Ends</th><th>Used</th><th></th></tr></thead><tbody>
      {data.map((e) => { const s = e.access_sessions?.[0]; return <tr key={e.id}><td className="small">{e.device_mac}</td><td>{e.package_name}</td><td>{e.source}</td><td>{e.routers?.name}</td><td><Badge s={e.status} /></td><td className="small">{when(e.activated_at)}</td><td className="small">{when(e.expires_at)}</td><td className="small">{s ? `${((Number(s.bytes_in) + Number(s.bytes_out)) / 1048576).toFixed(0)} MB` : '-'}</td>
        <td>{role !== 'staff' && <Confirm small danger label="Revoke" message="Cut off this customer now?" onYes={async () => { try { await api(`/businesses/${biz.id}/sessions/${e.id}`, { method: 'POST', body: {} }); t.ok('Revocation queued. The router applies it on its next contact.'); reload(); } catch (x: any) { t.err(x.message); } }} />}</td></tr>; })}</tbody></table></div>}</div></div>;
}
