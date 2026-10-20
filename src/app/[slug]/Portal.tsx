'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import { kes } from '@/components/ui';

type Phase = 'shop' | 'pushing' | 'verifying' | 'connecting' | 'connected' | 'failed';
const fmt = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
const newKey = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)) + '-' + Math.random().toString(36).slice(2, 10);

export default function Portal() {
  const { slug } = useParams<{ slug: string }>(); const sp = useSearchParams();
  const r = sp.get('r') ?? ''; const mac = sp.get('mac') ?? '';
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [missing, setMissing] = useState(false);
  const [sel, setSel] = useState<string | null>(null); const [tab, setTab] = useState<'mpesa' | 'voucher'>('mpesa');
  const [phone, setPhone] = useState(''); const [code, setCode] = useState(''); const [receipt, setReceipt] = useState(''); const [mode, setMode] = useState<'stk' | 'manual'>('stk');
  const [phase, setPhase] = useState<Phase>('shop'); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const [access, setAccess] = useState<any>(null); const keyRef = useRef<string>(''); const ctxRef = useRef<{ kind: 'payment' | 'access'; id: string } | null>(null);

  const load = useCallback(async () => {
    try { setD(await api(`/public/portal/${slug}${r ? `?r=${encodeURIComponent(r)}` : ''}`, { auth: false })); } catch (e: any) { e.status === 404 ? setMissing(true) : setErr(e.message); }
  }, [slug, r]);
  useEffect(() => { load(); }, [load]);

  // Resume an in-flight purchase after refresh or if the OS swaps captive-portal browsers.
  useEffect(() => {
    try { const s = JSON.parse(sessionStorage.getItem(`dk:${slug}`) ?? 'null'); if (s?.key && s?.id) { keyRef.current = s.key; ctxRef.current = { kind: s.kind, id: s.id }; setPhase('verifying'); setMsg('Checking your payment…'); } } catch { /* ignore */ }
  }, [slug]);
  const remember = (kind: 'payment' | 'access', id: string) => { ctxRef.current = { kind, id }; try { sessionStorage.setItem(`dk:${slug}`, JSON.stringify({ kind, id, key: keyRef.current })); } catch { /* private mode */ } };
  const reset = () => { try { sessionStorage.removeItem(`dk:${slug}`); } catch { /* */ } ctxRef.current = null; keyRef.current = ''; setPhase('shop'); setAccess(null); load(); };

  // Poll payment / access status.
  useEffect(() => {
    if (!['pushing', 'verifying', 'connecting'].includes(phase) || !ctxRef.current) return;
    let stop = false; const started = Date.now();
    const tick = async () => {
      if (stop || !ctxRef.current) return;
      try {
        const { kind, id } = ctxRef.current; const token = encodeURIComponent(keyRef.current);
        if (kind === 'payment') {
          const p = await api<any>(`/public/payments/${id}?token=${token}`, { auth: false });
          if (p.status === 'confirmed' && p.access) { remember('access', p.access.entitlement_id); setPhase('connecting'); setMsg('Payment received. Connecting you to the internet…'); return; }
          if (p.status === 'confirmed') { setPhase('connecting'); setMsg('Payment received. Connecting you…'); }
          else if (['failed', 'cancelled', 'expired'].includes(p.status)) { setPhase('failed'); setMsg(p.failure_reason || 'The payment was not completed. You have not been charged.'); return; }
          else if (p.status === 'awaiting_verification') { setPhase('verifying'); setMsg('We have your code. The business must verify the payment before access starts. This page updates automatically.'); }
          else { setPhase('pushing'); setMsg('Check your phone and enter your M-Pesa PIN to approve the payment.'); }
        } else {
          const a = await api<any>(`/public/access/${id}?token=${token}`, { auth: false });
          setAccess(a);
          if (a.status === 'active') { setPhase('connected'); return; }
          if (['revoked', 'expired'].includes(a.status)) { setPhase('failed'); setMsg('This access is no longer valid.'); return; }
          setPhase('connecting'); setMsg(Date.now() - started > 90_000 ? 'Still connecting. The hotspot is taking longer than usual. You will not be charged twice. Please keep this page open or ask staff for help.' : 'Connecting you to the internet…');
        }
      } catch (e: any) { if (e.status === 404) { setPhase('failed'); setMsg('We could not find that purchase.'); stop = true; } }
    };
    tick(); const iv = setInterval(tick, 3000); return () => { stop = true; clearInterval(iv); };
  }, [phase]); // eslint-disable-line

  // Countdown while connected.
  useEffect(() => {
    if (phase !== 'connected' || !access?.expires_at) return;
    const iv = setInterval(() => setAccess((a: any) => a && { ...a, remaining_seconds: Math.max(0, Math.floor((new Date(a.expires_at).getTime() - Date.now()) / 1000)) }), 1000); return () => clearInterval(iv);
  }, [phase, access?.expires_at]);

  if (missing) return <div className="portal"><div className="pbody"><h1>Portal not available</h1><p className="muted">This Wi-Fi portal does not exist or is not open yet. Please check the address.</p></div></div>;
  if (!d) return <div className="portal"><div className="pbody empty">{err ? <div className="alert err">{err}</div> : <span className="spin" />}</div></div>;

  const b = d.business; const live = d.mode === 'live' || d.mode === 'voucher_only';
  const routerKnown = !!r && !!mac; const routerBad = !routerKnown || d.router?.valid === false; const routerOffline = d.router?.valid && !d.router.online;
  const pkg = d.packages.find((p: any) => p.id === sel); const canStk = d.payment.stk; const canManual = !!d.payment.manual;
  const call = (n: string) => `tel:${n.replace(/\s/g, '')}`; const wa = (n: string) => `https://wa.me/${n.replace(/\D/g, '').replace(/^0/, '254')}`;

  const pay = async (channel: 'stk' | 'manual') => {
    if (!pkg) return; setBusy(true); setErr('');
    if (!keyRef.current) keyRef.current = newKey();
    try {
      const p = await api<any>('/public/payments', { method: 'POST', auth: false, body: { slug, packageId: pkg.id, channel, phone, mac, routerPublicId: r, idempotencyKey: keyRef.current, receipt: channel === 'manual' ? receipt : undefined } });
      remember('payment', p.paymentId); setPhase(channel === 'stk' ? 'pushing' : 'verifying'); setMsg(channel === 'stk' ? 'Check your phone and enter your M-Pesa PIN to approve the payment.' : 'Submitted. Waiting for the business to verify your payment.');
    } catch (e: any) { setErr(e.message); keyRef.current = ''; } setBusy(false);
  };
  const redeem = async () => {
    setBusy(true); setErr(''); if (!keyRef.current) keyRef.current = newKey();
    try { const v = await api<any>('/public/vouchers/redeem', { method: 'POST', auth: false, body: { slug, code, mac, routerPublicId: r, idempotencyKey: keyRef.current } }); remember('access', v.entitlementId); setPhase('connecting'); setMsg('Voucher accepted. Connecting you…'); }
    catch (e: any) { setErr(e.message); keyRef.current = ''; } setBusy(false);
  };

  return (<div className="portal">
    <div className="phead" style={b.cover_url ? { backgroundImage: `linear-gradient(rgba(7,94,69,.8),rgba(4,170,109,.75)),url(${b.cover_url})` } : undefined}>
      {b.logo_url ? <img className="plogo" src={b.logo_url} alt={`${b.name} logo`} /> : <div className="plogo" aria-hidden>{b.name.slice(0, 2).toUpperCase()}</div>}
      <h1 style={{ color: '#fff' }}>{b.name}</h1>{b.location && <div className="small" style={{ opacity: .9 }}>{b.location}</div>}
    </div>
    <div className="pbody">
      {d.mode === 'preview' && <div className="alert warn">Preview mode: purchasing is switched off.</div>}
      {!d.active && live && <div className="alert warn">This portal is awaiting activation.</div>}
      {phase === 'shop' && <>
        <p>{b.welcome_message || b.description || 'Welcome! Choose a package to get online.'}</p>
        {routerBad && live && <div className="alert warn">To buy access, connect to this venue&apos;s Wi-Fi and open this page from the sign-in prompt.</div>}
        {routerOffline && <div className="alert warn">This hotspot is temporarily offline. Please try again shortly or contact staff.</div>}
        {err && <div className="alert err" role="alert">{err}</div>}
        {d.packages.length === 0 ? <div className="empty">No packages are available right now.</div> : d.packages.map((p: any) => (
          <button key={p.id} className="pkg" aria-pressed={sel === p.id} onClick={() => setSel(p.id)}>
            <div><b>{p.name}</b> {p.promo_label && <span className="badge">{p.promo_label}</span>}<div className="muted small">{p.duration}{p.data_limit_mb ? ` · ${p.data_limit_mb >= 1024 ? (p.data_limit_mb / 1024).toFixed(1) + ' GB' : p.data_limit_mb + ' MB'}` : ''}{p.down_kbps ? ` · up to ${p.down_kbps >= 1000 ? p.down_kbps / 1000 + ' Mbps' : p.down_kbps + ' kbps'}` : ''}{p.max_devices > 1 ? ` · ${p.max_devices} devices` : ''}</div>{p.description && <div className="small">{p.description}</div>}</div>
            <div className="price">{kes(p.price)}</div></button>))}
        {live && <>
          <div className="tabs" role="tablist"><button role="tab" className={tab === 'mpesa' ? 'on' : ''} onClick={() => { setTab('mpesa'); setErr(''); }}>Pay with M-Pesa</button><button role="tab" className={tab === 'voucher' ? 'on' : ''} onClick={() => { setTab('voucher'); setErr(''); }}>I have a voucher</button></div>
          {tab === 'mpesa' && (d.mode === 'live' ? <>
            {canStk && canManual && <div className="tabs" role="tablist"><button className={mode === 'stk' ? 'on' : ''} onClick={() => setMode('stk')}>M-Pesa prompt</button><button className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>Pay then verify</button></div>}
            {!canStk && !canManual && <div className="alert warn">M-Pesa is not available here yet. Please use a voucher or contact the business.</div>}
            {(canStk || canManual) && <>
              {(mode === 'manual' || !canStk) && canManual && <div className="alert info small"><b>Pay to {d.payment.manual.method === 'till' ? 'Till' : 'Paybill'} {d.payment.manual.number}</b>{d.payment.manual.account_rule && <> · Account: <b>{d.payment.manual.account_rule}</b></>}<br />Pay the exact amount{pkg ? <> (<b>{kes(pkg.price)}</b>)</> : ''} from your M-Pesa menu. {d.payment.manual.instructions}<br />Then enter the SMS code below. Access starts once the business verifies the payment.</div>}
              <div className="field"><label htmlFor="ph">Your M-Pesa phone number</label><input id="ph" inputMode="tel" autoComplete="tel" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              {(mode === 'manual' || !canStk) && <div className="field"><label htmlFor="rc">M-Pesa confirmation code<span className="hint">10 characters from your payment SMS, e.g. SGL4X8AB12</span></label><input id="rc" autoCapitalize="characters" maxLength={10} value={receipt} onChange={(e) => setReceipt(e.target.value.toUpperCase())} /></div>}
              <button className="btn" style={{ width: '100%' }} disabled={busy || !pkg || !phone || routerBad || !!routerOffline || ((mode === 'manual' || !canStk) && receipt.length !== 10)} onClick={() => pay(mode === 'manual' || !canStk ? 'manual' : 'stk')}>{busy ? 'Please wait…' : pkg ? ((mode === 'manual' || !canStk) ? `Submit payment code · ${kes(pkg.price)}` : `Pay ${kes(pkg.price)} with M-Pesa`) : 'Select a package'}</button></>}
          </> : <div className="alert info">M-Pesa payments are not open at this portal yet. Use a voucher.</div>)}
          {tab === 'voucher' && <>
            <div className="field"><label htmlFor="vc">Voucher code</label><input id="vc" autoCapitalize="characters" autoComplete="off" placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
            <button className="btn" style={{ width: '100%' }} disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length < 12 || routerBad} onClick={redeem}>{busy ? 'Checking…' : 'Redeem voucher'}</button></>}
        </>}
      </>}

      {['pushing', 'verifying', 'connecting'].includes(phase) && <div className="empty" role="status"><span className="spin" /><p><b>{msg}</b></p>
        {phase === 'connecting' && <p className="small muted">You have paid. Do not pay again. We are waiting for the hotspot to switch you on.</p>}
        <button className="btn alt sm" onClick={reset}>Start over</button></div>}
      {phase === 'connected' && access && <div className="empty"><div className="badge" style={{ fontSize: '.95rem' }}>Connected</div><h2 className="mt">{access.package_name}</h2>
        <p style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--gd)', margin: '.2rem 0' }}>{access.remaining_seconds != null ? fmt(access.remaining_seconds) : ''}</p><div className="muted small">time remaining{access.data_remaining_mb != null && ` · ${access.data_remaining_mb} MB left`}</div>
        <p className="small muted mt">Your device is authorized. If a page does not load, turn Wi-Fi off and on once.</p>
        <a className="btn" href="https://www.google.com">Start browsing</a> <button className="btn alt" onClick={reset}>Done</button></div>}
      {phase === 'failed' && <div><div className="alert err" role="alert">{msg}</div><button className="btn" onClick={reset}>Try again</button></div>}

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '1.2rem 0' }} />
      <div className="row"><b className="small">Need help?</b>{b.phone && <a className="btn alt sm" href={call(b.phone)}>Call {b.phone}</a>}{b.whatsapp && <a className="btn alt sm" href={wa(b.whatsapp)} target="_blank" rel="noreferrer">WhatsApp</a>}</div>
      <div className="row mt small"><button className="btn alt sm" onClick={() => setLegal(legal === 'terms' ? null : 'terms')}>Terms of service</button><button className="btn alt sm" onClick={() => setLegal(legal === 'privacy' ? null : 'privacy')}>Privacy</button></div>
      {legal && <div className="card mt small" style={{ whiteSpace: 'pre-wrap' }}>{(legal === 'terms' ? b.terms : b.privacy) || 'The business has not published this information yet.'}</div>}
      <p className="muted small mt" style={{ textAlign: 'center' }}>Powered by Decan Konnect</p>
    </div></div>);
}
