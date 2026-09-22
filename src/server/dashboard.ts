import { and, count, eq, gte, lt } from 'drizzle-orm';
import { db } from './db';
import { banktickets } from './db/schema';
import { eatDayRange, eatHour } from './timezone';

export async function getDashboardStats(branchId: string) {
	const { today, tomorrow } = eatDayRange();
	const range = and(
		eq(banktickets.branchId, branchId),
		gte(banktickets.createdAt, today),
		lt(banktickets.createdAt, tomorrow)
	);

	const [totalRow] = await db.select({ value: count() }).from(banktickets).where(range);
	const [servedRow] = await db
		.select({ value: count() })
		.from(banktickets)
		.where(and(range, eq(banktickets.ticketStatus, 'Served')));
	const [waitingRow] = await db
		.select({ value: count() })
		.from(banktickets)
		.where(and(range, eq(banktickets.ticketStatus, 'Not Served')));
	const [inProgressRow] = await db
		.select({ value: count() })
		.from(banktickets)
		.where(and(range, eq(banktickets.ticketStatus, 'Serving')));

	const tickets = await db
		.select({ createdAt: banktickets.createdAt })
		.from(banktickets)
		.where(range);

	const ticketsPerHour = Array(24).fill(0) as number[];
	for (const ticket of tickets) {
		ticketsPerHour[eatHour(new Date(ticket.createdAt))]++;
	}

	return {
		totalTickets: totalRow?.value ?? 0,
		ticketsServed: servedRow?.value ?? 0,
		waitingTickets: waitingRow?.value ?? 0,
		inProgressTickets: inProgressRow?.value ?? 0,
		ticketsPerHour
	};
}
