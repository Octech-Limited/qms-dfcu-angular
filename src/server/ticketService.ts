import { uuidV7 } from './ids';
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or } from 'drizzle-orm';
import { db } from './db';
import {
	banktickets,
	counters,
	counterAvailabilityEvents,
	ticketServices
} from './db/schema';
import { recordActivity } from './auditLogger';
import { eatNow } from './timezone';
import {
	TICKET_STATUS,
	SERVICE_END_REASON,
	isSegmentStatus,
	calculateDurationInSeconds,
	todayRange,
	formatAverageClock,
	type TicketStatus,
	type ServiceEndReason,
	type SegmentStatus,
	type CounterAvailabilityEventType
} from './ticketStatus';

export type TransitionInput = {
	ticketId: string;
	nextTicketStatus: TicketStatus;
	endReason: ServiceEndReason;
	counterId?: string | null;
	userId?: string | null;
	sessionId?: string | null;
	holdComment?: string | null;
	redirectedFromCounterId?: string | null;
	redirectedToCounterId?: string | null;
	ticketPatch?: Partial<{
		queueId: string;
		subItemId: string | null;
		subSubItemId: string | null;
		callAgain: boolean;
		justifyReason: string | null;
		multipleTransactions: string | null;
		pendingRedirectAcceptance: boolean;
	}>;
};

function durationFieldForStatus(
	status: string
): 'notServedDuration' | 'servingDuration' | 'holdDuration' | null {
	if (status === TICKET_STATUS.NOT_SERVED || status === TICKET_STATUS.REDIRECTED) {
		return 'notServedDuration';
	}
	if (status === TICKET_STATUS.SERVING) return 'servingDuration';
	if (status === TICKET_STATUS.HOLD) return 'holdDuration';
	return null;
}

export function serializeBankticket<T extends Record<string, unknown>>(ticket: T) {
	const parse = (value: unknown) => {
		if (!value || typeof value !== 'string') return value ?? null;
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	};
	return {
		...ticket,
		multipleTransactions: parse(ticket['multipleTransactions']),
		oldContacts: parse(ticket['oldContacts'])
	};
}

export async function openInitialWaitSegment(ticket: {
	id: string;
	queueId: string;
	subItemId?: string | null;
	subSubItemId?: string | null;
}) {
	const now = eatNow();
	const serviceId = uuidV7();
	await db.insert(ticketServices).values({
		id: serviceId,
		ticketId: ticket.id,
		sequence: 1,
		ticketStatus: TICKET_STATUS.NOT_SERVED,
		queueId: ticket.queueId,
		subItemId: ticket.subItemId ?? null,
		subSubItemId: ticket.subSubItemId ?? null,
		startedAt: now,
		duration: 0,
		createdAt: now,
		updatedAt: now
	});
	await db
		.update(banktickets)
		.set({ currentServiceId: serviceId, updatedAt: now })
		.where(eq(banktickets.id, ticket.id));
	return serviceId;
}

export async function assertCounterNotServing(counterId: string, excludeTicketId?: string) {
	const { today, tomorrow } = todayRange();
	const filters = [
		eq(banktickets.counterId, counterId),
		eq(banktickets.ticketStatus, TICKET_STATUS.SERVING),
		gte(banktickets.createdAt, today),
		lt(banktickets.createdAt, tomorrow)
	];
	if (excludeTicketId) filters.push(ne(banktickets.id, excludeTicketId));
	const [existing] = await db
		.select({ id: banktickets.id, ticketNo: banktickets.ticketNo })
		.top(1)
		.from(banktickets)
		.where(and(...filters));
	if (existing) {
		const error = new Error(`Counter already serving ticket ${existing.ticketNo}`) as Error & {
			status?: number;
			existingTicketId?: string;
		};
		error.status = 409;
		error.existingTicketId = existing.id;
		throw error;
	}
}

export async function findClaimableTicket(
	counter: { id: string; branchId: string; queueId: string; subItemId: string | null },
	options?: { includeRedirects?: boolean }
) {
	const { today, tomorrow } = todayRange();
	const day = and(gte(banktickets.createdAt, today), lt(banktickets.createdAt, tomorrow));

	if (options?.includeRedirects !== false) {
		const [redirected] = await db
			.select()
			.top(1)
			.from(banktickets)
			.where(
				and(
					eq(banktickets.ticketStatus, TICKET_STATUS.REDIRECTED),
					eq(banktickets.counterId, counter.id),
					eq(banktickets.pendingRedirectAcceptance, true),
					eq(banktickets.branchId, counter.branchId),
					day
				)
			)
			.orderBy(asc(banktickets.createdAt));
		if (redirected) return redirected;
	}

	if (counter.subItemId) {
		const [subMatch] = await db
			.select()
			.top(1)
			.from(banktickets)
			.where(
				and(
					eq(banktickets.ticketStatus, TICKET_STATUS.NOT_SERVED),
					eq(banktickets.branchId, counter.branchId),
					eq(banktickets.queueId, counter.queueId),
					eq(banktickets.subItemId, counter.subItemId),
					or(isNull(banktickets.counterId), eq(banktickets.counterId, counter.id)),
					day
				)
			)
			.orderBy(asc(banktickets.createdAt));
		if (subMatch) return subMatch;
	}

	const [fifo] = await db
		.select()
		.top(1)
		.from(banktickets)
		.where(
			and(
				eq(banktickets.ticketStatus, TICKET_STATUS.NOT_SERVED),
				eq(banktickets.branchId, counter.branchId),
				eq(banktickets.queueId, counter.queueId),
				or(isNull(banktickets.counterId), eq(banktickets.counterId, counter.id)),
				day
			)
		)
		.orderBy(asc(banktickets.createdAt));
	return fifo ?? null;
}

export async function transitionTicketService(input: TransitionInput) {
	const now = eatNow();
	const [ticket] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, input.ticketId));
	if (!ticket) {
		const error = new Error('Ticket not found') as Error & { status?: number };
		error.status = 404;
		throw error;
	}
	if (ticket.ticketStatus === TICKET_STATUS.EXPIRED) {
		const error = new Error('Ticket has expired') as Error & { status?: number };
		error.status = 409;
		throw error;
	}

	const [openService] = await db
		.select()
		.top(1)
		.from(ticketServices)
		.where(and(eq(ticketServices.ticketId, ticket.id), isNull(ticketServices.endedAt)))
		.orderBy(desc(ticketServices.sequence));

	let notServedDuration = ticket.notServedDuration;
	let servingDuration = ticket.servingDuration;
	let holdDuration = ticket.holdDuration;

	if (openService) {
		const duration = calculateDurationInSeconds(openService.startedAt, now);
		const field = durationFieldForStatus(openService.ticketStatus);
		if (field === 'notServedDuration') notServedDuration += duration;
		if (field === 'servingDuration') servingDuration += duration;
		if (field === 'holdDuration') holdDuration += duration;
		await db
			.update(ticketServices)
			.set({ endedAt: now, duration, endReason: input.endReason, updatedAt: now })
			.where(eq(ticketServices.id, openService.id));
	}

	const queueId = input.ticketPatch?.queueId ?? ticket.queueId;
	const subItemId =
		input.ticketPatch?.subItemId === undefined ? ticket.subItemId : input.ticketPatch.subItemId;
	const subSubItemId =
		input.ticketPatch?.subSubItemId === undefined
			? ticket.subSubItemId
			: input.ticketPatch.subSubItemId;

	const isTerminal =
		input.nextTicketStatus === TICKET_STATUS.SERVED ||
		input.nextTicketStatus === TICKET_STATUS.CANCELLED ||
		input.nextTicketStatus === TICKET_STATUS.NO_SHOW ||
		input.nextTicketStatus === TICKET_STATUS.EXPIRED;

	let currentServiceId: string | null = null;
	let nextCounterId: string | null = ticket.counterId;
	let pendingRedirectAcceptance = false;

	if (!isTerminal && isSegmentStatus(input.nextTicketStatus)) {
		const nextStatus = input.nextTicketStatus as SegmentStatus;
		if (nextStatus === TICKET_STATUS.SERVING || nextStatus === TICKET_STATUS.HOLD) {
			nextCounterId = input.counterId ?? ticket.counterId;
			pendingRedirectAcceptance = false;
		} else if (nextStatus === TICKET_STATUS.REDIRECTED) {
			nextCounterId = input.redirectedToCounterId ?? input.counterId ?? null;
			pendingRedirectAcceptance = true;
		} else {
			nextCounterId = input.counterId ?? null;
			pendingRedirectAcceptance = false;
		}

		const [latest] = await db
			.select({ sequence: ticketServices.sequence })
			.top(1)
			.from(ticketServices)
			.where(eq(ticketServices.ticketId, ticket.id))
			.orderBy(desc(ticketServices.sequence));
		const sequence = (latest?.sequence ?? 0) + 1;
		currentServiceId = uuidV7();
		await db.insert(ticketServices).values({
			id: currentServiceId,
			ticketId: ticket.id,
			sequence,
			ticketStatus: nextStatus,
			counterId: nextCounterId,
			userId: input.userId ?? null,
			sessionId: input.sessionId ?? null,
			queueId,
			subItemId,
			subSubItemId,
			startedAt: now,
			duration: 0,
			holdComment: nextStatus === TICKET_STATUS.HOLD ? (input.holdComment ?? null) : null,
			redirectedFromCounterId:
				nextStatus === TICKET_STATUS.REDIRECTED
					? (input.redirectedFromCounterId ?? ticket.counterId)
					: null,
			redirectedToCounterId:
				nextStatus === TICKET_STATUS.REDIRECTED
					? (input.redirectedToCounterId ?? nextCounterId)
					: null,
			createdAt: now,
			updatedAt: now
		});
	}

	const patch: Record<string, unknown> = {
		notServedDuration,
		servingDuration,
		holdDuration,
		...input.ticketPatch,
		ticketStatus: input.nextTicketStatus,
		counterId: isTerminal ? ticket.counterId : nextCounterId,
		currentServiceId,
		pendingRedirectAcceptance,
		callAgain:
			input.nextTicketStatus === TICKET_STATUS.SERVING
				? false
				: typeof input.ticketPatch?.callAgain === 'boolean'
					? input.ticketPatch.callAgain
					: ticket.callAgain,
		updatedAt: now
	};

	if (
		input.nextTicketStatus === TICKET_STATUS.SERVED ||
		input.nextTicketStatus === TICKET_STATUS.NO_SHOW
	) {
		patch.servedAt = now;
		patch.totalDuration = notServedDuration + servingDuration + holdDuration;
		patch.pendingRedirectAcceptance = false;
	}
	if (
		input.nextTicketStatus === TICKET_STATUS.CANCELLED ||
		input.nextTicketStatus === TICKET_STATUS.EXPIRED
	) {
		patch.pendingRedirectAcceptance = false;
	}
	if (input.nextTicketStatus === TICKET_STATUS.EXPIRED) {
		patch.totalDuration = notServedDuration + servingDuration + holdDuration;
	}

	await db.update(banktickets).set(patch).where(eq(banktickets.id, ticket.id));
	const [updated] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, ticket.id));
	return updated;
}

export async function getCounterDurationAverages(counterId: string) {
	const { today, tomorrow } = todayRange();
	const servingRows = await db
		.select({ duration: ticketServices.duration })
		.from(ticketServices)
		.where(
			and(
				eq(ticketServices.counterId, counterId),
				eq(ticketServices.ticketStatus, TICKET_STATUS.SERVING),
				gte(ticketServices.endedAt, today),
				lt(ticketServices.endedAt, tomorrow)
			)
		);
	const waitingRows = await db
		.select({ duration: ticketServices.duration })
		.from(ticketServices)
		.where(
			and(
				eq(ticketServices.counterId, counterId),
				inArray(ticketServices.ticketStatus, [
					TICKET_STATUS.NOT_SERVED,
					TICKET_STATUS.REDIRECTED
				]),
				gte(ticketServices.endedAt, today),
				lt(ticketServices.endedAt, tomorrow)
			)
		);
	const avg = (rows: { duration: number }[]) =>
		rows.length ? Math.round(rows.reduce((s, r) => s + (r.duration ?? 0), 0) / rows.length) : 0;
	return {
		averageServingSeconds: avg(servingRows),
		averageWaitingSeconds: avg(waitingRows)
	};
}

export async function recordCounterAvailabilityEvent(
	counterId: string,
	eventType: CounterAvailabilityEventType,
	at = eatNow()
) {
	const now = eatNow();
	await db.insert(counterAvailabilityEvents).values({
		id: uuidV7(),
		counterId,
		eventType,
		at,
		createdAt: now,
		updatedAt: now
	});
}

/** Stored timestamps use Kampala wall-clock digits, so the next UTC midnight is the end of that creation day. */
function endOfCreationDay(createdAt: Date): Date {
	return new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate() + 1));
}

let expirationSweepRunning = false;

export async function expireTicketsPastCreationDay(): Promise<number> {
	if (expirationSweepRunning) return 0;
	expirationSweepRunning = true;
	try {
		const { today } = todayRange();
		const stale = await db
			.select()
			.from(banktickets)
			.where(
				and(
					lt(banktickets.createdAt, today),
					notInArray(banktickets.ticketStatus, [
						TICKET_STATUS.SERVED,
						TICKET_STATUS.NO_SHOW,
						TICKET_STATUS.EXPIRED
					])
				)
			);

		const now = eatNow();
		for (const ticket of stale) {
			const endedAt = endOfCreationDay(new Date(ticket.createdAt));
			const [openService] = await db
				.select()
				.top(1)
				.from(ticketServices)
				.where(and(eq(ticketServices.ticketId, ticket.id), isNull(ticketServices.endedAt)))
				.orderBy(desc(ticketServices.sequence));

			let notServedDuration = ticket.notServedDuration;
			let servingDuration = ticket.servingDuration;
			let holdDuration = ticket.holdDuration;
			let ticketServiceId: string | null = null;

			if (openService) {
				const duration = calculateDurationInSeconds(openService.startedAt, endedAt);
				const field = durationFieldForStatus(openService.ticketStatus);
				if (field === 'notServedDuration') notServedDuration += duration;
				if (field === 'servingDuration') servingDuration += duration;
				if (field === 'holdDuration') holdDuration += duration;
				ticketServiceId = openService.id;
				await db
					.update(ticketServices)
					.set({
						endedAt,
						duration,
						endReason: SERVICE_END_REASON.EXPIRED,
						updatedAt: now
					})
					.where(eq(ticketServices.id, openService.id));
			}

			const totalDuration = notServedDuration + servingDuration + holdDuration;
			await db
				.update(banktickets)
				.set({
					ticketStatus: TICKET_STATUS.EXPIRED,
					currentServiceId: null,
					pendingRedirectAcceptance: false,
					notServedDuration,
					servingDuration,
					holdDuration,
					totalDuration,
					updatedAt: now
				})
				.where(eq(banktickets.id, ticket.id));

			await recordActivity({
				action: 'serving.ticket.expire',
				actorType: 'system',
				attachSession: false,
				ticketId: ticket.id,
				documentId: ticket.id,
				ticketServiceId,
				branchId: ticket.branchId,
				counterId: ticket.counterId,
				description: `Ticket ${ticket.ticketNo} expired at end of creation day`,
				before: { ticketStatus: ticket.ticketStatus },
				after: { ticketStatus: TICKET_STATUS.EXPIRED }
			});
		}

		return stale.length;
	} finally {
		expirationSweepRunning = false;
	}
}

export { formatAverageClock, SERVICE_END_REASON, TICKET_STATUS };
