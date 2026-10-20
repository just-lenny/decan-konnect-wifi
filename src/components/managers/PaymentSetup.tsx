'use client';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { Badge, CopyButton, Field, Loading, when, useToast } from '../ui';
import { useBiz } from '../Shell';

export function PaymentSetup() {
  const { biz } = useBiz();
  const { data, loading, reload } = useApi<any>(`/businesses/${biz.id}/payment-config`);
  const [f, setF] = useState<any>(null); const toast = useToast(); const [phone, setPhone] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF({ method: data.method ?? 'till', tillOrPaybill: data.till_or_paybill ?? '', shortcode: data.shortcode ?? '', accountRule: data.account_reference_rule ?? '', instructions: data.instructions ?? '', darajaEnv: data.daraja_env, consumerKey: '', consumerSecret: '', passkey: '' }); }, [data]);
  // While a test prompt is out, ask the server to resolve it (callback or STK Query) and refresh.
  useEffect(() => {
    if (data?.status !== 'testing' || !data?.last_test_result?.includes('prompt sent')) return;
    const t = setInterval(async () => { await api(`/businesses/${biz.id}/payment-config/test`).catch(() => null); reload(); }, 5000);
    return () => clearInterval(t);
  }, [data?.status, data?.last_test_result]); // eslint-disable-line
  if (loading || !f) return <Loading />;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const run = async (fn: () => Promise<any>, okMsg?: string) => { setBusy(true); toast.clear(); try { const r = await fn(); if (okMsg) toast.ok(okMsg); await reload(); return r; } catch (e: any) { toast.err(e.message); } finally { setBusy(false); } };
  const till = f.method === 'till';
  return (<div className="card">
    {toast.node}
    <div className="row between"><h2 style={{ margin: 0 }}>Your M-Pesa receiving account</h2><Badge s={data.status} /></div>
    <p className="muted small">Customer payments go to <b>your</b> Till or Paybill, never to Decan Konnect. Saving a number does not prove ownership or that automatic payments work: only a successful test payment marks it verified.</p>
    <div className="alert info small"><b>Two ways to get paid.</b><br /><b>1) Pay-then-verify (always available):</b> customers pay your Till/Paybill from their M-Pesa menu and submit the SMS code. Access is granted only after you confirm the payment in your statement (or import your statement).<br /><b>2) Instant M-Pesa prompt (STK Push):</b> needs your own Safaricom Daraja app, your Lipa na M-Pesa passkey and a shortcode approved for STK Push. Complete the credentials below, then run the two verification steps.</div>
    <div className="grid g2">
      <Field label="Payment type"><select value={f.method} onChange={set('method')}><option value="till">Buy Goods: Till number</option><option value="paybill">Paybill</option></select></Field>
      <Field label={till ? 'Till number' : 'Paybill number'} hint="5-7 digits. We cannot verify ownership from the number alone."><input inputMode="numeric" value={f.tillOrPaybill} onChange={set('tillOrPaybill')} /></Field>
      {till && <Field label="Store / head-office number" hint="Daraja needs this as the BusinessShortCode for Till payments (shown in your Daraja/Safaricom portal)."><input inputMode="numeric" value={f.shortcode} onChange={set('shortcode')} /></Field>}
      {!till && <Field label="Account reference rule" hint="e.g. WIFI or {phone}. Shown to customers paying manually."><input value={f.accountRule} onChange={set('accountRule')} /></Field>}
      <Field label="Daraja environment" hint="Use sandbox for practice. Switch to production only with live credentials."><select value={f.darajaEnv} onChange={set('darajaEnv')}><option value="sandbox">Sandbox</option><option value="production">Production</option></select></Field>
    </div>
    <h3>Daraja credentials (for instant prompts)</h3>
    <p className="muted small">Stored encrypted on the server and never shown again. Leave blank to keep the saved value. Never enter your M-Pesa PIN or Safaricom account password here.</p>
    <div className="grid g2">
      <Field label="Consumer key" hint={data.secrets.consumer_key && `Saved: ${data.secrets.consumer_key}`}><input type="password" autoComplete="off" value={f.consumerKey} onChange={set('consumerKey')} /></Field>
      <Field label="Consumer secret" hint={data.secrets.consumer_secret && `Saved: ${data.secrets.consumer_secret}`}><input type="password" autoComplete="off" value={f.consumerSecret} onChange={set('consumerSecret')} /></Field>
      <Field label="Lipa na M-Pesa passkey" hint={data.secrets.passkey && `Saved: ${data.secrets.passkey}`}><input type="password" autoComplete="off" value={f.passkey} onChange={set('passkey')} /></Field>
    </div>
    <Field label="Instructions shown to customers paying manually"><textarea value={f.instructions} onChange={set('instructions')} placeholder="Go to M-Pesa > Lipa na M-Pesa > Buy Goods, enter the Till number and the exact package amount." /></Field>
    <div className="row"><button className="btn" disabled={busy} onClick={() => run(() => api(`/businesses/${biz.id}/payment-config`, { method: 'PUT', body: f }), 'Payment settings saved.')}>Save settings</button>
      {data.status !== 'not_configured' && data.status !== 'disabled' && <button className="btn danger" disabled={busy} onClick={() => run(() => api(`/businesses/${biz.id}/payment-config`, { method: 'PUT', body: { disable: true } }), 'Payments disabled.')}>Disable payments</button>}</div>
    <h3 className="mt">Verify the instant prompt</h3>
    <div className="small muted mb">Callback URL (sent automatically with each prompt, nothing to register): <code>{data.callback_url}</code> <CopyButton text={data.callback_url} /></div>
    <div className="row"><button className="btn alt" disabled={busy || !data.has_secrets} onClick={async () => { const r = await run(() => api(`/businesses/${biz.id}/payment-config/test`, { method: 'POST', body: { step: 'credentials' } })); if (r) (r.passed ? toast.ok : toast.err)(r.message); }}>Step 1: Test credentials</button></div>
    <div className="row mt"><input style={{ maxWidth: 220 }} placeholder="Your phone 07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Your phone number" />
      <button className="btn alt" disabled={busy || !phone || data.status === 'not_configured'} onClick={async () => { const r = await run(() => api(`/businesses/${biz.id}/payment-config/test`, { method: 'POST', body: { step: 'stk', phone } })); if (r) (r.passed === false ? toast.err : toast.info)(r.message); }}>Step 2: Send KES 1 test prompt</button></div>
    {data.last_test_result && <div className={`alert ${data.status === 'verified' ? 'ok' : data.status === 'failed' ? 'err' : 'info'}`}>{data.last_test_result} <span className="small">({when(data.last_test_at)})</span></div>}
  </div>);
}
