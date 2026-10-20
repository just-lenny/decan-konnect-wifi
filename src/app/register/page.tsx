'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/client/supabase';
import { Logo } from '@/components/ui';

export default function Register() {
  const r = useRouter(); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  return <div className="auth"><div className="card">
    <div className="row mb"><Logo /><b>Decan Konnect Internet Services</b></div><h1>Register your business</h1>
    <p className="muted small">This account is for business owners and staff. Your customers never need an account.</p>
    {err && <div className="alert err" role="alert">{err}</div>}{note && <div className="alert ok">{note}</div>}
    <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
    <div className="field"><label htmlFor="p">Password<span className="hint">At least 10 characters.</span></label><input id="p" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
    <button className="btn" disabled={busy || !email || pw.length < 10} onClick={async () => {
      setBusy(true); setErr(''); const { data, error } = await sb().auth.signUp({ email, password: pw }); setBusy(false);
      if (error) setErr(error.message); else if (data.session) r.replace('/dashboard'); else setNote('Check your email to confirm your address, then sign in.');
    }}>Create account</button>
    <p className="small muted mt">Already registered? <Link href="/login">Sign in</Link></p></div></div>;
}
