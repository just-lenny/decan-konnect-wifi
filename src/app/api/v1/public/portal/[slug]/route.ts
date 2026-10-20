import { db } from '@/lib/server/db';
import { handler, ok, ApiError, rateLimit, clientIp } from '@/lib/server/http';
import { durationLabel, isAvailableNow } from '@/lib/durations';
import { routerOnline } from '@/lib/server/payments';

export const dynamic = 'force-dynamic';

export const GET = handler<{ slug: string }>(async (req, { slug }) => {
  await rateLimit(`portal:${clientIp(req)}`, 120, 60);
  const s = slug.toLowerCase();
  const { data: b } = await db().from('businesses')
    .select('id,display_name,slug,description,logo_url,cover_url,phone,whatsapp,email,town,county,welcome_message,terms,privacy,portal_mode,status')
    .eq('slug', s).maybeSingle();
  if (!b || b.portal_mode === 'draft' || b.status === 'suspended') throw new ApiError(404, 'not_found', 'This portal is not available.');

  const live = b.status === 'active' && (b.portal_mode === 'live' || b.portal_mode === 'voucher_only');
  const { data: pk } = await db().from('packages').select('*').eq('business_id', b.id).eq('is_published', true).eq('status', 'active').order('sort_order').order('price_amount');
  const packages = (pk ?? []).filter((p) => isAvailableNow(p.schedule)).map((p) => ({
    id: p.id, name: p.name, description: p.description, price: p.price_amount, currency: p.currency,
    duration: durationLabel(p.duration_unit, p.duration_value), data_limit_mb: p.data_limit_mb, down_kbps: p.down_kbps, up_kbps: p.up_kbps,
    max_devices: p.max_devices, promo_label: p.promo_label,
  }));

  const { data: cfg } = await db().from('payment_provider_configs').select('method,till_or_paybill,account_reference_rule,instructions,status').eq('business_id', b.id).maybeSingle();
  const stk = live && b.portal_mode === 'live' && cfg?.status === 'verified';
  const manual = live && b.portal_mode === 'live' && !!cfg?.till_or_paybill && cfg.status !== 'disabled';

  const rid = new URL(req.url).searchParams.get('r');
  let router: { valid: boolean; online: boolean } | null = null;
  if (rid) {
    const { data: r } = await db().from('routers').select('status,last_seen_at').eq('business_id', b.id).eq('public_id', rid).maybeSingle();
    router = r ? { valid: true, online: routerOnline(r) } : { valid: false, online: false };
  }

  return ok({
    business: { name: b.display_name, slug: b.slug, description: b.description, logo_url: b.logo_url, cover_url: b.cover_url, phone: b.phone, whatsapp: b.whatsapp,
      email: b.email, location: [b.town, b.county].filter(Boolean).join(', '), welcome_message: b.welcome_message, terms: b.terms, privacy: b.privacy },
    mode: b.portal_mode, active: b.status === 'active',
    packages,
    payment: { stk, manual: manual ? { method: cfg!.method, number: cfg!.till_or_paybill, account_rule: cfg!.method === 'paybill' ? cfg!.account_reference_rule : null, instructions: cfg!.instructions } : null },
    vouchers: live,
    router,
  });
});
