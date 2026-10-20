'use client';
import { useApi } from '@/lib/client/api';
import { Empty, ErrorBox, Loading, when } from '@/components/ui';
import { useBiz } from '@/components/Shell';
export default function P() {
  const { biz } = useBiz(); const { data, loading, error } = useApi<any[]>(`/businesses/${biz.id}/customers`);
  return <div><h1>Customers</h1><p className="muted mb">People who bought or redeemed access. No account is needed on their side.</p><ErrorBox msg={error} />
    <div className="card">{loading ? <Loading /> : !data?.length ? <Empty>No customers yet.</Empty> : <div className="tablewrap"><table><thead><tr><th>Phone</th><th>Device</th><th>First seen</th><th>Last seen</th></tr></thead><tbody>
      {data.map((c) => <tr key={c.id}><td>{c.phone ?? 'Voucher user'}</td><td className="small">{c.device_mac}</td><td className="small">{when(c.first_seen_at)}</td><td className="small">{when(c.last_seen_at)}</td></tr>)}</tbody></table></div>}</div></div>;
}
