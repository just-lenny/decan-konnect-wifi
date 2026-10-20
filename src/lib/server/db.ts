import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;
/** Service-role client. Server only: bypasses RLS, so every caller must authorize explicitly. */
export function db(): SupabaseClient {
  if (!client) client = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export function must<T>(r: { data: T | null; error: { message: string } | null }, what = 'query'): T {
  if (r.error) { console.error(`[db] ${what}:`, r.error.message); throw new Error('Database error'); }
  return r.data as T;
}
