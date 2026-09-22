export const APP_TIMEZONE = 'Africa/Kampala';
export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function toEatStorage(date: Date): Date {
	return new Date(date.getTime() + EAT_OFFSET_MS);
}

export function fromEatStorage(date: Date): Date {
	return new Date(date.getTime() - EAT_OFFSET_MS);
}

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
		hourCycle: 'h23'
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
		second: Number(get('second'))
	};
}

export function eatDayRange(realNow: Date = new Date()): { today: Date; tomorrow: Date } {
	const { year, month, day } = getEatParts(realNow);
	const today = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
	const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
	return { today, tomorrow };
}

export function eatCalendarDate(realNow: Date = new Date()): string {
	const { year, month, day } = getEatParts(realNow);
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function eatDayRangeForDate(dateStr: string): { today: Date; tomorrow: Date } {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
	if (!match) throw new Error(`Invalid calendar date: ${dateStr}`);
	const [, y, m, d] = match;
	const today = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0));
	const tomorrow = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1, 0, 0, 0, 0));
	return { today, tomorrow };
}

export function eatEndOfDayMs(realNow: Date = new Date()): number {
	const { tomorrow } = eatDayRange(realNow);
	return tomorrow.getTime() - EAT_OFFSET_MS;
}

export function formatInEat(
	date: Date | string | number | null | undefined,
	options?: Intl.DateTimeFormatOptions
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
				second: '2-digit',
				hourCycle: 'h23',
				timeZone: 'UTC'
			};
	return new Intl.DateTimeFormat('en-GB', formatOptions).format(d);
}

export function eatHour(date: Date): number {
	return date.getUTCHours();
}

/**
 * Parse a calendar date (YYYY-MM-DD) or datetime-local (YYYY-MM-DDTHH:mm)
 * as EAT wall time into a storage Date.
 */
export function parseEatDateTime(value: string): Date {
	const trimmed = value.trim();
	const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
	if (dateOnly) {
		const [, y, m, d] = dateOnly;
		return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0));
	}
	const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
	if (local) {
		const [, y, m, d, h, min, s] = local;
		return new Date(
			Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), s ? Number(s) : 0, 0)
		);
	}
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid date: ${value}`);
	}
	return parsed;
}
