/** 07XXXXXXXX, 01XXXXXXXX, +2547..., 2547... -> 2547XXXXXXXX / 2541XXXXXXXX; null if invalid. */
export function normalizeKenyanPhone(input: string): string | null {
  const d = String(input ?? '').replace(/[\s\-()]/g, '').replace(/^\+/, '');
  let n: string;
  if (/^0[17]\d{8}$/.test(d)) n = '254' + d.slice(1);
  else if (/^254[17]\d{8}$/.test(d)) n = d;
  else if (/^[17]\d{8}$/.test(d)) n = '254' + d;
  else return null;
  return n;
}

export function normalizeMac(input: string): string | null {
  const s = String(input ?? '').trim().toUpperCase().replace(/-/g, ':');
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(s) ? s : null;
}

/** Till / Paybill / store numbers are 5-7 digits. Format check only: it proves nothing about ownership. */
export function isValidShortcode(s: string): boolean {
  return /^\d{5,7}$/.test(String(s ?? ''));
}

export function isValidAccountRule(s: string): boolean {
  return /^[A-Za-z0-9 _\-{}]{1,24}$/.test(String(s ?? ''));
}

/** M-Pesa confirmation codes are 10 uppercase alphanumerics, e.g. SGL4X8AB12. */
export function isValidReceipt(s: string): boolean {
  return /^[A-Z0-9]{10}$/.test(String(s ?? '').trim().toUpperCase());
}

export function kes(n: number): string {
  return 'KES ' + Number(n).toLocaleString('en-KE');
}
