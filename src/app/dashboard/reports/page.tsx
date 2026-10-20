'use client';
import { useState } from 'react';
import { useApi, downloadCsv } from '@/lib/client/api';
import { Empty, ErrorBox, Loading, kes } from '@/components/ui';
import { useBiz } from '@/components/Shell';
export default function P() {
  const { biz, role } = useBiz(); const [days, setDays] = useState(30); const { data, loading, error } = useApi<any>(role === 'staff' ? null : `/businesses/${biz.id}/reports?days=${days}`);
  if (role === 'staff') return <div><h1>Reports</h1><div className="alert info">Reports are available to owners and administrators.</div></div>;
  const max = data ? Math.max(1, ...Object.values<number>(data.byDay)) : 1;
  return <div><div className="row between mb"><h1>Revenue reports</h1><select style={{ width: 150 }} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">{[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select></div>
    <ErrorBox msg={error} />{loading || !data ? <Loading /> : <>
      <div className="grid g4 mb"><div className="card stat"><b>{kes(data.total)}</b><span>Confirmed revenue</span></div><div className="card stat"><b>{data.payments}</b><span>Paid orders</span></div><div className="card stat"><b>{data.vouchersRedeemed}</b><span>Vouchers redeemed</span></div></div>
      <div className="card mb"><h2>Daily revenue</h2>{!Object.keys(data.byDay).length ? <Empty>No confirmed sales in this period.</Empty> : <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 140 }} role="img" aria-label="Daily revenue bars">
        {Object.entries<number>(data.byDay).sort().map(([d, a]) => <div key={d} title={`${d}: ${kes(a)}`} style={{ flex: 1, background: 'var(--g)', height: `${(a / max) * 100}%`, minHeight: 3, borderRadius: 3 }} />)}</div>}</div>
      <div className="card"><div className="row between"><h2>By package</h2><button className="btn alt sm" onClick={() => downloadCsv('revenue-by-package.csv', [['package', 'orders', 'revenue_kes'], ...Object.entries<any>(data.byPackage).map(([n, v]) => [n, v.count, v.revenue])])}>Export CSV</button></div>
        <div className="tablewrap"><table><thead><tr><th>Package</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>{Object.entries<any>(data.byPackage).map(([n, v]) => <tr key={n}><td>{n}</td><td>{v.count}</td><td>{kes(v.revenue)}</td></tr>)}</tbody></table></div></div></>}</div>;
}
