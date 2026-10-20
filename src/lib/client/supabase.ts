'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let c: SupabaseClient | null = null;
/** Browser client uses the ANON key only. All data access goes through /api/v1 (and RLS). */
export function sb(): SupabaseClient {
  if (!c) c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return c;
}
