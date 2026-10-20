'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { Badge, Confirm, ErrorBox, Field, Loading, useToast } from '@/components/ui';
import { useBiz } from '@/components/Shell';
export default function P() {
  const { biz, role } = useBiz(); const { data, loading, error, reload } = useApi<any[]>(role === 'staff' ? null : `/businesses/${biz.id}/members`); const t = useToast();
  const [email, setEmail] = useState(''); const [r, setR] = useState('staff');
  if (role === 'staff') return <div><h1>Staff &amp; permissions</h1><div className="alert info">Only owners and administrators can manage staff.</div></div>;
  return <div><h1>Staff &amp; permissions</h1>
    <div className="card mb small"><b>Owner</b>: everything incl. portal address and removing admins. <b>Admin</b>: packages, vouchers, payments, routers, reports. <b>Staff</b>: generate vouchers, view sessions and (masked) customers.</div>
    {t.node}<ErrorBox msg={error} />
    <div className="card mb"><h2>Add a team member</h2><p className="muted small">They must register first at the sign-up page, then you add them by email.</p>
      <div className="grid g2"><Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Field label="Role"><select value={r} onChange={(e) => setR(e.target.value)}><option value="staff">Staff</option>{role === 'owner' && <option value="admin">Admin</option>}</select></Field></div>
      <button className="btn" disabled={!email} onClick={async () => { try { await api(`/businesses/${biz.id}/members`, { method: 'POST', body: { email, role: r } }); t.ok('Member added.'); setEmail(''); reload(); } catch (e: any) { t.err(e.message); } }}>Add</button></div>
    <div className="card">{loading ? <Loading /> : <div className="tablewrap"><table><thead><tr><th>Email</th><th>Role</th><th></th></tr></thead><tbody>{data?.map((m) => <tr key={m.user_id}><td>{m.email}</td><td><Badge s={m.role} /></td>
      <td>{m.role !== 'owner' && <Confirm small danger label="Remove" message={`Remove ${m.email}?`} onYes={async () => { try { await api(`/businesses/${biz.id}/members?user=${m.user_id}`, { method: 'DELETE' }); reload(); } catch (e: any) { t.err(e.message); } }} />}</td></tr>)}</tbody></table></div>}</div></div>;
}
