import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { uuidV7 } from './ids';
import { db } from './db';
import { banktickets, counters, queues } from './db/schema';
import { TICKET_STATUS, todayRange } from './ticketStatus';
import { eatCalendarDate, eatNow } from './timezone';
import { openInitialWaitSegment, serializeBankticket } from './ticketService';
import { publish } from './realtime/hub';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TICKETS_PER_LETTER = 99;
const MAX_SEQUENCE = 26 * TICKETS_PER_LETTER;

/** 1 -> A01, 99 -> A99, 100 -> B01. Throws rather than minting an invalid number after Z99. */
export function formatTicketNumber(sequence: number): string {
	if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
		throw new Error(`Ticket sequence ${sequence} is out of range (max Z99 per branch per day)`);
	}
	const letter = String.fromCharCode(65 + Math.floor((sequence - 1) / TICKETS_PER_LETTER));
	return `${letter}${(((sequence - 1) % TICKETS_PER_LETTER) + 1).toString().padStart(2, '0')}`;
}

/** Inverse of formatTicketNumber; null for anything not in the A01..Z99 scheme. */
function parseTicketNumber(ticketNo: string | null | undefined): number | null {
	const match = /^([A-Z])(\d{2})$/.exec(ticketNo ?? '');
	if (!match) return null;
	const number = Number(match[2]);
	if (number < 1 || number > TICKETS_PER_LETTER) return null;
	return (match[1].charCodeAt(0) - 65) * TICKETS_PER_LETTER + number;
}

type DbOrTx = Pick<typeof db, 'select' | 'execute'>;
type CounterResult = { recordset: { lastNumber: number }[] };

async function bumpCounter(client: DbOrTx, branchId: string, day: string): Promise<number | null> {
	const result = (await client.execute(sql`
		UPDATE ticket_counters SET lastNumber = lastNumber + 1
		OUTPUT inserted.lastNumber AS lastNumber
		WHERE branchId = ${branchId} AND day = ${day}
	`)) as unknown as CounterResult;
	return result.recordset[0]?.lastNumber ?? null;
}

/**
 * Hands out the next ticket sequence for a branch today with a single locking statement, so
 * concurrent requests (from any worker or process) always get different, consecutive numbers.
 * Call it inside the same transaction as the ticket insert: if the insert fails, the counter
 * rolls back too and no number is skipped.
 */
export async function allocateTicketNumber(client: DbOrTx, branchId: string): Promise<string> {
	const day = eatCalendarDate();
	const next = await bumpCounter(client, branchId, day);
	if (next !== null) return formatTicketNumber(next);

	// First ticket of the day (or first since this table was introduced): continue after any
	// ticket already issued today. MERGE + HOLDLOCK makes concurrent first callers safe.
	const { today } = todayRange();
	const issued = await client
		.select({ ticketNo: banktickets.ticketNo })
		.from(banktickets)
		.where(and(eq(banktickets.branchId, branchId), gte(banktickets.createdAt, today)));
	const seed = issued.reduce((max, row) => Math.max(max, parseTicketNumber(row.ticketNo) ?? 0), 0) + 1;
	const result = (await client.execute(sql`
		MERGE ticket_counters WITH (HOLDLOCK) AS t
		USING (SELECT ${branchId} AS branchId, ${day} AS day) AS s
			ON t.branchId = s.branchId AND t.day = s.day
		WHEN MATCHED THEN UPDATE SET lastNumber = t.lastNumber + 1
		WHEN NOT MATCHED THEN INSERT (branchId, day, lastNumber) VALUES (s.branchId, s.day, ${seed})
		OUTPUT inserted.lastNumber AS lastNumber;
	`)) as unknown as CounterResult;
	return formatTicketNumber(result.recordset[0].lastNumber);
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
	const id = uuidV7();
	// Number + insert in one transaction: the counter row stays locked until the ticket exists,
	// and a failed insert rolls the number back, so numbers are never skipped.
	await db.transaction(async (tx) => {
		const ticketNo = await allocateTicketNumber(tx, input.branchId);
		await tx.insert(banktickets).values({
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
	});
	await openInitialWaitSegment({
		id,
		queueId: input.queueId,
		subItemId: input.subItemId,
		subSubItemId: input.subSubItemId
	});
	const [created] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, id));
	publish({ type: 'tickets', branchId: input.branchId, queueId: input.queueId });
	return created;
}
