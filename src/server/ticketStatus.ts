import { eatDayRange } from './timezone';

export const TICKET_STATUS = {
	NOT_SERVED: 'Not Served',
	SERVING: 'Serving',
	SERVED: 'Served',
	HOLD: 'Hold',
	REDIRECTED: 'Redirected',
	CANCELLED: 'Cancelled',
	NO_SHOW: 'No Show',
	EXPIRED: 'Expired'
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export type SegmentStatus =
	| typeof TICKET_STATUS.NOT_SERVED
	| typeof TICKET_STATUS.SERVING
	| typeof TICKET_STATUS.HOLD
	| typeof TICKET_STATUS.REDIRECTED;

export const SEGMENT_STATUSES: readonly SegmentStatus[] = [
	TICKET_STATUS.NOT_SERVED,
	TICKET_STATUS.SERVING,
	TICKET_STATUS.HOLD,
	TICKET_STATUS.REDIRECTED
];

export const SERVICE_END_REASON = {
	CLAIMED: 'claimed',
	HELD: 'held',
	RESUMED: 'resumed',
	REDIRECTED: 'redirected',
	SERVED: 'served',
	CANCELLED: 'cancelled',
	NO_SHOW: 'no_show',
	EXPIRED: 'expired'
} as const;

export type ServiceEndReason = (typeof SERVICE_END_REASON)[keyof typeof SERVICE_END_REASON];

export const COUNTER_AVAILABILITY_EVENT = {
	AVAILABLE: 'available',
	PAUSED: 'paused'
} as const;

export type CounterAvailabilityEventType =
	(typeof COUNTER_AVAILABILITY_EVENT)[keyof typeof COUNTER_AVAILABILITY_EVENT];

export function isSegmentStatus(status: string): status is SegmentStatus {
	return (SEGMENT_STATUSES as readonly string[]).includes(status);
}

export function todayRange(now = new Date()) {
	return eatDayRange(now);
}

export function calculateDurationInSeconds(
	startDate: Date | null | undefined,
	endDate: Date
): number {
	if (!startDate) return 0;
	return Math.max(0, Math.round((endDate.getTime() - new Date(startDate).getTime()) / 1000));
}

export function formatAverageClock(totalSeconds: number): string {
	const safe = Math.max(0, Math.round(totalSeconds));
	const minutes = Math.floor(safe / 60);
	const seconds = safe % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
