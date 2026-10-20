export type DurationUnit = 'minute' | 'hour' | 'day' | 'month';

export const ALLOWED_DURATIONS: ReadonlyArray<{ unit: DurationUnit; value: number }> = [
  ...[15, 30, 45, 60].map((value) => ({ unit: 'minute' as const, value })),
  ...[1, 5, 8, 12].map((value) => ({ unit: 'hour' as const, value })),
  ...[1, 7, 14].map((value) => ({ unit: 'day' as const, value })),
  { unit: 'month' as const, value: 1 },
];

export function isAllowedDuration(unit: string, value: number): boolean {
  return ALLOWED_DURATIONS.some((d) => d.unit === unit && d.value === value);
}

const EAT_MS = 3 * 3600 * 1000; // Africa/Nairobi is UTC+3 all year (no DST)

/**
 * Expiry policy (documented in docs/EXPIRY_POLICY.md):
 *  - the clock starts when the router confirms authorization, never when the portal is opened
 *  - minute/hour/day = exact elapsed time (day = 24h)
 *  - month = same wall-clock time next calendar month in Africa/Nairobi, clamped to month end
 *    (31 Jan 10:00 + 1 month = 28/29 Feb 10:00). Mirrors compute_expiry() in SQL.
 */
export function computeExpiry(start: Date, unit: DurationUnit, value: number): Date {
  const t = start.getTime();
  switch (unit) {
    case 'minute': return new Date(t + value * 60_000);
    case 'hour': return new Date(t + value * 3_600_000);
    case 'day': return new Date(t + value * 86_400_000);
    case 'month': {
      const local = new Date(t + EAT_MS);
      const y = local.getUTCFullYear();
      const m = local.getUTCMonth() + value;
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const d = Math.min(local.getUTCDate(), lastDay);
      const res = Date.UTC(y, m, d, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());
      return new Date(res - EAT_MS);
    }
  }
}

export function durationLabel(unit: string, value: number): string {
  const word = unit === 'minute' ? 'minute' : unit === 'hour' ? 'hour' : unit === 'day' ? 'day' : 'month';
  return `${value} ${word}${value === 1 ? '' : 's'}`;
}

export const EXPIRY_POLICY_TEXT =
  'Access starts when the router confirms authorization. Minute, hour and day packages run for the exact period; ' +
  'a 1-month package ends at the same time of day on the same date next month (Nairobi time), or the last day of a shorter month.';

/** Schedule rule: {"days":[0-6],"from":"HH:MM","to":"HH:MM"} evaluated in Africa/Nairobi. Null = always available. */
export function isAvailableNow(schedule: any, now: Date = new Date()): boolean {
  if (!schedule) return true;
  const local = new Date(now.getTime() + EAT_MS);
  if (Array.isArray(schedule.days) && schedule.days.length && !schedule.days.includes(local.getUTCDay())) return false;
  if (schedule.from && schedule.to) {
    const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
    const [fh, fm] = String(schedule.from).split(':').map(Number);
    const [th, tm] = String(schedule.to).split(':').map(Number);
    const from = fh * 60 + fm, to = th * 60 + tm;
    return from <= to ? mins >= from && mins < to : mins >= from || mins < to;
  }
  return true;
}
