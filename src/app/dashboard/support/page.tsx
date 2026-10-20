'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { Badge, Empty, Field, Loading, useToast, when } from '@/components/ui';
import { useBiz } from '@/components/Shell';
export default function P() {
  const { biz } = useBiz(); const { data, loading, reload } = useApi<any[]>(`/businesses/${biz.id}/support`); const t = useToast(); const [f, setF] = useState({ subject: '', body: '' });
  return <div><h1>Support</h1><p className="muted mb">Contact Decan Konnect about setup, routers or payments. Do not include passwords or M-Pesa PINs.</p>{t.node}
    <div className="card mb"><Field label="Subject"><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field><Field label="Message"><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <button className="btn" disabled={f.subject.length < 3 || f.body.length < 3} onClick={async () => { try { await api(`/businesses/${biz.id}/support`, { method: 'POST', body: f }); t.ok('Message sent.'); setF({ subject: '', body: '' }); reload(); } catch (e: any) { t.err(e.message); } }}>Send</button></div>
    {loading ? <Loading /> : !data?.length ? <Empty>No messages yet.</Empty> : data.map((m) => <div className="card mb" key={m.id}><div className="row between"><b>{m.subject}</b><Badge s={m.status} /></div><div className="small muted">{when(m.created_at)}</div><p>{m.body}</p>{m.staff_reply && <div className="alert ok"><b>Reply:</b> {m.staff_reply}</div>}</div>)}</div>;
}
