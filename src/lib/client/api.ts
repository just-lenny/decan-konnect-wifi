'use client';
import { useCallback, useEffect, useState } from 'react';
import { sb } from './supabase';

export class ApiFail extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false) {
    const { data } = await sb().auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  let res: Response;
  try { res = await fetch(`/api/v1${path}`, { method: opts.method ?? 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: 'no-store' }); }
  catch { throw new ApiFail('offline', 'You appear to be offline. Check your connection and try again.', 0); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFail(j?.error?.code ?? 'error', j?.error?.message ?? 'Something went wrong.', res.status);
  return j.data as T;
}

export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await api<T>(path)); } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
