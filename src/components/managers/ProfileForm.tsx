'use client';
import { useEffect, useState } from 'react';
import { api, useApi } from '@/lib/client/api';
import { slugify, validateSlug } from '@/lib/slug';
import { Field, Loading, useToast, CopyButton } from '../ui';
import { useBiz } from '../Shell';

const CATS = [['cybercafe', 'Cybercafé'], ['hotspot', 'Wi-Fi hotspot operator'], ['shop', 'Shop'], ['hotel', 'Hotel'], ['apartments', 'Apartments'], ['gaming', 'Gaming lounge'], ['school', 'School'], ['other', 'Other']];

export function ProfileForm({ onSaved }: { onSaved?: () => void }) {
  const { biz, role, refresh } = useBiz();
  const { data, loading } = useApi<any>(`/businesses/${biz.id}`);
  const [f, setF] = useState<any>(null); const [slugMsg, setSlugMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const toast = useToast(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF({ ...data }); }, [data]);
  useEffect(() => {
    if (!f || !data || f.slug === data.slug) { setSlugMsg(null); return; }
    const err = validateSlug(f.slug); if (err) { setSlugMsg({ ok: false, t: err }); return; }
    const t = setTimeout(async () => { try { const r = await api<any>(`/businesses/slug-available?slug=${encodeURIComponent(f.slug)}&exclude=${biz.id}`); setSlugMsg({ ok: r.available, t: r.available ? 'Available' : r.reason }); } catch { /* ignore */ } }, 350);
    return () => clearTimeout(t);
  }, [f?.slug]); // eslint-disable-line
  if (loading || !f) return <Loading />;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true); toast.clear();
    try {
      const body: any = { name: f.name, displayName: f.display_name, category: f.category, description: f.description ?? '', logoUrl: f.logo_url ?? '', phone: f.phone ?? '', whatsapp: f.whatsapp ?? '', email: f.email ?? '', county: f.county ?? '', town: f.town ?? '', address: f.address ?? '' };
      if (f.slug !== data.slug) { body.slug = f.slug; if (data.portal_mode !== 'draft' && !window.confirm('Changing a published portal address breaks existing links and printed QR codes. Continue?')) { setBusy(false); return; } body.confirmSlugChange = true; }
      await api(`/businesses/${biz.id}`, { method: 'PATCH', body }); toast.ok('Business profile saved.'); await refresh(); onSaved?.();
    } catch (e: any) { toast.err(e.message); }
    setBusy(false);
  };
  return (
    <div className="card">
      {toast.node}
      <div className="grid g2">
        <Field label="Registered / operating name"><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Public display name" hint="Shown to customers on the portal."><input value={f.display_name} onChange={set('display_name')} /></Field>
        <Field label="Business category"><select value={f.category} onChange={set('category')}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Logo image link" hint="Paste an https:// link to your logo (square works best)."><input value={f.logo_url ?? ''} onChange={set('logo_url')} placeholder="https://..." /></Field>
        <Field label="Support phone number"><input value={f.phone ?? ''} onChange={set('phone')} inputMode="tel" /></Field>
        <Field label="WhatsApp number"><input value={f.whatsapp ?? ''} onChange={set('whatsapp')} inputMode="tel" /></Field>
        <Field label="Business email (optional)"><input value={f.email ?? ''} onChange={set('email')} type="email" /></Field>
        <Field label="County"><input value={f.county ?? ''} onChange={set('county')} /></Field>
        <Field label="Town"><input value={f.town ?? ''} onChange={set('town')} /></Field>
        <Field label="Physical location"><input value={f.address ?? ''} onChange={set('address')} /></Field>
      </div>
      <Field label="Business description"><textarea value={f.description ?? ''} onChange={set('description')} /></Field>
      <Field label="Public portal address (slug)" hint="Lowercase letters, numbers and hyphens. Reserved words such as admin, api, login are blocked.">
        <div className="row"><span className="muted small">{typeof window !== 'undefined' ? window.location.host : ''}/</span>
          <input style={{ maxWidth: 260 }} value={f.slug} disabled={role !== 'owner'} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          <button type="button" className="btn alt sm" disabled={role !== 'owner'} onClick={() => setF({ ...f, slug: slugify(f.name) })}>Suggest from name</button></div>
        {slugMsg && <div className={`small ${slugMsg.ok ? '' : ''}`} style={{ color: slugMsg.ok ? 'var(--gd)' : 'var(--bad)' }}>{slugMsg.t}</div>}
        {role !== 'owner' && <div className="small muted">Only the owner can change the address.</div>}
      </Field>
      <div className="row"><button className="btn" onClick={save} disabled={busy || (slugMsg ? !slugMsg.ok : false)}>Save profile</button>
        <span className="muted small">Portal URL: {data.portal_url}</span><CopyButton text={data.portal_url} label="Copy URL" /></div>
    </div>
  );
}
