'use client';
import { useState, type ReactNode } from 'react';

export const Spinner = () => <span className="spin" role="status" aria-label="Loading" />;
export const Loading = () => <div className="empty"><Spinner /></div>;
export const ErrorBox = ({ msg }: { msg: string | null }) => msg ? <div className="alert err" role="alert">{msg}</div> : null;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Badge({ s }: { s: string }) {
  const bad = ['failed', 'expired', 'cancelled', 'suspended', 'revoked', 'authentication_failure', 'configuration_error', 'offline'];
  const warn = ['pending', 'awaiting_verification', 'awaiting_enrollment', 'awaiting_credentials', 'awaiting_authorization', 'testing', 'configuration_pending', 'pending_authorization', 'draft'];
  const gray = ['not_configured', 'disabled', 'archived', 'unused'];
  const cls = bad.includes(s) ? 'bad' : warn.includes(s) ? 'warn' : gray.includes(s) ? 'gray' : '';
  return <span className={`badge ${cls}`}>{s.replace(/_/g, ' ')}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div className="field"><label>{label}{hint && <span className="hint">{hint}</span>}</label>{children}</div>;
}

export function Confirm({ label, message, onYes, danger, small }: { label: string; message: string; onYes: () => void | Promise<void>; danger?: boolean; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (<>
    <button className={`btn ${danger ? 'danger' : 'alt'} ${small ? 'sm' : ''}`} onClick={() => setOpen(true)}>{label}</button>
    {open && (
      <div role="dialog" aria-modal="true" aria-label={label} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
        <div className="card" style={{ maxWidth: 420 }}>
          <h3>{label}</h3><p>{message}</p>
          <div className="row"><button className="btn alt" onClick={() => setOpen(false)}>Cancel</button>
            <button className={`btn ${danger ? 'danger' : ''}`} onClick={async () => { setOpen(false); await onYes(); }}>Confirm</button></div>
        </div>
      </div>)}
  </>);
}

export function useToast() {
  const [t, setT] = useState<{ kind: 'ok' | 'err' | 'warn' | 'info'; msg: string } | null>(null);
  const node = t ? <div className={`alert ${t.kind}`} role="status">{t.msg}</div> : null;
  return { node, ok: (msg: string) => setT({ kind: 'ok', msg }), err: (msg: string) => setT({ kind: 'err', msg }), info: (msg: string) => setT({ kind: 'info', msg }), clear: () => setT(null) };
}

export function Logo({ size = 34 }: { size?: number }) {
  return <span className="logo" style={{ width: size, height: size }} aria-hidden>DK</span>;
}

export const kes = (n: number) => 'KES ' + Number(n).toLocaleString('en-KE');
export const when = (s?: string | null) => s ? new Date(s).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }) : '-';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn alt sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { window.prompt('Copy this:', text); } }}>{done ? 'Copied' : label}</button>;
}
