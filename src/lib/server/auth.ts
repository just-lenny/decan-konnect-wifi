import { db } from './db';
import { ApiError } from './http';

export type Role = 'owner' | 'admin' | 'staff';
export interface AuthUser { id: string; email: string | null }

export async function authUser(req: Request): Promise<AuthUser> {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new ApiError(401, 'unauthenticated', 'Please sign in.');
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'unauthenticated', 'Your session has expired. Please sign in again.');
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Server-side tenant check used by EVERY /businesses/[id]/* route. */
export async function requireRole(req: Request, businessId: string, roles: Role[] = ['owner', 'admin', 'staff']) {
  const user = await authUser(req);
  const { data } = await db().from('business_members').select('role').eq('business_id', businessId).eq('user_id', user.id).maybeSingle();
  // Same response for "no such business" and "not yours": never reveal other tenants.
  if (!data || !roles.includes(data.role as Role)) throw new ApiError(404, 'not_found', 'Business not found.');
  return { user, role: data.role as Role };
}

export async function requirePlatformAdmin(req: Request): Promise<AuthUser> {
  const user = await authUser(req);
  const { data } = await db().from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!data) throw new ApiError(404, 'not_found', 'Not found.');
  return user;
}

export async function audit(businessId: string | null, actor: string | null, action: string, entityType: string, entityId: string | null, detail: unknown = null, actorType = 'user') {
  await db().rpc('write_audit', { p_business: businessId, p_actor: actor, p_type: actorType, p_action: action, p_entity_type: entityType, p_entity_id: entityId, p_detail: detail });
}
