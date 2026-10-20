'use client';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { Badge, CopyButton, Field, Loading, useToast } from '@/components/ui';
import { useBiz } from '@/components/Shell';

export default function P() {
  const { biz, role, refresh } = useBiz(); const { data, loading, reload } = useApi<any>(`/businesses/${biz.id}`); const t = useToast();
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (data) setF({ welcomeMessage: data.welcome_message ?? '', terms: data.terms ?? '', privacy: data.privacy ?? '', coverUrl: data.cover_url ?? '' }); }, [data]);
  if (loading || !f) return <Loading />;
  const mode = async (portalMode: string) => { try { await api(`/businesses/${biz.id}`, { method: 'PATCH', body: { portalMode } }); t.ok(`Portal mode set to ${portalMode.replace('_', ' ')}.`); await refresh(); reload(); } catch (e: any) { t.err(e.message); } };
  const url = data.portal_url;
  return <div><h1>Captive portal</h1><p className="muted mb">Customize and publish what customers see after connecting to your Wi-Fi.</p>{t.node}
    <div className="card mb"><div className="row between"><h2 style={{ margin: 0 }}>Publication</h2><Badge s={data.portal_mode} /></div>
      <p className="small muted">Preview: portal visible, purchasing disabled. Voucher-only: customers can redeem vouchers (no M-Pesa). Live: vouchers and M-Pesa. Do not call paid Wi-Fi ready until you have run the end-to-end router test in the setup guide.</p>
      <div className="row"><button className="btn alt" onClick={() => mode('draft')}>Unpublish</button><button className="btn alt" onClick={() => mode('preview')}>Preview</button><button className="btn alt" onClick={() => mode('voucher_only')} disabled={role === 'staff'}>Voucher-only</button><button className="btn" onClick={() => mode('live')} disabled={role === 'staff'}>Go live</button></div>
      <div className="row mt"><code>{url}</code><CopyButton text={url} label="Copy URL" /><a className="btn alt sm" href={url} target="_blank" rel="noreferrer">Open portal</a></div></div>
    <div className="card"><h2>Portal content</h2>
      <Field label="Welcome message"><textarea maxLength={500} value={f.welcomeMessage} onChange={(e) => setF({ ...f, welcomeMessage: e.target.value })} /></Field>
      <Field label="Cover image link (optional, https)"><input value={f.coverUrl} onChange={(e) => setF({ ...f, coverUrl: e.target.value })} /></Field>
      <Field label="Terms of service"><textarea value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
      <Field label="Privacy information" hint="Say what you collect (phone number, device address), why, and how long you keep it."><textarea value={f.privacy} onChange={(e) => setF({ ...f, privacy: e.target.value })} /></Field>
      <button className="btn" onClick={async () => { try { await api(`/businesses/${biz.id}`, { method: 'PATCH', body: f }); t.ok('Portal content saved.'); reload(); } catch (e: any) { t.err(e.message); } }}>Save</button></div></div>;
}
