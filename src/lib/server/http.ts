import { NextResponse } from 'next/server';
import { db } from './db';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const ok = (data: unknown, status = 200) => NextResponse.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } });

export function handler<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try { return await fn(req, await ctx.params); }
    catch (e: any) {
      if (e instanceof ApiError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
      console.error('[api] unhandled', e?.message ?? e);
      return NextResponse.json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, { status: 500 });
    }
  };
}

export async function readJson<T = any>(req: Request, maxBytes = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, 'too_large', 'Request body too large.');
  try { return JSON.parse(text || '{}'); } catch { throw new ApiError(400, 'bad_json', 'Invalid JSON.'); }
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}

/** DB-backed fixed-window limiter (works across serverless instances). */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const { data, error } = await db().rpc('rate_limit_hit', { p_key: key, p_window: windowSec, p_max: max });
  if (error) { console.error('[ratelimit]', error.message); return; } // fail open on infra error, never block payments
  if (data === false) throw new ApiError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.');
}

// ---- tiny validators
export const v = {
  str(x: any, name: string, o: { min?: number; max?: number; optional?: boolean; pattern?: RegExp } = {}): string {
    if (x === undefined || x === null || x === '') {
      if (o.optional) return '' as string;
      throw new ApiError(400, 'invalid', `${name} is required.`);
    }
    if (typeof x !== 'string') throw new ApiError(400, 'invalid', `${name} must be text.`);
    const s = x.trim();
    if (s.length < (o.min ?? 0)) throw new ApiError(400, 'invalid', `${name} is too short.`);
    if (s.length > (o.max ?? 500)) throw new ApiError(400, 'invalid', `${name} is too long.`);
    if (o.pattern && !o.pattern.test(s)) throw new ApiError(400, 'invalid', `${name} has an invalid format.`);
    return s;
  },
  int(x: any, name: string, min: number, max: number, optional = false): number | null {
    if ((x === undefined || x === null || x === '') && optional) return null;
    const n = typeof x === 'string' ? Number(x) : x;
    if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, 'invalid', `${name} must be a whole number between ${min} and ${max}.`);
    return n;
  },
  oneOf<T extends string>(x: any, name: string, list: readonly T[]): T {
    if (!list.includes(x)) throw new ApiError(400, 'invalid', `${name} is not valid.`);
    return x;
  },
  uuid(x: any, name: string): string {
    if (typeof x !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)) throw new ApiError(400, 'invalid', `${name} is invalid.`);
    return x.toLowerCase();
  },
  secretKey(x: any, name: string): string {
    if (typeof x !== 'string' || x.length < 16 || x.length > 200) throw new ApiError(400, 'invalid', `${name} is invalid.`);
    return x;
  },
};
