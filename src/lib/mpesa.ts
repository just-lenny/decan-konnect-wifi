/** Daraja (Safaricom) client. Uses each business's OWN credentials; there is no platform-wide shortcode. */
export type DarajaEnv = 'sandbox' | 'production';
export interface DarajaConfig {
  env: DarajaEnv;
  method: 'till' | 'paybill';
  shortcode: string;      // BusinessShortCode: Paybill number, or the Till's store/head-office number
  partyB: string;         // Till number or Paybill number that receives the money
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
}

export function darajaBase(env: DarajaEnv): string {
  return env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
}

/** yyyyMMddHHmmss in Africa/Nairobi (UTC+3). */
export function darajaTimestamp(d: Date = new Date()): string {
  const t = new Date(d.getTime() + 3 * 3600 * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

export function buildStkPayload(cfg: DarajaConfig, a: { amount: number; phone: string; callbackUrl: string; accountRef: string; desc: string }, now = new Date()) {
  const ts = darajaTimestamp(now);
  return {
    BusinessShortCode: cfg.shortcode,
    Password: stkPassword(cfg.shortcode, cfg.passkey, ts),
    Timestamp: ts,
    TransactionType: cfg.method === 'till' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
    Amount: Math.round(a.amount),
    PartyA: a.phone,
    PartyB: cfg.partyB,
    PhoneNumber: a.phone,
    CallBackURL: a.callbackUrl,
    AccountReference: a.accountRef.slice(0, 12) || 'WIFI',
    TransactionDesc: a.desc.slice(0, 13) || 'WiFi',
  };
}

type F = typeof fetch;

export async function getAccessToken(cfg: DarajaConfig, f: F = fetch): Promise<string> {
  const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
  const res = await f(`${darajaBase(cfg.env)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Daraja authentication failed (HTTP ${res.status}). Check consumer key/secret and environment.`);
  const j: any = await res.json();
  if (!j.access_token) throw new Error('Daraja did not return an access token.');
  return j.access_token;
}

export async function stkPush(cfg: DarajaConfig, a: Parameters<typeof buildStkPayload>[1], f: F = fetch) {
  const token = await getAccessToken(cfg, f);
  const res = await f(`${darajaBase(cfg.env)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildStkPayload(cfg, a)), signal: AbortSignal.timeout(20_000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || String(j.ResponseCode) !== '0') {
    throw new Error(j.errorMessage || j.ResponseDescription || `STK push rejected (HTTP ${res.status})`);
  }
  return { checkoutRequestId: String(j.CheckoutRequestID), merchantRequestId: String(j.MerchantRequestID) };
}

export async function stkQuery(cfg: DarajaConfig, checkoutRequestId: string, f: F = fetch) {
  const token = await getAccessToken(cfg, f);
  const ts = darajaTimestamp();
  const res = await f(`${darajaBase(cfg.env)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: cfg.shortcode, Password: stkPassword(cfg.shortcode, cfg.passkey, ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
    signal: AbortSignal.timeout(20_000),
  });
  const j: any = await res.json().catch(() => ({}));
  // While the customer has not yet responded Daraja returns an error body; treat as "unknown", not failure.
  if (j.ResultCode === undefined) return { known: false as const };
  return { known: true as const, resultCode: Number(j.ResultCode), resultDesc: String(j.ResultDesc ?? '') };
}

export interface ParsedCallback {
  checkoutRequestId: string; merchantRequestId: string; resultCode: number; resultDesc: string;
  amount?: number; receipt?: string; phone?: string;
}

export function parseCallback(body: any): ParsedCallback | null {
  const cb = body?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string') return null;
  const items: any[] = cb.CallbackMetadata?.Item ?? [];
  const get = (n: string) => items.find((i) => i?.Name === n)?.Value;
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    merchantRequestId: String(cb.MerchantRequestID ?? ''),
    resultCode: Number(cb.ResultCode),
    resultDesc: String(cb.ResultDesc ?? ''),
    amount: get('Amount') !== undefined ? Number(get('Amount')) : undefined,
    receipt: get('MpesaReceiptNumber') !== undefined ? String(get('MpesaReceiptNumber')) : undefined,
    phone: get('PhoneNumber') !== undefined ? String(get('PhoneNumber')) : undefined,
  };
}
