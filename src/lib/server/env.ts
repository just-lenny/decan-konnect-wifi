function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
export const env = {
  get supabaseUrl() { return need('NEXT_PUBLIC_SUPABASE_URL'); },
  get serviceKey() { return need('SUPABASE_SERVICE_ROLE_KEY'); },
  get baseUrl() { return need('APP_BASE_URL').replace(/\/$/, ''); },
  get encKey() { return need('SECRET_ENCRYPTION_KEY'); },
  get pepper() { const p = need('VOUCHER_PEPPER'); if (p.length < 32) throw new Error('VOUCHER_PEPPER must be >= 32 chars'); return p; },
  get cronSecret() { return need('CRON_SECRET'); },
  get verifyCallbacks() { return (process.env.MPESA_VERIFY_CALLBACK_WITH_QUERY ?? 'true') !== 'false'; },
};
