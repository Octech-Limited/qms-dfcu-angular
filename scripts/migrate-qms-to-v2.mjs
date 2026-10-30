/**
 * Move the production `qms` database onto the qms_v2 shape.
 *
 * Dry run (default) only reads. Nothing is written until --apply.
 *
 *   node scripts/migrate-qms-to-v2.mjs
 *   node scripts/migrate-qms-to-v2.mjs --apply
 *
 * Connection host, user, and password come from DATABASE_URL. The database
 * name defaults to `qms` even when DATABASE_URL points at qms_v2.
 * Override with --database=name. qms_v2 and qms_v2_shadow are refused.
 *
 * Back up `qms` before --apply. The write runs in one transaction.
 *
 * Ticket rules, from the rows actually stored in qms:
 * - 29 tickets have an object in counters.tickets. That object is the visit.
 *   Its ticketStatus wins over banktickets.ticketStatus (15 rows disagree).
 *   Timestamps and durations on the ticket row are empty; the JSON has them.
 *   Eight served visits stored servingAt as null. Those start serving at
 *   notServedAt plus notServedDuration, which matches servedAt on every row.
 * - Each visit becomes ticket_services segments: a closed wait, then serving,
 *   and a hold segment when the JSON recorded one. Served visits are closed.
 *   Serving visits keep one open serving segment. counterId is copied from
 *   the counter that owns the JSON (banktickets.counterId is empty;
 *   currentCounterId is empty on 8 of these 29).
 * - The other 145 tickets have no visit, no durations, and no serve time.
 *   aggregateStatus (Completed / AtCounter / Queued) is not a serve. They
 *   stay Not Served with one open wait segment. The live queue only loads
 *   today's tickets, so these historical waits are not offered to a counter.
 * - Ticket-level duration columns keep the JSON totals. Segment durations
 *   follow the timestamps, so they will not add up to those totals on the
 *   one hold visit whose holdAt falls before servingAt.
 * - user_sessions and the new audit columns are left empty. Nothing in qms
 *   records them. Each counter gets one availability event matching its
 *   current available flag.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import sql from 'mssql';

const APPLY = process.argv.includes('--apply');
const DATABASE = process.argv.find((arg) => arg.startsWith('--database='))?.split('=')[1] || 'QMS V2';
const REFUSED = new Set(['qms_v2', 'qms_v2_shadow']);

const DROP_COLUMNS = {
	banktickets: ['aggregateStatus', 'currentCounterId', 'holdAt', 'holdComment', 'servingAt'],
	counters: ['averageServingTime', 'tickets']
};

/** nvarchar clock columns that stay, and whether the new column allows null. */
const TIME_COLUMNS = [
	['ads', 'validFrom', true],
	['ads', 'validUntil', true],
	['ads', 'createdAt', false],
	['ads', 'updatedAt', false],
	['announcement_types', 'createdAt', false],
	['announcements', 'createdAt', false],
	['audit_logs', 'createdAt', false],
	['audit_logs', 'updatedAt', false],
	['banktickets', 'notServedAt', false],
	['banktickets', 'servedAt', true],
	['banktickets', 'createdAt', false],
	['banktickets', 'updatedAt', false],
	['branches', 'createdAt', false],
	['branches', 'updatedAt', false],
	['counters', 'createdAt', false],
	['counters', 'updatedAt', false],
	['exchange_rates', 'createdAt', false],
	['exchange_rates', 'updatedAt', false],
	['logs', 'createdAt', false],
	['logs', 'updatedAt', false],
	['queues', 'createdAt', false],
	['queues', 'updatedAt', false],
	['roles', 'createdAt', false],
	['roles', 'updatedAt', false],
	['settings', 'createdAt', false],
	['settings', 'updatedAt', false],
	['social_media', 'createdAt', false],
	['sub_menu_items', 'createdAt', false],
	['sub_menu_items', 'updatedAt', false],
	['sub_sub_menu_items', 'createdAt', false],
	['sub_sub_menu_items', 'updatedAt', false],
	['ticket_announcements', 'playStartedAt', true],
	['ticket_announcements', 'playCompletedAt', true],
	['ticket_announcements', 'queuedAt', false],
	['ticket_announcements', 'createdAt', false],
	['ticket_announcements', 'updatedAt', false],
	['users', 'lastSessionAt', true],
	['users', 'createdAt', false],
	['users', 'updatedAt', false]
];

const TERMINAL = new Set(['Served', 'Cancelled', 'No Show']);

function quoteIdent(name) {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier: ${name}`);
	return `[${name}]`;
}

function parseDatabaseUrl(url) {
	const match = /^sqlserver:\/\/([^:;]+):(\d+);(.*)$/.exec(url.trim());
	if (!match) throw new Error('DATABASE_URL must be a sqlserver:// host URL');
	const params = {};
	for (const part of match[3].split(';')) {
		if (!part) continue;
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		params[part.slice(0, eq).toLowerCase()] = part.slice(eq + 1);
	}
	return {
		server: match[1] === 'localhost' ? '127.0.0.1' : match[1],
		port: Number(match[2]),
		user: params.user,
		password: params.password
	};
}

/** Keep the wall clock. SQL Server stores these strings with the offset stripped, which is what qms_v2 does. */
function wallClock(value) {
	if (value == null || value === '') return null;
	const text = String(value).trim();
	const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?/.exec(text);
	if (!match) return null;
	const fraction = (match[3] || '').slice(1, 8);
	return `${match[1]} ${match[2]}${fraction ? `.${fraction}` : ''}`;
}

function wallMs(value) {
	const wall = wallClock(value);
	if (!wall) return null;
	const ms = Date.parse(`${wall.replace(' ', 'T')}Z`);
	return Number.isNaN(ms) ? null : ms;
}

function secondsBetween(start, end) {
	const a = wallMs(start);
	const b = wallMs(end);
	if (a == null || b == null) return 0;
	return Math.max(0, Math.round((b - a) / 1000));
}

function addSeconds(wall, seconds) {
	const ms = wallMs(wall);
	if (ms == null) return null;
	const date = new Date(ms + seconds * 1000);
	const pad = (n, len = 2) => String(n).padStart(len, '0');
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
}

function num(value) {
	if (value == null || value === '') return 0;
	const n = Number(value);
	return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function bit(value) {
	return value === true || value === 1 || value === '1';
}

function buildSegments(ctx) {
	const segments = [];
	const push = (partial) => {
		segments.push({
			id: crypto.randomUUID(),
			sequence: segments.length + 1,
			ticketStatus: partial.ticketStatus,
			counterId: partial.counterId ?? null,
			userId: partial.userId ?? null,
			queueId: ctx.queueId,
			subItemId: ctx.subItemId,
			subSubItemId: ctx.subSubItemId,
			startedAt: partial.startedAt,
			endedAt: partial.endedAt ?? null,
			duration: partial.duration ?? 0,
			holdComment: partial.holdComment ?? null,
			endReason: partial.endReason ?? null,
			redirectedFromCounterId: null,
			redirectedToCounterId: null
		});
	};

	const { status, notServedAt, servingAt, servedAt, counterId, userId, nsd, svd } = ctx;
	push({
		ticketStatus: 'Not Served',
		startedAt: notServedAt,
		endedAt: servingAt,
		duration: servingAt ? nsd : 0,
		endReason: servingAt ? 'claimed' : null
	});
	if (!servingAt) return segments;

	const holdAt = ctx.holdAt;
	const holdInside =
		holdAt &&
		wallMs(holdAt) >= wallMs(servingAt) &&
		(!servedAt || wallMs(holdAt) < wallMs(servedAt));
	const hasHold = Boolean(holdAt || ctx.holdComment || ctx.hd > 0);

	if (holdInside) {
		push({
			ticketStatus: 'Serving',
			counterId,
			userId,
			startedAt: servingAt,
			endedAt: holdAt,
			duration: secondsBetween(servingAt, holdAt),
			endReason: 'held'
		});
		if (status === 'Served') {
			const resumeAt = ctx.hd > 0 ? addSeconds(holdAt, ctx.hd) : null;
			const resumeFits = resumeAt && servedAt && wallMs(resumeAt) < wallMs(servedAt);
			push({
				ticketStatus: 'Hold',
				counterId,
				userId,
				startedAt: holdAt,
				endedAt: resumeFits ? resumeAt : servedAt,
				duration: ctx.hd || secondsBetween(holdAt, resumeFits ? resumeAt : servedAt),
				endReason: 'resumed',
				holdComment: ctx.holdComment
			});
			if (resumeFits) {
				push({
					ticketStatus: 'Serving',
					counterId,
					userId,
					startedAt: resumeAt,
					endedAt: servedAt,
					duration: secondsBetween(resumeAt, servedAt),
					endReason: 'served'
				});
			}
		} else {
			push({
				ticketStatus: 'Hold',
				counterId,
				userId,
				startedAt: holdAt,
				endedAt: status === 'Hold' ? null : holdAt,
				duration: status === 'Hold' ? 0 : ctx.hd,
				endReason: status === 'Hold' ? null : 'resumed',
				holdComment: ctx.holdComment
			});
			if (status === 'Serving') {
				push({
					ticketStatus: 'Serving',
					counterId,
					userId,
					startedAt: holdAt,
					endedAt: null,
					duration: 0
				});
			}
		}
		return segments;
	}

	if (hasHold && status === 'Served' && servedAt && ctx.hd > 0) {
		const holdEnd = addSeconds(servingAt, ctx.hd);
		if (holdEnd && wallMs(holdEnd) < wallMs(servedAt)) {
			push({
				ticketStatus: 'Hold',
				counterId,
				userId,
				startedAt: servingAt,
				endedAt: holdEnd,
				duration: ctx.hd,
				endReason: 'resumed',
				holdComment: ctx.holdComment
			});
			push({
				ticketStatus: 'Serving',
				counterId,
				userId,
				startedAt: holdEnd,
				endedAt: servedAt,
				duration: secondsBetween(holdEnd, servedAt),
				endReason: 'served'
			});
			return segments;
		}
	}

	push({
		ticketStatus: 'Serving',
		counterId,
		userId,
		startedAt: servingAt,
		endedAt: status === 'Served' ? servedAt : null,
		duration: status === 'Served' ? svd : 0,
		endReason: status === 'Served' ? 'served' : null
	});
	return segments;
}

/**
 * One Serving segment per earlier copy of a redirected ticket, on the counter
 * that copy lives on, ending 'redirected'. A leg runs from its servingAt (or
 * notServedAt + notServedDuration when servingAt is null) to its servedAt, or
 * to the start of the next leg when it never recorded servedAt. Holds inside
 * a leg are not split out. Returns the legs plus a wait segment before them.
 */
function buildLegSegments(ticket, hit, winnerStart, notes) {
	const legs = [];
	const copies = hit.earlier;
	for (let i = 0; i < copies.length; i++) {
		const { rec, counterId, userId, counterNumber } = copies[i];
		const notServedAt = wallClock(rec.notServedAt) || wallClock(ticket.notServedAt) || wallClock(ticket.createdAt);
		let startedAt = wallClock(rec.servingAt) || addSeconds(notServedAt, num(rec.notServedDuration));
		const nextStart =
			i + 1 < copies.length
				? wallClock(copies[i + 1].rec.servingAt) || wallClock(copies[i + 1].rec.notServedAt)
				: winnerStart;
		let endedAt = wallClock(rec.servedAt) || nextStart || startedAt;
		if (!startedAt || wallMs(startedAt) > wallMs(endedAt)) {
			notes.push(`${ticket.ticketNo}: leg on counter ${counterNumber} had start after end, collapsed to a zero-length segment`);
			startedAt = endedAt;
		}
		legs.push({
			counterId,
			userId,
			notServedAt,
			startedAt,
			endedAt,
			toCounterId: i + 1 < copies.length ? copies[i + 1].counterId : hit.counterId
		});
	}
	return legs;
}

function stitchRedirects(ticket, hit, winnerSegments, notes) {
	const winnerStart = winnerSegments[1]?.startedAt ?? null;
	const legs = buildLegSegments(ticket, hit, winnerStart, notes);
	const first = legs[0];
	const out = [];
	const add = (partial) => out.push({
		id: crypto.randomUUID(),
		sequence: out.length + 1,
		ticketStatus: partial.ticketStatus,
		counterId: partial.counterId ?? null,
		userId: partial.userId ?? null,
		queueId: ticket.queueId,
		subItemId: ticket.subItemId,
		subSubItemId: ticket.subSubItemId,
		startedAt: partial.startedAt,
		endedAt: partial.endedAt ?? null,
		duration: partial.duration ?? 0,
		holdComment: partial.holdComment ?? null,
		endReason: partial.endReason ?? null,
		redirectedFromCounterId: partial.redirectedFromCounterId ?? null,
		redirectedToCounterId: partial.redirectedToCounterId ?? null
	});
	add({
		ticketStatus: 'Not Served',
		startedAt: first.notServedAt,
		endedAt: first.startedAt,
		duration: secondsBetween(first.notServedAt, first.startedAt),
		endReason: 'claimed'
	});
	legs.forEach((leg, i) => {
		add({
			ticketStatus: 'Serving',
			counterId: leg.counterId,
			userId: leg.userId,
			startedAt: leg.startedAt,
			endedAt: leg.endedAt,
			duration: secondsBetween(leg.startedAt, leg.endedAt),
			endReason: 'redirected',
			redirectedFromCounterId: i > 0 ? legs[i - 1].counterId : null,
			redirectedToCounterId: leg.toCounterId
		});
	});
	const lastEnd = legs[legs.length - 1].endedAt;
	// The winner's own wait segment is replaced by the legs when it was served;
	// a winner still waiting keeps one, restarted when the last leg ended.
	const rest = winnerSegments[1] ? winnerSegments.slice(1) : winnerSegments.slice();
	rest.forEach((segment, i) => {
		let { startedAt, endedAt } = segment;
		if (i === 0 && wallMs(startedAt) < wallMs(lastEnd)) {
			notes.push(`${ticket.ticketNo}: final copy starts before its earlier leg ended, start moved to ${lastEnd}`);
			startedAt = lastEnd;
			if (endedAt && wallMs(endedAt) < wallMs(startedAt)) endedAt = startedAt;
		}
		add({
			...segment,
			startedAt,
			endedAt,
			duration: segment.duration,
			redirectedFromCounterId: i === 0 ? legs[legs.length - 1].counterId : null
		});
	});
	return out;
}

function buildPlan(ticket, hit, notes = []) {
	const rec = hit?.rec ?? null;
	const status = rec?.ticketStatus || ticket.ticketStatus;
	if (!['Not Served', 'Serving', 'Served', 'Hold'].includes(status)) {
		throw new Error(`Ticket ${ticket.ticketNo} has status ${status}, which this script does not map`);
	}
	const createdAt = wallClock(ticket.createdAt);
	if (!createdAt) throw new Error(`Ticket ${ticket.ticketNo} has no createdAt`);
	const notServedAt = wallClock(rec?.notServedAt) || wallClock(ticket.notServedAt) || createdAt;
	let servingAt = wallClock(rec?.servingAt) || wallClock(ticket.servingAt);
	const servedAt = wallClock(rec?.servedAt) || wallClock(ticket.servedAt);
	const counterId = hit?.counterId ?? null;
	const nsd = num(rec ? rec.notServedDuration : ticket.notServedDuration);
	const svd = num(rec ? rec.servingDuration : ticket.servingDuration);
	const hd = num(rec ? rec.holdDuration : ticket.holdDuration);
	const td = num(rec ? rec.totalDuration : ticket.totalDuration) || nsd + svd + hd;
	let servingAtInferred = false;
	if (!servingAt && notServedAt && (status === 'Served' || status === 'Serving' || status === 'Hold')) {
		servingAt = addSeconds(notServedAt, nsd);
		servingAtInferred = true;
	}
	if ((status === 'Serving' || status === 'Served' || status === 'Hold') && !counterId) {
		throw new Error(`Ticket ${ticket.ticketNo} is ${status} but has no counter`);
	}
	if (status === 'Served' && (!servingAt || !servedAt)) {
		throw new Error(`Ticket ${ticket.ticketNo} is Served but is missing servingAt or servedAt`);
	}
	if ((status === 'Serving' || status === 'Hold') && !servingAt) {
		throw new Error(`Ticket ${ticket.ticketNo} is ${status} but is missing servingAt`);
	}
	if (servingAtInferred && servedAt && wallMs(servingAt) > wallMs(servedAt) && hit?.earlier?.length) {
		// notServedDuration on a redirected ticket can span the earlier legs, so the
		// estimate overshoots. Start the final leg where the last earlier leg ended.
		const lastLegEnd = hit.earlier
			.map((copy) => wallClock(copy.rec.servedAt))
			.filter((at) => at && wallMs(at) <= wallMs(servedAt))
			.sort((a, b) => wallMs(b) - wallMs(a))[0];
		servingAt = lastLegEnd || servedAt;
		notes.push(`${ticket.ticketNo}: inferred servingAt was after servedAt, final leg started at ${servingAt}`);
	}
	if (servingAtInferred && servedAt && wallMs(servingAt) > wallMs(servedAt)) {
		throw new Error(
			`Ticket ${ticket.ticketNo} inferred servingAt falls after servedAt: ` +
				`notServedAt=${notServedAt} notServedDuration=${nsd} inferred servingAt=${servingAt} servedAt=${servedAt} ` +
				`status=${status} copies=${(hit?.earlier?.length ?? 0) + (hit ? 1 : 0)}`
		);
	}
	let segments = buildSegments({
		status,
		notServedAt,
		servingAt,
		servedAt,
		holdAt: wallClock(rec?.holdAt) || wallClock(ticket.holdAt),
		holdComment: String(rec?.holdComment || ticket.holdComment || '').trim() || null,
		nsd,
		svd,
		hd,
		counterId,
		userId: hit?.userId ?? null,
		queueId: ticket.queueId,
		subItemId: ticket.subItemId,
		subSubItemId: ticket.subSubItemId
	});
	if (hit?.earlier?.length) segments = stitchRedirects(ticket, hit, segments, notes);
	const open = segments.filter((segment) => !segment.endedAt);
	if (TERMINAL.has(status) ? open.length !== 0 : open.length !== 1) {
		throw new Error(`Ticket ${ticket.ticketNo} built ${open.length} open segments for status ${status}`);
	}
	return {
		id: ticket.id,
		ticketNo: ticket.ticketNo,
		previousStatus: ticket.ticketStatus,
		aggregateStatus: ticket.aggregateStatus,
		fromJson: Boolean(rec),
		servingAtInferred,
		status,
		counterId: status === 'Not Served' ? null : counterId,
		currentServiceId: open[0]?.id ?? null,
		notServedAt,
		servedAt: status === 'Served' ? servedAt : null,
		notServedDuration: nsd,
		servingDuration: svd,
		holdDuration: hd,
		totalDuration: td,
		callAgain: bit(rec ? rec.callAgain : ticket.callAgain),
		pendingRedirectAcceptance: bit(rec ? rec.pendingRedirectAcceptance : ticket.pendingRedirectAcceptance),
		segments
	};
}

/**
 * A redirected ticket is stored on every counter it passed through. `Redirected`
 * stubs are ignored. Among the remaining copies the furthest along wins:
 * Served over Hold/Serving over Not Served, then the latest servedAt. The
 * winner is the visit; every other copy is an earlier leg and becomes a
 * redirected Serving segment on its own counter (see buildLegSegments). A tie
 * is ambiguous, so it is listed and the script stops.
 */
const STATUS_RANK = { Served: 3, Hold: 2, Serving: 1, 'Not Served': 0 };

/** When a leg stopped: servedAt, else servingAt, else notServedAt. Used only to order legs. */
function legEnd(rec) {
	return wallMs(rec.servedAt) ?? wallMs(rec.servingAt) ?? wallMs(rec.notServedAt) ?? 0;
}

function compareCopies(a, b) {
	const rank = (STATUS_RANK[b.rec.ticketStatus] ?? -1) - (STATUS_RANK[a.rec.ticketStatus] ?? -1);
	if (rank) return rank;
	return (wallMs(b.rec.servedAt) ?? 0) - (wallMs(a.rec.servedAt) ?? 0);
}
function loadVisits(counters) {
	const found = new Map();
	for (const counter of counters) {
		let records;
		try {
			records = JSON.parse(counter.tickets || '[]');
		} catch (error) {
			throw new Error(`Counter ${counter.counterNumber} has invalid tickets JSON: ${error.message}`);
		}
		if (!Array.isArray(records)) {
			throw new Error(`Counter ${counter.counterNumber} tickets JSON is not an array`);
		}
		for (const rec of records) {
			if (!rec || !rec.ticketId) throw new Error(`Counter ${counter.counterNumber} has a ticket record without ticketId`);
			const hit = {
				counterId: counter.id,
				userId: counter.userId,
				counterNumber: counter.counterNumber,
				rec
			};
			const list = found.get(rec.ticketId) ?? [];
			list.push(hit);
			found.set(rec.ticketId, list);
		}
	}

	const visits = new Map();
	const ambiguous = [];
	let resolved = 0;
	for (const [ticketId, hits] of found) {
		if (hits.length === 1) {
			visits.set(ticketId, hits[0]);
			continue;
		}
		const live = hits.filter((hit) => hit.rec.ticketStatus !== 'Redirected');
		live.sort(compareCopies);
		if (live.length && (live.length === 1 || compareCopies(live[0], live[1]) !== 0)) {
			const earlier = hits.filter((hit) => hit !== live[0]);
			earlier.sort((a, b) => legEnd(a.rec) - legEnd(b.rec));
			visits.set(ticketId, { ...live[0], earlier });
			resolved++;
			continue;
		}
		ambiguous.push(
			`${ticketId}: ` +
				hits
					.map(
						(hit) =>
							`counter ${hit.counterNumber} ${hit.rec.ticketStatus} servedAt=${hit.rec.servedAt ?? 'null'} pending=${hit.rec.pendingRedirectAcceptance}`
					)
					.join(' | ')
		);
	}
	if (ambiguous.length) {
		throw new Error(
			`${ambiguous.length} tickets are stored on more than one counter and have no single live copy:\n${ambiguous.join('\n')}`
		);
	}
	console.log(`${resolved} tickets stored on several counters resolved to their furthest-along copy.`);
	return visits;
}

function summarize(plans) {
	const lines = [];
	const byStatus = new Map();
	let segments = 0;
	let corrected = 0;
	let fromJson = 0;
	let ignoredAggregate = 0;
	for (const plan of plans) {
		segments += plan.segments.length;
		if (plan.fromJson) fromJson += 1;
		if (plan.previousStatus !== plan.status) corrected += 1;
		if (!plan.fromJson && plan.aggregateStatus && plan.aggregateStatus !== 'Queued') ignoredAggregate += 1;
		byStatus.set(plan.status, (byStatus.get(plan.status) || 0) + 1);
	}
	lines.push(`Tickets: ${plans.length}`);
	lines.push(`Visits read from counters.tickets: ${fromJson}`);
	lines.push(`ticketStatus corrected from the counter JSON: ${corrected}`);
	lines.push(`servingAt inferred from notServedAt + notServedDuration: ${plans.filter((plan) => plan.servingAtInferred).length}`);
	lines.push(`aggregateStatus ignored on tickets with no visit: ${ignoredAggregate}`);
	lines.push(`ticket_services rows: ${segments}`);
	lines.push(`Redirected tickets with earlier legs kept: ${plans.filter((plan) => plan.segments.some((segment) => segment.endReason === 'redirected')).length}`);
	lines.push(`Resulting ticketStatus: ${[...byStatus.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
	const changes = plans.filter((plan) => plan.previousStatus !== plan.status);
	if (changes.length) {
		lines.push('Status corrections:');
		for (const plan of changes) {
			lines.push(`  ${plan.ticketNo}: ${plan.previousStatus} -> ${plan.status} (aggregate was ${plan.aggregateStatus})`);
		}
	}
	const holds = plans.filter((plan) => plan.segments.some((segment) => segment.ticketStatus === 'Hold'));
	if (holds.length) {
		lines.push('Hold segments:');
		for (const plan of holds) {
			for (const segment of plan.segments) {
				lines.push(
					`  ${plan.ticketNo} #${segment.sequence} ${segment.ticketStatus} ${segment.startedAt} -> ${segment.endedAt ?? 'open'} ${segment.endReason ?? ''} ${segment.holdComment ?? ''}`.trim()
				);
			}
		}
	}
	const stillServing = plans.filter((plan) => plan.status === 'Serving');
	if (stillServing.length) {
		lines.push(
			`Left as Serving (open segment, historical createdAt, not in today's queue): ${stillServing.map((plan) => plan.ticketNo).join(', ')}`
		);
	}
	return lines.join('\n');
}

async function query(tx, text, inputs = {}) {
	const request = new sql.Request(tx);
	for (const [key, value] of Object.entries(inputs)) {
		if (typeof value === 'boolean') request.input(key, sql.Bit, value);
		else if (typeof value === 'number') request.input(key, sql.Int, value);
		else request.input(key, sql.NVarChar, value);
	}
	return (await request.query(text)).recordset;
}

async function exec(tx, text, inputs) {
	await query(tx, text, inputs);
}

async function columnMeta(tx, table, column) {
	const rows = await query(
		tx,
		`SELECT ty.name AS typeName, c.is_nullable AS isNullable, c.max_length AS maxLength
		 FROM sys.columns c
		 JOIN sys.types ty ON ty.user_type_id = c.user_type_id
		 WHERE c.object_id = OBJECT_ID(@table) AND c.name = @column`,
		{ table: `dbo.${table}`, column }
	);
	return rows[0] ?? null;
}

async function dropDefaults(tx, table, column) {
	const rows = await query(
		tx,
		`SELECT dc.name
		 FROM sys.default_constraints dc
		 JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
		 WHERE dc.parent_object_id = OBJECT_ID(@table) AND c.name = @column`,
		{ table: `dbo.${table}`, column }
	);
	for (const row of rows) {
		await exec(tx, `ALTER TABLE dbo.${quoteIdent(table)} DROP CONSTRAINT ${quoteIdent(row.name)}`);
	}
}

async function dropForeignKeysOn(tx, table, column) {
	const rows = await query(
		tx,
		`SELECT fk.name
		 FROM sys.foreign_keys fk
		 JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
		 JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
		 WHERE fkc.parent_object_id = OBJECT_ID(@table) AND c.name = @column`,
		{ table: `dbo.${table}`, column }
	);
	for (const row of rows) {
		await exec(tx, `ALTER TABLE dbo.${quoteIdent(table)} DROP CONSTRAINT ${quoteIdent(row.name)}`);
	}
}

async function listIndexes(tx, table) {
	const rows = await query(
		tx,
		`SELECT i.name, i.is_unique AS isUnique, i.is_primary_key AS isPrimary, i.type_desc AS typeDesc,
		        i.filter_definition AS filterDef, c.name AS col, ic.key_ordinal AS keyOrdinal,
		        ic.is_included_column AS isIncluded, ic.is_descending_key AS isDesc
		 FROM sys.indexes i
		 JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
		 JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
		 WHERE i.object_id = OBJECT_ID(@table) AND i.name IS NOT NULL AND i.is_primary_key = 0
		 ORDER BY i.name, ic.is_included_column, ic.key_ordinal`,
		{ table: `dbo.${table}` }
	);
	const grouped = new Map();
	for (const row of rows) {
		if (!grouped.has(row.name)) {
			grouped.set(row.name, {
				name: row.name,
				isUnique: row.isUnique,
				typeDesc: row.typeDesc,
				filterDef: row.filterDef,
				keys: [],
				included: []
			});
		}
		const index = grouped.get(row.name);
		const col = `${quoteIdent(row.col)}${row.isDesc ? ' DESC' : ' ASC'}`;
		if (row.isIncluded) index.included.push(quoteIdent(row.col));
		else index.keys.push(col);
	}
	return [...grouped.values()];
}

async function dropIndex(tx, table, name) {
	await exec(
		tx,
		`IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = @name AND object_id = OBJECT_ID(@table))
		 DROP INDEX ${quoteIdent(name)} ON dbo.${quoteIdent(table)}`,
		{ name, table: `dbo.${table}` }
	);
}

function createIndexSql(table, index) {
	if (index.typeDesc !== 'NONCLUSTERED') {
		throw new Error(`Index ${index.name} on ${table} is ${index.typeDesc}; this script only restores nonclustered indexes`);
	}
	const unique = index.isUnique ? 'UNIQUE ' : '';
	const include = index.included.length ? ` INCLUDE (${index.included.join(', ')})` : '';
	const filter = index.filterDef ? ` WHERE ${index.filterDef}` : '';
	return `CREATE ${unique}NONCLUSTERED INDEX ${quoteIdent(index.name)} ON dbo.${quoteIdent(table)} (${index.keys.join(', ')})${include}${filter}`;
}

async function ensureIndex(tx, table, name, columns, { unique = false } = {}) {
	const existing = await query(
		tx,
		`SELECT 1 AS ok FROM sys.indexes WHERE name = @name AND object_id = OBJECT_ID(@table)`,
		{ name, table: `dbo.${table}` }
	);
	if (existing.length) return;
	const uniqueSql = unique ? 'UNIQUE ' : '';
	await exec(
		tx,
		`CREATE ${uniqueSql}NONCLUSTERED INDEX ${quoteIdent(name)} ON dbo.${quoteIdent(table)} (${columns})`
	);
}

async function ensureFk(tx, name, table, column, refTable, refColumn) {
	const existing = await query(tx, `SELECT 1 AS ok FROM sys.foreign_keys WHERE name = @name`, { name });
	if (existing.length) return;
	await exec(
		tx,
		`ALTER TABLE dbo.${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(name)}
		 FOREIGN KEY (${quoteIdent(column)}) REFERENCES dbo.${quoteIdent(refTable)} (${quoteIdent(refColumn)})`
	);
}

async function addColumn(tx, table, column, definition) {
	const meta = await columnMeta(tx, table, column);
	if (meta) return;
	await exec(tx, `ALTER TABLE dbo.${quoteIdent(table)} ADD ${quoteIdent(column)} ${definition}`);
}

async function createNewTables(tx) {
	await exec(
		tx,
		`IF OBJECT_ID('dbo.user_sessions') IS NULL
		 CREATE TABLE dbo.user_sessions (
		   id nvarchar(1000) NOT NULL CONSTRAINT user_sessions_pkey PRIMARY KEY,
		   userId nvarchar(1000) NULL,
		   actorType nvarchar(1000) NOT NULL,
		   branchId nvarchar(1000) NULL,
		   counterId nvarchar(1000) NULL,
		   loginMethod nvarchar(1000) NULL,
		   startedAt datetime2 NOT NULL,
		   endedAt datetime2 NULL,
		   endReason nvarchar(1000) NULL,
		   createdAt datetime2 NOT NULL CONSTRAINT user_sessions_createdAt_df DEFAULT (getdate()),
		   updatedAt datetime2 NOT NULL
		 )`
	);
	await exec(
		tx,
		`IF OBJECT_ID('dbo.ticket_services') IS NULL
		 CREATE TABLE dbo.ticket_services (
		   id nvarchar(1000) NOT NULL CONSTRAINT ticket_services_pkey PRIMARY KEY,
		   ticketId nvarchar(1000) NOT NULL,
		   sequence int NOT NULL,
		   ticketStatus nvarchar(1000) NOT NULL,
		   counterId nvarchar(1000) NULL,
		   userId nvarchar(1000) NULL,
		   queueId nvarchar(1000) NULL,
		   subItemId nvarchar(1000) NULL,
		   subSubItemId nvarchar(1000) NULL,
		   startedAt datetime2 NOT NULL,
		   endedAt datetime2 NULL,
		   duration int NOT NULL,
		   holdComment nvarchar(1000) NULL,
		   redirectedFromCounterId nvarchar(1000) NULL,
		   redirectedToCounterId nvarchar(1000) NULL,
		   endReason nvarchar(1000) NULL,
		   sessionId nvarchar(1000) NULL,
		   createdAt datetime2 NOT NULL CONSTRAINT ticket_services_createdAt_df DEFAULT (getdate()),
		   updatedAt datetime2 NOT NULL
		 )`
	);
	await exec(
		tx,
		`IF OBJECT_ID('dbo.counter_availability_events') IS NULL
		 CREATE TABLE dbo.counter_availability_events (
		   id nvarchar(1000) NOT NULL CONSTRAINT counter_availability_events_pkey PRIMARY KEY,
		   counterId nvarchar(1000) NOT NULL,
		   eventType nvarchar(1000) NOT NULL,
		   reason nvarchar(1000) NULL,
		   at datetime2 NOT NULL,
		   createdAt datetime2 NOT NULL CONSTRAINT counter_availability_events_createdAt_df DEFAULT (getdate()),
		   updatedAt datetime2 NOT NULL
		 )`
	);
}

async function convertTimeColumn(tx, table, column, nullable) {
	const meta = await columnMeta(tx, table, column);
	if (!meta) throw new Error(`Missing ${table}.${column}`);
	if (meta.typeName === 'datetime2') return;
	if (meta.typeName !== 'nvarchar') throw new Error(`${table}.${column} is ${meta.typeName}, expected nvarchar`);
	if (nullable) {
		await exec(tx, `UPDATE dbo.${quoteIdent(table)} SET ${quoteIdent(column)} = NULL WHERE ${quoteIdent(column)} = ''`);
	}
	const bad = await query(
		tx,
		`SELECT COUNT(*) AS n FROM dbo.${quoteIdent(table)}
		 WHERE ${quoteIdent(column)} IS NOT NULL AND TRY_CONVERT(datetime2, ${quoteIdent(column)}) IS NULL`
	);
	if (bad[0].n > 0) throw new Error(`${table}.${column} has ${bad[0].n} values that are not datetimes`);
	if (!nullable) {
		const empty = await query(
			tx,
			`SELECT COUNT(*) AS n FROM dbo.${quoteIdent(table)} WHERE ${quoteIdent(column)} IS NULL OR ${quoteIdent(column)} = ''`
		);
		if (empty[0].n > 0) throw new Error(`${table}.${column} has ${empty[0].n} empty values and cannot become NOT NULL`);
	}
	await dropDefaults(tx, table, column);
	await exec(
		tx,
		`ALTER TABLE dbo.${quoteIdent(table)} ALTER COLUMN ${quoteIdent(column)} datetime2 ${nullable ? 'NULL' : 'NOT NULL'}`
	);
}

async function tighten(tx, table, column, typeName) {
	const meta = await columnMeta(tx, table, column);
	if (!meta) throw new Error(`Missing ${table}.${column}`);
	if (!meta.isNullable) return;
	await exec(
		tx,
		`ALTER TABLE dbo.${quoteIdent(table)} ALTER COLUMN ${quoteIdent(column)} ${typeName} NOT NULL`
	);
}

async function ensureCreatedAtDefault(tx, table) {
	const rows = await query(
		tx,
		`SELECT 1 AS ok
		 FROM sys.default_constraints dc
		 JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
		 WHERE dc.parent_object_id = OBJECT_ID(@table) AND c.name = 'createdAt'`,
		{ table: `dbo.${table}` }
	);
	if (rows.length) return;
	await exec(
		tx,
		`ALTER TABLE dbo.${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(`${table}_createdAt_df`)} DEFAULT (getdate()) FOR createdAt`
	);
}

async function applyMigration(tx, plans, counters) {
	await createNewTables(tx);
	await addColumn(tx, 'banktickets', 'currentServiceId', 'nvarchar(1000) NULL');
	await addColumn(tx, 'banktickets', 'templateId', 'nvarchar(1000) NULL');
	await addColumn(tx, 'banktickets', 'oldContacts', 'nvarchar(max) NULL');
	await addColumn(tx, 'counters', 'subItemId', 'nvarchar(1000) NULL');
	await addColumn(tx, 'counters', 'subSubItemId', 'nvarchar(1000) NULL');
	await addColumn(tx, 'counters', 'unavailableReason', 'nvarchar(1000) NULL');
	await addColumn(tx, 'counter_availability_events', 'reason', 'nvarchar(1000) NULL');
	await addColumn(tx, 'sub_menu_items', 'priority', 'bit NOT NULL CONSTRAINT sub_menu_items_priority_df DEFAULT 0');
	await addColumn(tx, 'sub_sub_menu_items', 'priority', 'bit NOT NULL CONSTRAINT sub_sub_menu_items_priority_df DEFAULT 0');
	for (const column of [
		'sessionId',
		'actorType',
		'category',
		'action',
		'outcome',
		'branchId',
		'ticketId',
		'ticketServiceId',
		'counterId'
	]) {
		await addColumn(tx, 'audit_logs', column, 'nvarchar(1000) NULL');
	}

	const existingServices = await query(tx, `SELECT COUNT(*) AS n FROM dbo.ticket_services`);
	if (existingServices[0].n > 0) {
		throw new Error('ticket_services already has rows. Refusing to insert a second copy.');
	}

	for (const plan of plans) {
		for (const segment of plan.segments) {
			await exec(
				tx,
				`INSERT INTO dbo.ticket_services (
				   id, ticketId, sequence, ticketStatus, counterId, userId, queueId, subItemId, subSubItemId,
				   startedAt, endedAt, duration, holdComment, endReason, redirectedFromCounterId, redirectedToCounterId,
				   createdAt, updatedAt
				 ) VALUES (
				   @id, @ticketId, @sequence, @ticketStatus, @counterId, @userId, @queueId, @subItemId, @subSubItemId,
				   CONVERT(datetime2, @startedAt),
				   CASE WHEN @endedAt IS NULL THEN NULL ELSE CONVERT(datetime2, @endedAt) END,
				   @duration, @holdComment, @endReason, @redirectedFromCounterId, @redirectedToCounterId,
				   CONVERT(datetime2, @createdAt),
				   CONVERT(datetime2, @updatedAt)
				 )`,
				{
					id: segment.id,
					ticketId: plan.id,
					sequence: segment.sequence,
					ticketStatus: segment.ticketStatus,
					counterId: segment.counterId,
					userId: segment.userId,
					queueId: segment.queueId,
					subItemId: segment.subItemId,
					subSubItemId: segment.subSubItemId,
					startedAt: segment.startedAt,
					endedAt: segment.endedAt,
					duration: segment.duration,
					holdComment: segment.holdComment,
					endReason: segment.endReason,
					redirectedFromCounterId: segment.redirectedFromCounterId,
					redirectedToCounterId: segment.redirectedToCounterId,
					createdAt: segment.startedAt,
					updatedAt: segment.endedAt || segment.startedAt
				}
			);
		}
		await exec(
			tx,
			`UPDATE dbo.banktickets SET
			   ticketStatus = @ticketStatus,
			   counterId = @counterId,
			   currentServiceId = @currentServiceId,
			   notServedAt = @notServedAt,
			   servedAt = @servedAt,
			   notServedDuration = @notServedDuration,
			   servingDuration = @servingDuration,
			   holdDuration = @holdDuration,
			   totalDuration = @totalDuration,
			   callAgain = @callAgain,
			   pendingRedirectAcceptance = @pendingRedirectAcceptance
			 WHERE id = @id`,
			{
				id: plan.id,
				ticketStatus: plan.status,
				counterId: plan.counterId,
				currentServiceId: plan.currentServiceId,
				notServedAt: plan.notServedAt,
				servedAt: plan.servedAt,
				notServedDuration: plan.notServedDuration,
				servingDuration: plan.servingDuration,
				holdDuration: plan.holdDuration,
				totalDuration: plan.totalDuration,
				callAgain: plan.callAgain,
				pendingRedirectAcceptance: plan.pendingRedirectAcceptance
			}
		);
	}

	const restore = [];
	const changing = new Set(TIME_COLUMNS.map(([table, column]) => `${table}.${column}`));
	for (const [table, columns] of Object.entries(DROP_COLUMNS)) {
		for (const column of columns) changing.add(`${table}.${column}`);
	}
	for (const table of new Set([...TIME_COLUMNS.map(([t]) => t), ...Object.keys(DROP_COLUMNS)])) {
		for (const index of await listIndexes(tx, table)) {
			const cols = [...index.keys, ...index.included].map((col) => col.replace(/[[\] ]|ASC|DESC/g, ''));
			const touches = cols.some((col) => changing.has(`${table}.${col}`));
			if (!touches) continue;
			const survives = cols.every((col) => !DROP_COLUMNS[table]?.includes(col));
			if (survives) restore.push({ table, index });
			await dropIndex(tx, table, index.name);
		}
	}
	for (const [table, columns] of Object.entries(DROP_COLUMNS)) {
		for (const column of columns) await dropForeignKeysOn(tx, table, column);
	}

	for (const [table, column, nullable] of TIME_COLUMNS) {
		await convertTimeColumn(tx, table, column, nullable);
	}
	for (const column of ['callAgain', 'pendingRedirectAcceptance']) {
		await exec(tx, `UPDATE dbo.banktickets SET ${quoteIdent(column)} = 0 WHERE ${quoteIdent(column)} IS NULL`);
		await tighten(tx, 'banktickets', column, 'bit');
	}
	for (const column of ['notServedDuration', 'servingDuration', 'holdDuration', 'totalDuration']) {
		await exec(tx, `UPDATE dbo.banktickets SET ${quoteIdent(column)} = 0 WHERE ${quoteIdent(column)} IS NULL`);
		await tighten(tx, 'banktickets', column, 'int');
	}
	for (const table of new Set(TIME_COLUMNS.filter(([, column]) => column === 'createdAt').map(([table]) => table))) {
		await ensureCreatedAtDefault(tx, table);
	}

	for (const [table, columns] of Object.entries(DROP_COLUMNS)) {
		for (const column of columns) {
			if (!(await columnMeta(tx, table, column))) continue;
			await dropDefaults(tx, table, column);
			await dropForeignKeysOn(tx, table, column);
			await exec(tx, `ALTER TABLE dbo.${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)}`);
		}
	}
	for (const { table, index } of restore) {
		const exists = await query(
			tx,
			`SELECT 1 AS ok FROM sys.indexes WHERE name = @name AND object_id = OBJECT_ID(@table)`,
			{ name: index.name, table: `dbo.${table}` }
		);
		if (!exists.length) await exec(tx, createIndexSql(table, index));
	}

	await ensureIndex(tx, 'banktickets', 'banktickets_currentServiceId_idx', 'currentServiceId');
	await ensureIndex(
		tx,
		'banktickets',
		'banktickets_branchId_ticketStatus_createdAt_idx',
		'branchId, ticketStatus, createdAt'
	);
	await ensureIndex(
		tx,
		'banktickets',
		'banktickets_counterId_ticketStatus_createdAt_idx',
		'counterId, ticketStatus, createdAt'
	);
	await ensureIndex(tx, 'counters', 'counters_subItemId_idx', 'subItemId');
	await ensureIndex(tx, 'counters', 'counters_subSubItemId_idx', 'subSubItemId');
	await ensureIndex(tx, 'ticket_services', 'ticket_services_ticketId_sequence_key', 'ticketId, sequence', { unique: true });
	await ensureIndex(tx, 'ticket_services', 'ticket_services_ticketId_endedAt_idx', 'ticketId, endedAt');
	await ensureIndex(
		tx,
		'ticket_services',
		'ticket_services_counterId_ticketStatus_endedAt_idx',
		'counterId, ticketStatus, endedAt'
	);
	await ensureIndex(tx, 'ticket_services', 'ticket_services_sessionId_idx', 'sessionId');
	await ensureIndex(tx, 'counter_availability_events', 'counter_availability_events_counterId_at_idx', 'counterId, at');
	await ensureIndex(tx, 'user_sessions', 'user_sessions_userId_startedAt_idx', 'userId, startedAt');
	await ensureIndex(tx, 'user_sessions', 'user_sessions_branchId_startedAt_idx', 'branchId, startedAt');
	await ensureIndex(tx, 'user_sessions', 'user_sessions_actorType_startedAt_idx', 'actorType, startedAt');
	await ensureIndex(tx, 'audit_logs', 'audit_logs_sessionId_createdAt_idx', 'sessionId, createdAt');
	await ensureIndex(tx, 'audit_logs', 'audit_logs_userId_createdAt_idx', 'userId, createdAt');
	await ensureIndex(tx, 'audit_logs', 'audit_logs_action_createdAt_idx', 'action, createdAt');
	await ensureIndex(tx, 'audit_logs', 'audit_logs_branchId_createdAt_idx', 'branchId, createdAt');
	await ensureIndex(tx, 'audit_logs', 'audit_logs_ticketId_idx', 'ticketId');
	await ensureIndex(tx, 'audit_logs', 'audit_logs_category_createdAt_idx', 'category, createdAt');

	await ensureFk(tx, 'banktickets_counterId_fkey', 'banktickets', 'counterId', 'counters', 'id');
	await ensureFk(tx, 'counters_subItemId_fkey', 'counters', 'subItemId', 'sub_menu_items', 'id');
	await ensureFk(tx, 'counters_subSubItemId_fkey', 'counters', 'subSubItemId', 'sub_sub_menu_items', 'id');
	await ensureFk(tx, 'ticket_services_ticketId_fkey', 'ticket_services', 'ticketId', 'banktickets', 'id');
	await ensureFk(tx, 'ticket_services_counterId_fkey', 'ticket_services', 'counterId', 'counters', 'id');
	await ensureFk(tx, 'ticket_services_userId_fkey', 'ticket_services', 'userId', 'users', 'id');
	await ensureFk(tx, 'ticket_services_redirectedFromCounterId_fkey', 'ticket_services', 'redirectedFromCounterId', 'counters', 'id');
	await ensureFk(tx, 'ticket_services_redirectedToCounterId_fkey', 'ticket_services', 'redirectedToCounterId', 'counters', 'id');
	await ensureFk(tx, 'ticket_services_sessionId_fkey', 'ticket_services', 'sessionId', 'user_sessions', 'id');
	await ensureFk(tx, 'user_sessions_userId_fkey', 'user_sessions', 'userId', 'users', 'id');
	await ensureFk(tx, 'user_sessions_branchId_fkey', 'user_sessions', 'branchId', 'branches', 'id');
	await ensureFk(tx, 'user_sessions_counterId_fkey', 'user_sessions', 'counterId', 'counters', 'id');
	await ensureFk(tx, 'counter_availability_events_counterId_fkey', 'counter_availability_events', 'counterId', 'counters', 'id');
	await ensureFk(tx, 'audit_logs_sessionId_fkey', 'audit_logs', 'sessionId', 'user_sessions', 'id');

	const events = await query(tx, `SELECT COUNT(*) AS n FROM dbo.counter_availability_events`);
	if (events[0].n === 0) {
		for (const counter of counters) {
			const at = wallClock(counter.createdAt);
			if (!at) throw new Error(`Counter ${counter.counterNumber} has no createdAt`);
			await exec(
				tx,
				`INSERT INTO dbo.counter_availability_events (id, counterId, eventType, at, createdAt, updatedAt)
				 VALUES (@id, @counterId, @eventType, CONVERT(datetime2, @at), CONVERT(datetime2, @at), CONVERT(datetime2, @at))`,
				{
					id: crypto.randomUUID(),
					counterId: counter.id,
					eventType: counter.available ? 'available' : 'paused',
					at
				}
			);
		}
	}

	const check = await query(
		tx,
		`SELECT
		   (SELECT COUNT(*) FROM dbo.banktickets) AS tickets,
		   (SELECT COUNT(*) FROM dbo.ticket_services) AS segments,
		   (SELECT COUNT(*) FROM dbo.banktickets t WHERE NOT EXISTS (
		      SELECT 1 FROM dbo.ticket_services s WHERE s.ticketId = t.id)) AS ticketsWithoutSegments,
		   (SELECT COUNT(*) FROM dbo.banktickets t WHERE t.ticketStatus IN ('Served', 'Cancelled', 'No Show') AND EXISTS (
		      SELECT 1 FROM dbo.ticket_services s WHERE s.ticketId = t.id AND s.endedAt IS NULL)) AS terminalStillOpen,
		   (SELECT COUNT(*) FROM dbo.banktickets t WHERE t.ticketStatus NOT IN ('Served', 'Cancelled', 'No Show') AND (
		      SELECT COUNT(*) FROM dbo.ticket_services s WHERE s.ticketId = t.id AND s.endedAt IS NULL) <> 1) AS badOpenCount
		`
	);
	const row = check[0];
	if (row.ticketsWithoutSegments || row.terminalStillOpen || row.badOpenCount) {
		throw new Error(`Post-check failed: ${JSON.stringify(row)}`);
	}
	return row;
}

async function main() {
	if (REFUSED.has(DATABASE)) {
		throw new Error(`Refusing to migrate ${DATABASE}. This script is for the production qms database.`);
	}
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set');
	const parsed = parseDatabaseUrl(url);
	const pool = await sql.connect({
		...parsed,
		database: DATABASE,
		requestTimeout: 180000,
		connectionTimeout: 15000,
		options: { encrypt: true, trustServerCertificate: true }
	});
	console.log(`${APPLY ? 'Applying' : 'Dry run'} on ${parsed.server}:${parsed.port} database ${DATABASE}`);
	try {
		const ticketsColumn = await query(pool, `SELECT COL_LENGTH('dbo.counters', 'tickets') AS len`);
		if (ticketsColumn[0].len == null) {
			throw new Error('counters.tickets is already gone. This database looks migrated.');
		}
		const counters = await query(
			pool,
			`SELECT id, userId, counterNumber, tickets, available, createdAt FROM dbo.counters`
		);
		const tickets = await query(
			pool,
			`SELECT id, ticketNo, ticketStatus, aggregateStatus, counterId, currentCounterId,
			        notServedAt, servingAt, holdAt, servedAt, holdComment, createdAt,
			        notServedDuration, servingDuration, holdDuration, totalDuration,
			        callAgain, pendingRedirectAcceptance, queueId, subItemId, subSubItemId
			 FROM dbo.banktickets`
		);
		const visits = loadVisits(counters);
		const notes = [];
		const plans = tickets.map((ticket) => buildPlan(ticket, visits.get(ticket.id), notes));
		const unknownVisits = [...visits.keys()].filter((id) => !plans.some((plan) => plan.id === id));
		if (unknownVisits.length) {
			throw new Error(`Counter JSON references ${unknownVisits.length} tickets that are not in banktickets`);
		}
		console.log(summarize(plans));
		if (notes.length) console.log(`Adjustments:\n  ${notes.join('\n  ')}`);
		if (!APPLY) {
			console.log('\nDry run only. Re-run with --apply to write this database.');
			return;
		}
		const tx = new sql.Transaction(pool);
		await tx.begin();
		try {
			const result = await applyMigration(tx, plans, counters);
			await tx.commit();
			console.log(`\nCommitted. ${result.tickets} tickets, ${result.segments} segments.`);
		} catch (error) {
			await tx.rollback();
			throw error;
		}
	} finally {
		await pool.close();
	}
}

main().catch((error) => {
	console.error(error.message || error);
	process.exit(1);
});
