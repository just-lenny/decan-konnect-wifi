import { db } from './db';
import { ApiError } from './http';
import { sha256 } from '../crypto';

export async function authRouter(req: Request) {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (token.length < 20) throw new ApiError(401, 'unauthorized', 'Unauthorized');
  const { data: r } = await db().from('routers').select('*').eq('agent_token_hash', sha256(token)).maybeSingle();
  if (!r) throw new ApiError(401, 'unauthorized', 'Unauthorized');
  return { router: r, token };
}
