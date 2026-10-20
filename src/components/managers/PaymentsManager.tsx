'use client';
import { useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { Badge, Empty, ErrorBox, Loading, kes, when, useToast, Field } from '../ui';
import { useBiz } from '../Shell';

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean); if (!lines.length) return [];
  const split = (l: string) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const ri = head.findIndex((h) => /receipt|code|transaction/.test(h)); const ai = head.findIndex((h) => /paid in|amount|credit/.test(h)); const pi = head.findIndex((h) => /phone|details|party/.test(h));
  return lines.slice(1).map((l) => { const c = split(l); return { receipt: c[ri], amount: c[ai]?.replace(/[^0-9.]/g, ''), phone: pi >= 0 ? c[pi] : undefined }; });
}

export function PaymentsManager() {
  const { biz, role } = useBiz();
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useApi<any[]>(`/businesses/${biz.id}/payments${status ? `?status=${status}` : ''}`);
  const toast = useToast(); const [amt, setAmt] = useState<Record<string, string>>({}); const [code, setCode] = useState<Record<string, string>>({});
  const admin = role !== 'staff';
  const act = async (pid: string, body: any, ok: string) => { toast.clear(); try { await api(`/businesses/${biz.id}/payments/${pid}`, { method: 'POST', body }); toast.ok(ok); reload(); } catch (e: any) { toast.err(e.message); } };
  const importCsv = async (file: File) => {
    try { const rows = parseCsv(await file.text()); const r = await api<any>(`/businesses/${biz.id}/payments/reconcile`, { method: 'POST', body: { rows } }); toast.ok(`Imported ${r.imported} rows, confirmed ${r.matched} payments, skipped ${r.skipped}.${r.problems.length ? ' Issues: ' + r.problems.join('; ') : ''}`); reload(); } catch (e: any) { toast.err(e.message); }
  };
  const claims = data?.filter((p) => p.status === 'awaiting_verification') ?? [];
  const stuck = data?.filter((p) => p.status === 'confirmed' && p.access_entitlements?.status === 'pending_authorization') ?? [];
  return (<div>
    {toast.node}<ErrorBox msg={error} />
    {stuck.length > 0 && <div className="alert warn"><b>{stuck.length} paid customer(s) are waiting for the router.</b> They have been charged and will not be asked to pay again. Check the router is online; use Retry below to re-queue.</div>}
    {admin && claims.length > 0 && <div className="card mb"><h2>Payments awaiting your verification ({claims.length})</h2>
      <p className="muted small">Open your own M-Pesa statement or SMS. Confirm only if you can see the same code and the exact amount. A customer&apos;s message or screenshot is not proof.</p>
      <div className="tablewrap"><table><thead><tr><th>Phone</th><th>Package</th><th>Expected</th><th>Customer&apos;s code</th><th>Code you see</th><th>Amount you see</th><th></th></tr></thead><tbody>
        {claims.map((p) => (<tr key={p.id}><td>{p.phone}</td><td>{p.packages?.name}</td><td>{kes(p.amount)}</td><td><code>{p.claimed_receipt}</code></td>
          <td><input style={{ width: 130 }} value={code[p.id] ?? ''} onChange={(e) => setCode({ ...code, [p.id]: e.target.value.toUpperCase() })} aria-label="Code in your statement" /></td>
          <td><input style={{ width: 90 }} inputMode="numeric" value={amt[p.id] ?? ''} onChange={(e) => setAmt({ ...amt, [p.id]: e.target.value })} aria-label="Amount in your statement" /></td>
          <td className="row"><button className="btn sm" onClick={() => act(p.id, { action: 'confirm', receipt: code[p.id], amount: Number(amt[p.id]) }, 'Payment confirmed. Access is being authorized.')}>Confirm</button>
            <button className="btn danger sm" onClick={() => act(p.id, { action: 'reject' }, 'Claim rejected.')}>Reject</button></td></tr>))}
      </tbody></table></div></div>}
    {admin && <div className="card mb"><h3>Reconcile with your M-Pesa statement</h3><p className="muted small">Upload the CSV statement from your M-Pesa portal. Claims whose code and amount match a statement line are confirmed automatically. Future claims matching an imported line also confirm instantly.</p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} aria-label="Statement CSV" /></div>}
    <div className="card"><div className="row between mb"><h2 style={{ margin: 0 }}>All payments</h2><select style={{ width: 190 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter"><option value="">All</option>{['pending', 'awaiting_verification', 'confirmed', 'failed', 'cancelled', 'expired'].map((s) => <option key={s}>{s}</option>)}</select></div>
      {loading ? <Loading /> : !data?.length ? <Empty>No payments yet.</Empty> : <div className="tablewrap"><table><thead><tr><th>When</th><th>Package</th><th>Amount</th><th>Channel</th><th>Status</th><th>Receipt</th><th>Access</th><th></th></tr></thead><tbody>
        {data.map((p) => (<tr key={p.id}><td className="small">{when(p.created_at)}</td><td>{p.is_test ? 'Setup test' : p.packages?.name}</td><td>{kes(p.amount)}</td><td>{p.channel}</td><td><Badge s={p.status} /></td><td className="small">{p.mpesa_receipt ?? p.claimed_receipt ?? '-'}</td>
          <td>{p.access_entitlements?.status ? <Badge s={p.access_entitlements.status} /> : '-'}</td>
          <td>{admin && p.status === 'confirmed' && p.access_entitlements?.status === 'pending_authorization' && <button className="btn alt sm" onClick={() => act(p.id, { action: 'retry_authorization' }, 'Re-queued for the router.')}>Retry</button>}{p.failure_reason && <span className="small muted">{p.failure_reason}</span>}</td></tr>))}
      </tbody></table></div>}</div>
  </div>);
}
