import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { uuidV7 } from './ids';
import { db } from './db';
import { banktickets, counters, queues } from './db/schema';
import { TICKET_STATUS, todayRange } from './ticketStatus';
import { eatNow } from './timezone';
import { openInitialWaitSegment, serializeBankticket } from './ticketService';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateTicketNumber(branchId: string) {
	const { today } = todayRange();
	const [latestTicket] = await db
		.select({ ticketNo: banktickets.ticketNo })
		.top(1)
		.from(banktickets)
		.where(and(eq(banktickets.branchId, branchId), gte(banktickets.createdAt, today)))
		.orderBy(desc(banktickets.createdAt));

	let prefix = 'A';
	let number = 1;
	if (latestTicket) {
		prefix = latestTicket.ticketNo[0];
		number = Number.parseInt(latestTicket.ticketNo.slice(1), 10) + 1;
		if (number > 99) {
			prefix = String.fromCharCode(prefix.charCodeAt(0) + 1);
			number = 1;
		}
	}
	return `${prefix}${number.toString().padStart(2, '0')}`;
}

export async function countPeopleAhead(queueId: string, branchId: string, currentTicketId: string) {
	const { today, tomorrow } = todayRange();
	const rows = await db
		.select({ id: banktickets.id })
		.from(banktickets)
		.where(
			and(
				eq(banktickets.queueId, queueId),
				eq(banktickets.branchId, branchId),
				eq(banktickets.ticketStatus, TICKET_STATUS.NOT_SERVED),
				gte(banktickets.createdAt, today),
				lt(banktickets.createdAt, tomorrow),
				lt(banktickets.id, currentTicketId)
			)
		);
	return rows.length;
}

export async function listTickets(filters: {
	queueId?: string | null;
	status?: string | null;
	branchId?: string | null;
	counterId?: string | null;
}) {
	const { today, tomorrow } = todayRange();
	const clauses = [gte(banktickets.createdAt, today), lt(banktickets.createdAt, tomorrow)];
	if (filters.queueId) clauses.push(eq(banktickets.queueId, filters.queueId));
	if (filters.status) clauses.push(eq(banktickets.ticketStatus, filters.status));
	if (filters.branchId) clauses.push(eq(banktickets.branchId, filters.branchId));
	if (filters.counterId) clauses.push(eq(banktickets.counterId, filters.counterId));

	const tickets = await db
		.select()
		.from(banktickets)
		.where(and(...clauses))
		.orderBy(asc(banktickets.createdAt));

	const counterIds = [...new Set(tickets.map((t) => t.counterId).filter(Boolean))] as string[];
	const allCounters =
		counterIds.length > 0
			? await db.select().from(counters).where(inArray(counters.id, counterIds))
			: [];
	const byId = new Map(allCounters.map((c) => [c.id, c]));

	const queueRows = await db.select({ id: queues.id, name: queues.name }).from(queues);
	const queueById = new Map(queueRows.map((q) => [q.id, q]));

	return tickets.map((ticket) =>
		serializeBankticket({
			...ticket,
			counter: ticket.counterId ? (byId.get(ticket.counterId) ?? null) : null,
			queue: queueById.get(ticket.queueId) ?? null
		})
	);
}

export async function createTicket(input: {
	queueId: string;
	branchId: string;
	issueDescription: string;
	subItemId?: string | null;
	subSubItemId?: string | null;
	phoneNumber?: string | null;
	language?: string;
	multipleTransactions?: unknown;
}) {
	const now = eatNow();
	const ticketNo = await generateTicketNumber(input.branchId);
	const id = uuidV7();
	await db.insert(banktickets).values({
		id,
		ticketNo,
		queueId: input.queueId,
		subItemId: input.subItemId ?? null,
		subSubItemId: input.subSubItemId ?? null,
		issueDescription: input.issueDescription,
		phoneNumber: input.phoneNumber ?? null,
		ticketStatus: TICKET_STATUS.NOT_SERVED,
		pendingRedirectAcceptance: false,
		callAgain: false,
		branchId: input.branchId,
		language: input.language || 'English',
		multipleTransactions: input.multipleTransactions
			? JSON.stringify(input.multipleTransactions)
			: null,
		notServedAt: now,
		notServedDuration: 0,
		servingDuration: 0,
		holdDuration: 0,
		totalDuration: 0,
		createdAt: now,
		updatedAt: now
	});
	await openInitialWaitSegment({
		id,
		queueId: input.queueId,
		subItemId: input.subItemId,
		subSubItemId: input.subSubItemId
	});
	const [created] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, id));
	return created;
}
