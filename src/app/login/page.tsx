'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/client/supabase';
import { Logo } from '@/components/ui';

export default function Login() {
  const r = useRouter(); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return <div className="auth"><div className="card">
    <div className="row mb"><Logo /><b>Decan Konnect Internet Services</b></div><h1>Business sign in</h1>
    {err && <div className="alert err" role="alert">{err}</div>}
    <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
    <div className="field"><label htmlFor="p">Password</label><input id="p" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (document.getElementById('go') as HTMLButtonElement)?.click()} /></div>
    <button id="go" className="btn" disabled={busy || !email || !pw} onClick={async () => { setBusy(true); setErr(''); const { error } = await sb().auth.signInWithPassword({ email, password: pw }); setBusy(false); error ? setErr('Incorrect email or password.') : r.replace('/dashboard'); }}>Sign in</button>
    <p className="small muted mt">New business? <Link href="/register">Create an account</Link></p></div></div>;
}
