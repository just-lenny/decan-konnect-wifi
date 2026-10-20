'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { Badge, CopyButton, Loading, useToast } from '@/components/ui';
import { useBiz } from '@/components/Shell';
import { ProfileForm } from '@/components/managers/ProfileForm';
import { RoutersManager } from '@/components/managers/RoutersManager';
import { PaymentSetup } from '@/components/managers/PaymentSetup';
import { PackagesManager } from '@/components/managers/PackagesManager';
import { VouchersManager } from '@/components/managers/VouchersManager';

const STEPS = ['Business', 'Internet & router', 'M-Pesa', 'Packages', 'Vouchers', 'Review & publish'];
const HELP: string[] = [
  'Tell customers who you are. Pick a short portal address; it becomes your public link and QR code.',
  'A website alone cannot restrict internet access. Your router enforces it. Add your site and router, run the generated script, and wait until it shows Connected.',
  'Choose your OWN Till or Paybill. Pay-then-verify works immediately; instant prompts need your Daraja credentials and a passing test payment.',
  'Create the packages you sell. You control every price and which durations you offer.',
  'Optional: generate vouchers for walk-in customers. Print them and keep the sheet safe: codes are shown only once.',
  'Check what is missing, then publish in Preview, Voucher-only or Live mode.',
];

export default function Wizard() {
  const { biz, refresh } = useBiz(); const [step, setStep] = useState(Math.min(biz.setup_step, 6)); const t = useToast();
  const go = async (n: number) => { setStep(n); try { await api(`/businesses/${biz.id}`, { method: 'PATCH', body: { setupStep: n } }); } catch { /* progress save is best-effort */ } };
  return (<div>
    <h1>Setup wizard</h1>
    <div className="bar" aria-label="Progress"><i style={{ width: `${(step / 6) * 100}%` }} /></div>
    <div className="steps" role="tablist">{STEPS.map((s, i) => <button key={s} role="tab" aria-selected={step === i + 1} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} onClick={() => go(i + 1)}>{i + 1}. {s}</button>)}</div>
    <div className="alert info">{HELP[step - 1]} Your progress is saved automatically; you can leave and continue later.</div>
    {t.node}
    {step === 1 && <ProfileForm onSaved={() => t.ok('Saved. Continue to the next step when ready.')} />}
    {step === 2 && <RoutersManager />}
    {step === 3 && <PaymentSetup />}
    {step === 4 && <PackagesManager />}
    {step === 5 && <VouchersManager />}
    {step === 6 && <Review />}
    <div className="row between mt noprint"><button className="btn alt" disabled={step === 1} onClick={() => go(step - 1)}>Back</button>{step < 6 ? <button className="btn" onClick={() => go(step + 1)}>Next</button> : <span />}</div>
  </div>);
}

function Review() {
  const { biz, refresh } = useBiz(); const t = useToast();
  const b = useApi<any>(`/businesses/${biz.id}`); const pk = useApi<any[]>(`/businesses/${biz.id}/packages`); const rt = useApi<any[]>(`/businesses/${biz.id}/routers`); const pc = useApi<any>(`/businesses/${biz.id}/payment-config`);
  if (b.loading || pk.loading || rt.loading || pc.loading) return <Loading />;
  const published = pk.data?.filter((p) => p.is_published && p.status === 'active') ?? []; const connected = rt.data?.filter((r) => r.effective_status === 'connected') ?? [];
  const items: [string, boolean, string][] = [
    ['Business profile & support phone', !!b.data?.phone && !!b.data?.display_name, 'Add a support phone number.'],
    ['Portal address', !!b.data?.slug, ''],
    ['At least one published package', published.length > 0, 'Publish a package.'],
    ['Router connected (verified contact)', connected.length > 0, 'Run the router script and wait for Connected.'],
    ['M-Pesa destination saved (Till or Paybill)', !!pc.data?.till_or_paybill, 'Needed for Live mode.'],
    ['Instant M-Pesa prompt verified (optional)', pc.data?.status === 'verified', 'Without it, customers use pay-then-verify.'],
    ['Terms & privacy added', !!b.data?.terms && !!b.data?.privacy, 'Add them under Captive portal.'],
  ];
  const mode = async (portalMode: string) => { try { await api(`/businesses/${biz.id}`, { method: 'PATCH', body: { portalMode, setupCompleted: true } }); t.ok(`Portal is now in ${portalMode.replace('_', ' ')} mode.`); await refresh(); b.reload(); } catch (e: any) { t.err(e.message); } };
  const url = b.data?.portal_url;
  return (<div className="card">{t.node}<h2>Setup checklist</h2>
    <ul style={{ listStyle: 'none', padding: 0 }}>{items.map(([l, ok, fix]) => <li key={l} className="row" style={{ padding: '.3rem 0' }}><span className={`badge ${ok ? '' : 'warn'}`}>{ok ? 'Done' : 'To do'}</span><span>{l}</span>{!ok && fix && <span className="muted small">{fix}</span>}</li>)}</ul>
    <div className="small muted mb">Router: {rt.data?.map((r) => <span key={r.id}>{r.name} <Badge s={r.effective_status} /> </span>)}   Payments: <Badge s={pc.data?.status ?? 'not_configured'} /></div>
    <div className="alert warn">Do not treat paid Wi-Fi as production-ready until you have run the physical test: connect a phone, get redirected, redeem a voucher, pay KES 1, and confirm internet access starts and stops correctly.</div>
    <div className="row"><button className="btn alt" onClick={() => mode('preview')}>Publish Preview</button><button className="btn alt" onClick={() => mode('voucher_only')}>Publish Voucher-only</button><button className="btn" onClick={() => mode('live')}>Go Live</button></div>
    <div className="row mt"><a className="btn alt sm" href={url} target="_blank" rel="noreferrer">Open portal</a><CopyButton text={url ?? ''} label="Copy portal URL" /><Link className="btn alt sm" href="/dashboard/packages">Manage packages</Link><Link className="btn alt sm" href="/dashboard/vouchers">Generate vouchers</Link><Link className="btn alt sm" href="/dashboard/payments">Test payment</Link><Link className="btn alt sm" href="/dashboard/routers">Test router</Link><Link className="btn alt sm" href="/dashboard">Dashboard</Link></div></div>);
}
