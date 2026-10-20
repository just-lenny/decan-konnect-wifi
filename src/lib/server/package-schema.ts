import { ApiError, v } from './http';
import { isAllowedDuration } from '../durations';

export function parsePackage(b: any, partial = false) {
  const o: Record<string, any> = {};
  const has = (k: string) => b[k] !== undefined;
  if (!partial || has('name')) o.name = v.str(b.name, 'Name', { min: 2, max: 80 });
  if (has('description')) o.description = b.description ? v.str(b.description, 'Description', { max: 300 }) : null;
  if (!partial || has('price')) o.price_amount = v.int(b.price, 'Price (KES)', 1, 150000);
  if (!partial || has('durationUnit') || has('durationValue')) {
    const unit = v.oneOf(b.durationUnit, 'Duration unit', ['minute', 'hour', 'day', 'month'] as const);
    const val = v.int(b.durationValue, 'Duration', 1, 60) as number;
    if (!isAllowedDuration(unit, val)) throw new ApiError(400, 'invalid_duration', 'Choose one of the standard durations (maximum 1 month).');
    o.duration_unit = unit; o.duration_value = val;
  }
  if (has('dataLimitMb')) o.data_limit_mb = v.int(b.dataLimitMb, 'Data allowance', 1, 1_000_000, true);
  if (has('downKbps')) o.down_kbps = v.int(b.downKbps, 'Download speed', 64, 1_000_000, true);
  if (has('upKbps')) o.up_kbps = v.int(b.upKbps, 'Upload speed', 64, 1_000_000, true);
  if (has('maxDevices')) o.max_devices = v.int(b.maxDevices, 'Devices', 1, 10);
  if (has('sortOrder')) o.sort_order = v.int(b.sortOrder, 'Display order', 0, 9999);
  if (has('promoLabel')) o.promo_label = b.promoLabel ? v.str(b.promoLabel, 'Promo label', { max: 30 }) : null;
  if (has('isPublished')) o.is_published = b.isPublished === true;
  if (has('status')) o.status = v.oneOf(b.status, 'Status', ['active', 'disabled', 'archived'] as const);
  if (has('schedule')) {
    const s = b.schedule;
    if (s) {
      if (s.days && (!Array.isArray(s.days) || s.days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6))) throw new ApiError(400, 'invalid', 'Schedule days are invalid.');
      for (const k of ['from', 'to']) if (s[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s[k])) throw new ApiError(400, 'invalid', 'Schedule times must be HH:MM.');
    }
    o.schedule = s || null;
  }
  return o;
}

