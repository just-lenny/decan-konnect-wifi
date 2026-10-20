'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { sb } from '@/lib/client/supabase';
import { Loading, Logo } from './ui';
import { slugify } from '@/lib/slug';

export interface Biz { id: string; name: string; display_name: string; slug: string; portal_mode: string; status: string; setup_step: number; setup_completed_at: string | null; logo_url: string | null }
interface Ctx { biz: Biz; role: string; refresh: () => Promise<void>; platformAdmin: boolean }
const BizCtx = createContext<Ctx | null>(null);
export const useBiz = () => useContext(BizCtx)!;

const NAV: [string, string][] = [
  ['/dashboard', 'Overview'], ['/dashboard/setup', 'Setup wizard'], ['/dashboard/profile', 'Business profile'], ['/dashboard/portal', 'Captive portal'],
  ['/dashboard/packages', 'Packages'], ['/dashboard/vouchers', 'Vouchers'], ['/dashboard/payments', 'Payments'], ['/dashboard/customers', 'Customers'],
  ['/dashboard/sessions', 'Active sessions'], ['/dashboard/routers', 'Routers & sites'], ['/dashboard/staff', 'Staff & permissions'],
  ['/dashboard/reports', 'Reports'], ['/dashboard/support', 'Support'], ['/dashboard/security', 'Security'],
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const path = usePathname(); const router = useRouter();
  const [ctx, setCtx] = useState<{ biz: Biz; role: string; platformAdmin: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data } = await sb().auth.getSession();
    if (!data.session) { router.replace('/login'); return; }
    const me = await api<any>('/me');
    if (!me.memberships.length) { setCreating(true); return; }
    const saved = typeof window !== 'undefined' ? localStorage.getItem('dk_biz') : null;
    const m = me.memberships.find((x: any) => x.business.id === saved) ?? me.memberships[0];
    setCtx({ biz: m.business, role: m.role, platformAdmin: me.platformAdmin });
  };
  useEffect(() => { load().catch(() => router.replace('/login')); /* eslint-disable-next-line */ }, []);
  useEffect(() => { setOpen(false); }, [path]);

  if (creating) return <CreateBusiness onDone={() => { setCreating(false); load(); }} />;
  if (!ctx) return <Loading />;
  return (
    <BizCtx.Provider value={{ ...ctx, refresh: load }}>
      <div className="top"><button aria-label="Menu" onClick={() => setOpen(!open)}>☰</button><b>{ctx.biz.display_name}</b></div>
      <div className="shell">
        <nav className={`side ${open ? 'open' : ''}`} aria-label="Main">
          <div className="brand"><Logo /><div>Decan Konnect<div style={{ fontWeight: 400, fontSize: '.72rem', opacity: .8 }}>Internet Services</div></div></div>
          <div className="small" style={{ opacity: .85, margin: '0 .7rem .8rem' }}>{ctx.biz.display_name}<br /><span className="badge" style={{ marginTop: 4 }}>{ctx.biz.portal_mode.replace('_', ' ')}</span></div>
          {NAV.map(([href, label]) => <Link key={href} href={href} className={path === href ? 'on' : ''}>{label}</Link>)}
          {ctx.platformAdmin && <Link href="/admin">Super-admin</Link>}
          <a href="#" onClick={async (e) => { e.preventDefault(); await sb().auth.signOut(); router.replace('/login'); }}>Sign out</a>
        </nav>
        <main className="main">{children}</main>
      </div>
    </BizCtx.Provider>
  );
}

function CreateBusiness({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="auth"><div className="card">
      <h1>Create your business</h1><p className="muted">You will configure the portal, packages, router and payments in a guided wizard next.</p>
      {err && <div className="alert err">{err}</div>}
      <div className="field"><label htmlFor="bn">Business name</label><input id="bn" value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} placeholder="Decan Cyber" /></div>
      <div className="field"><label htmlFor="bs">Portal address<span className="hint">Customers will open yourdomain/{slug || 'your-name'}</span></label><input id="bs" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} /></div>
      <button className="btn" disabled={busy || name.trim().length < 2} onClick={async () => {
        setBusy(true); setErr('');
        try { await api('/businesses', { method: 'POST', body: { name, slug } }); onDone(); } catch (e: any) { setErr(e.message); } setBusy(false);
      }}>Create business</button>
    </div></div>
  );
}
