/** Client-safe EAT helpers (mirror of server timezone conventions). */
export const APP_TIMEZONE = 'Africa/Kampala';
export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Real UTC instant → storage Date whose UTC fields equal EAT wall time. */
export function toEatStorage(date: Date): Date {
  return new Date(date.getTime() + EAT_OFFSET_MS);
}

/** Storage Date (UTC fields = EAT wall time) → real UTC instant. */
export function fromEatStorage(date: Date): Date {
  return new Date(date.getTime() - EAT_OFFSET_MS);
}

/**
 * Current EAT wall-clock as a storage Date (UTC getters = EAT time).
 * Use when comparing against DB timestamps stored as EAT-as-UTC.
 */
export function eatNow(realNow: Date = new Date()): Date {
  return toEatStorage(realNow);
}

export function getEatParts(realNow: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(realNow);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

export function eatCalendarDate(realNow: Date = new Date()): string {
  const { year, month, day } = getEatParts(realNow);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatInEat(
  date: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (date == null) return '';
  const d = typeof date === 'object' && date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const formatOptions: Intl.DateTimeFormatOptions = options
    ? { hourCycle: 'h23', ...options, timeZone: 'UTC' }
    : {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'UTC',
      };
  return new Intl.DateTimeFormat('en-GB', formatOptions).format(d);
}

export function relativeTimeFromEat(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() + EAT_OFFSET_MS - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format for datetime-local input (YYYY-MM-DDTHH:mm) from storage Date. */
export function toEatDatetimeLocalValue(
  date: Date | string | null | undefined,
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}
