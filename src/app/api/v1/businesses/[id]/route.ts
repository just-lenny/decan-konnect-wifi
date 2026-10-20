import { db, must } from '@/lib/server/db';
import { requireRole, audit } from '@/lib/server/auth';
import { handler, ok, ApiError, readJson, v } from '@/lib/server/http';
import { validateSlug } from '@/lib/slug';
import { env } from '@/lib/server/env';

export const dynamic = 'force-dynamic';

export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireRole(req, v.uuid(id, 'id'));
  const b = must(await db().from('businesses').select('*').eq('id', id).single());
  return ok({ ...b, portal_url: `${env.baseUrl}/${b.slug}` });
});

export const PATCH = handler<{ id: string }>(async (req, { id }) => {
  const { user, role } = await requireRole(req, v.uuid(id, 'id'), ['owner', 'admin']);
  const b = await readJson(req);
  const cur = must(await db().from('businesses').select('*').eq('id', id).single());
  const upd: Record<string, any> = {};
  const text = (k: string, col: string, o: { max: number; min?: number; optional?: boolean }) => { if (b[k] !== undefined) upd[col] = b[k] === '' && o.optional !== false ? null : v.str(b[k], k, o); };
  text('name', 'name', { min: 2, max: 120, optional: false }); text('displayName', 'display_name', { min: 2, max: 120, optional: false });
  text('category', 'category', { max: 40 }); text('description', 'description', { max: 1000 }); text('logoUrl', 'logo_url', { max: 500 }); text('coverUrl', 'cover_url', { max: 500 });
  text('phone', 'phone', { max: 20 }); text('whatsapp', 'whatsapp', { max: 20 }); text('email', 'email', { max: 120 }); text('county', 'county', { max: 60 });
  text('town', 'town', { max: 60 }); text('address', 'address', { max: 200 }); text('welcomeMessage', 'welcome_message', { max: 500 });
  text('terms', 'terms', { max: 10000 }); text('privacy', 'privacy', { max: 10000 });
  for (const k of ['logo_url', 'cover_url']) if (upd[k] && !/^https:\/\//.test(upd[k])) throw new ApiError(400, 'invalid', 'Image links must start with https://');
  if (b.setupStep !== undefined) upd.setup_step = v.int(b.setupStep, 'setupStep', 1, 7);

  if (b.slug !== undefined && b.slug !== cur.slug) {
    if (role !== 'owner') throw new ApiError(403, 'forbidden', 'Only the business owner can change the portal address.');
    const err = validateSlug(String(b.slug)); if (err) throw new ApiError(400, 'invalid_slug', err);
    if (cur.portal_mode !== 'draft' && b.confirmSlugChange !== true) throw new ApiError(409, 'confirm_required', 'Changing a published address breaks printed QR codes and links. Confirm to continue.');
    const { data: taken } = await db().from('businesses').select('id').ilike('slug', b.slug).neq('id', id).maybeSingle();
    if (taken) throw new ApiError(409, 'slug_taken', 'That portal address is already taken.');
    upd.slug = String(b.slug);
    await audit(id, user.id, 'business.slug_changed', 'business', id, { from: cur.slug, to: b.slug });
  }

  if (b.portalMode !== undefined) {
    const mode = v.oneOf(b.portalMode, 'portalMode', ['draft', 'preview', 'voucher_only', 'live'] as const);
    if (['voucher_only', 'live'].includes(mode)) {
      const missing: string[] = [];
      if (!cur.phone && !upd.phone) missing.push('support phone');
      const { count: pk } = await db().from('packages').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('is_published', true).eq('status', 'active');
      if (!pk) missing.push('at least one published package');
      const { count: rt } = await db().from('routers').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('status', 'connected');
      if (!rt) missing.push('a connected router (run the router setup script and wait for first contact)');
      if (mode === 'live') {
        const cfg = (await db().from('payment_provider_configs').select('status,till_or_paybill').eq('business_id', id).single()).data;
        if (!cfg?.till_or_paybill) missing.push('payment destination (Till or Paybill)');
      }
      if (missing.length) throw new ApiError(400, 'incomplete', `Cannot publish yet. Missing: ${missing.join('; ')}.`);
      if (cur.status !== 'active') throw new ApiError(403, 'pending_approval', 'Your business is awaiting Decan Konnect approval. You can use Preview mode meanwhile.');
    }
    upd.portal_mode = mode;
    await audit(id, user.id, 'business.portal_mode', 'business', id, { from: cur.portal_mode, to: mode });
  }
  if (b.setupCompleted === true) upd.setup_completed_at = new Date().toISOString();
  if (!Object.keys(upd).length) return ok(cur);
  const res = must(await db().from('businesses').update(upd).eq('id', id).select('*').single(), 'update business');
  await audit(id, user.id, 'business.updated', 'business', id, { fields: Object.keys(upd) });
  return ok({ ...res, portal_url: `${env.baseUrl}/${res.slug}` });
});
