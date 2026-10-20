'use client';
import { useState } from 'react';
import { sb } from '@/lib/client/supabase';
import { useApi } from '@/lib/client/api';
import { Field, Loading, useToast, when } from '@/components/ui';
import { useBiz } from '@/components/Shell';
export default function P() {
  const { biz, role } = useBiz(); const t = useToast(); const [pw, setPw] = useState('');
  const audit = useApi<any[]>(role === 'staff' ? null : `/businesses/${biz.id}/audit`);
  return <div><h1>Security</h1>{t.node}
    <div className="card mb"><h2>Change password</h2><Field label="New password" hint="At least 10 characters."><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <button className="btn" disabled={pw.length < 10} onClick={async () => { const { error } = await sb().auth.updateUser({ password: pw }); error ? t.err(error.message) : (t.ok('Password updated.'), setPw('')); }}>Update password</button>
      <button className="btn alt" style={{ marginLeft: 8 }} onClick={async () => { await sb().auth.signOut({ scope: 'global' }); location.href = '/login'; }}>Sign out everywhere</button></div>
    {role !== 'staff' && <div className="card"><h2>Audit log</h2><p className="muted small">Append-only record of administrative and financial actions.</p>{audit.loading ? <Loading /> : <div className="tablewrap"><table><thead><tr><th>When</th><th>Action</th><th>By</th><th>Entity</th></tr></thead><tbody>{audit.data?.map((a) => <tr key={a.id}><td className="small">{when(a.created_at)}</td><td>{a.action}</td><td>{a.actor_type}</td><td className="small">{a.entity_type} {a.entity_id?.slice(0, 8)}</td></tr>)}</tbody></table></div>}</div>}</div>;
}
