import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 symbols, no 0/O/1/I/L

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** 12 symbols from a 31-letter alphabet = ~59 bits of entropy, CSPRNG-sourced. */
export function generateVoucherCode(): string {
  let out = '';
  for (let i = 0; i < 12; i++) {
    if (i && i % 4 === 0) out += '-';
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export function normalizeVoucherInput(input: string): string | null {
  const raw = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 12) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function hashVoucher(businessId: string, code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${businessId}:${code}`).digest('hex');
}

function key(keyB64: string): Buffer {
  const k = Buffer.from(keyB64, 'base64');
  if (k.length !== 32) throw new Error('SECRET_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return k;
}

export function encryptJson(obj: unknown, keyB64: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(keyB64), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptJson<T = any>(payload: string, keyB64: string): T {
  const [v, iv, tag, ct] = payload.split('.');
  if (v !== 'v1') throw new Error('unsupported ciphertext version');
  const d = createDecipheriv('aes-256-gcm', key(keyB64), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'));
}

export function maskSecret(s: string | undefined | null): string {
  if (!s) return '';
  return s.length <= 6 ? '••••' : '••••••••' + s.slice(-4);
}
