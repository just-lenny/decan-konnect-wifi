'use client';
import Link from 'next/link';
import { useApi } from '@/lib/client/api';
import { Badge, Empty, ErrorBox, Loading, kes, when } from '@/components/ui';
import { useBiz } from '@/components/Shell';

export default function Overview() {
  const { biz } = useBiz();
  const { data, loading, error } = useApi<any>(`/businesses/${biz.id}/overview`);
  if (loading) return <Loading />;
  const s = data?.stats;
  const cards: [string, any][] = s ? [['Total confirmed sales', kes(s.total_sales)], ["Today's sales", kes(s.today_sales)], ['Pending payments', s.pending_payments], ['Failed payments', s.failed_payments], ['Active sessions', s.active_sessions],
    ['Routers online', `${s.routers_online} / ${s.routers_total}`], ['Published packages', s.published_packages], ['Unused vouchers', s.unused_vouchers], ['Redeemed vouchers', s.redeemed_vouchers], ['Expiring within 1 hour', s.expiring_sessions], ['Customers', s.customers], ['Awaiting verification', s.unreconciled_claims]] : [];
  return (<div>
    <div className="row between mb"><div><h1>{biz.display_name}</h1><span className="muted">Overview · <Badge s={biz.portal_mode} /> {biz.status === 'pending' && <Badge s="pending" />}</span></div>
      {!biz.setup_completed_at && <Link className="btn" href="/dashboard/setup">Continue setup</Link>}</div>
    {biz.status === 'pending' && <div className="alert warn">Your business is awaiting approval by Decan Konnect. You can set everything up and use Preview mode now; going live is enabled once approved.</div>}
    <ErrorBox msg={error} />
    {s?.unauthorized_confirmed > 0 && <div className="alert warn"><b>{s.unauthorized_confirmed}</b> paid customer(s) are waiting for the router to grant access. <Link href="/dashboard/payments">Review</Link></div>}
    <div className="grid g4 mb">{cards.map(([l, v]) => <div className="card stat" key={l}><b>{v}</b><span>{l}</span></div>)}</div>
    <div className="card"><h2>Recent transactions</h2>{!data?.recent?.length ? <Empty>No transactions yet. They appear here after your first customer pays.</Empty> : (
      <div className="tablewrap"><table><thead><tr><th>When</th><th>Phone</th><th>Amount</th><th>Channel</th><th>Status</th></tr></thead><tbody>
        {data.recent.map((p: any) => <tr key={p.id}><td>{when(p.created_at)}</td><td>{p.phone ?? '-'}</td><td>{kes(p.amount)}</td><td>{p.channel}</td><td><Badge s={p.status} /></td></tr>)}</tbody></table></div>)}</div>
  </div>);
}
