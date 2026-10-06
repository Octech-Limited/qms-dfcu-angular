import type { Request, Response, NextFunction, Express } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, like, lt, ne, sql } from 'drizzle-orm';
import { uuidV7 } from '../ids';
import { db } from '../db';
import {
	announcements,
	announcementTypes,
	auditLogs,
	bankSettings,
	banktickets,
	branches,
	counters,
	exchangeRates,
	logs,
	queues,
	roles,
	socialMedia,
	subMenuItems,
	subSubMenuItems,
	ticketAnnouncements,
	ticketServices,
	users,
	userSessions
} from '../db/schema';
import { logger } from '../logger';
import { loginStaff } from '../login';
import { requireAnySession, requireAuth, sendAuthError, sendJson } from '../auth';
import { createSession, destroyAuthSession, getSession, toPublicSession } from '../session';
import {
	createKioskSession,
	destroyKioskSession,
	getKioskSession,
	toPublicKioskSession
} from '../kioskSession';
import {
	createDisplaySession,
	destroyDisplaySession,
	getDisplaySession,
	toPublicDisplaySession
} from '../displaySession';
import { comparePassword, hashPassword } from '../password';
import { isLdapEnabled } from '../ldap/config';
import { authenticateLDAP } from '../ldap/ldapService';
import { openUserSession } from '../userSession';
import { AUDIT_ACTION } from '../auditActions';
import { recordActivity, recordAuthFailure, createAuditLog } from '../auditLogger';
import { getDashboardStats } from '../dashboard';
import { createTicket, countPeopleAhead, listTickets, UUID_RE } from '../tickets';
import {
	assertCounterNotServing,
	findClaimableTicket,
	getCounterDurationAverages,
	recordCounterAvailabilityEvent,
	serializeBankticket,
	transitionTicketService
} from '../ticketService';
import {
	branchesExist,
	deleteQueueBranches,
	listQueuesNested,
	parseQueueBranchIds,
	replaceQueueBranches
} from '../queues';
import {
	SERVICE_END_REASON,
	TICKET_STATUS,
	todayRange,
	calculateDurationInSeconds,
	formatAverageClock
} from '../ticketStatus';
import { eatCalendarDate, eatDayRangeForDate, eatEndOfDayMs, eatNow } from '../timezone';
import { validateUgandanPhoneNumber } from '../phone';
import { getAudioLanguageDirNames, isValidTicketLanguageString, MAX_TICKET_LANGUAGE_LENGTH } from '../audioLanguages';
import { isCustomFeedbackLink, ratingSmsUrl, smsService } from '../sms';
import { COUNTER_AVAILABILITY_EVENT } from '../ticketStatus';
import { isUnavailableReason } from '../../app/features/serving/unavailable-reasons';
import { registerAdsRoutes } from '../adsRoutes';

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res).catch(next);
	};
}

function p(req: Request, key: string): string {
	const value = req.params[key];
	return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

function endReasonForTransition(previousStatus: string, nextStatus: string) {
	if (nextStatus === TICKET_STATUS.HOLD) return SERVICE_END_REASON.HELD;
	if (nextStatus === TICKET_STATUS.REDIRECTED) return SERVICE_END_REASON.REDIRECTED;
	if (nextStatus === TICKET_STATUS.SERVED) return SERVICE_END_REASON.SERVED;
	if (nextStatus === TICKET_STATUS.CANCELLED) return SERVICE_END_REASON.CANCELLED;
	if (nextStatus === TICKET_STATUS.NO_SHOW) return SERVICE_END_REASON.NO_SHOW;
	if (nextStatus === TICKET_STATUS.SERVING && previousStatus === TICKET_STATUS.HOLD) {
		return SERVICE_END_REASON.RESUMED;
	}
	return SERVICE_END_REASON.CLAIMED;
}

function parsePermissions(raw: string | null | undefined): Record<string, boolean> {
	if (!raw) return {};
	try {
		return typeof raw === 'string' ? (JSON.parse(raw) as Record<string, boolean>) : (raw as Record<string, boolean>);
	} catch {
		return {};
	}
}

function validateRatingRequest(req: Request): string | null {
	const secret = process.env['RATING_API_SECRET'];
	const token = req.header('x-rating-token');
	if (secret && token === secret) return null;
	const origin = req.header('origin') || req.header('referer') || '';
	const allowed = process.env['ALLOWED_ORIGINS'] || '*';
	if (allowed === '*') return null;
	if (origin && allowed.split(',').some((o) => origin.startsWith(o.trim()))) return null;
	return 'Forbidden';
}

export function registerApi(app: Express): void {
	app.get(
		'/api/health',
		wrap(async (_req, res) => {
			try {
				await db.execute(sql`select 1 as ok`);
				sendJson(res, { ok: true, database: 'mssql' });
			} catch (error) {
				logger.error('Health check failed:', error);
				sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
			}
		})
	);

	app.get(
		'/api/session',
		wrap(async (_req, res) => {
			const session = await getSession();
			sendJson(res, toPublicSession(session));
		})
	);
	app.post(
		'/api/logout',
		wrap(async (_req, res) => {
			await destroyAuthSession();
			sendJson(res, { success: true });
		})
	);
	app.get(
		'/api/kiosk-session',
		wrap(async (_req, res) => {
			sendJson(res, toPublicKioskSession(await getKioskSession()));
		})
	);
	app.post(
		'/api/kiosk-logout',
		wrap(async (_req, res) => {
			await destroyKioskSession();
			sendJson(res, { success: true });
		})
	);
	app.get(
		'/api/displaySession',
		wrap(async (_req, res) => {
			sendJson(res, toPublicDisplaySession(await getDisplaySession()));
		})
	);
	app.post(
		'/api/displayLogout',
		wrap(async (_req, res) => {
			await destroyDisplaySession();
			sendJson(res, { success: true });
		})
	);
	app.get(
		'/api/kiosk/audio-languages',
		wrap(async (_req, res) => {
			sendJson(res, { languages: await getAudioLanguageDirNames() });
		})
	);

	app.post(
		'/api/bank/login',
		wrap(async (req, res) => {
			const body = req.body ?? {};
			const result = await loginStaff({
				username: body.username || body.email,
				password: body.password,
				isAdminLogin: Boolean(body.isAdminLogin)
			});
			if (!result.ok) return sendJson(res, { error: result.error }, result.status);
			sendJson(res, { success: true });
		})
	);

	app.post(
		'/api/bank/tellerLogin',
		wrap(async (req, res) => {
			const body = req.body ?? {};
			const username = body.username || body.email;
			const { password } = body;
			if (!username || !password) return sendJson(res, { error: 'Username and password are required' }, 400);
			const emailForDbLookup = String(username).trim();
			let useLdapAuth = false;
			let ldapEmail: string | undefined;
			const ldapEnabled = isLdapEnabled();
			const authMethod = process.env['AUTH_METHOD'] || 'database';
			if (ldapEnabled && (authMethod === 'ldap' || authMethod === 'hybrid')) {
				const ldapAuthResult = await authenticateLDAP(username, password);
				if (ldapAuthResult.success) {
					useLdapAuth = true;
					ldapEmail = ldapAuthResult.user?.email;
				} else if (authMethod === 'ldap') {
					await recordAuthFailure({ username: emailForDbLookup, reason: 'LDAP failed', actorType: 'serving' });
					return sendJson(res, { error: ldapAuthResult.message || 'Binding failed: Invalid credentials' }, 401);
				}
			}
			const [byUsername] = await db.select().top(1).from(users).where(eq(users.username, emailForDbLookup));
			let user = byUsername ?? null;
			if (!user) {
				const [byEmail] = await db.select().top(1).from(users).where(eq(users.email, emailForDbLookup));
				user = byEmail ?? null;
			}
			if (!user && ldapEmail) {
				const [byLdap] = await db.select().top(1).from(users).where(eq(users.email, ldapEmail.trim()));
				user = byLdap ?? null;
			}
			if (!user) {
				await recordAuthFailure({ username: emailForDbLookup, reason: 'User not found', actorType: 'serving' });
				return sendJson(res, { error: 'User not found in system. Please contact your administrator.' }, 401);
			}
			if (!useLdapAuth) {
				let isValidPassword = false;
				if (authMethod === 'database') {
					isValidPassword = password === user.username;
				} else if (user.password) {
					isValidPassword = await comparePassword(password, user.password);
				}
				if (!isValidPassword) {
					await recordAuthFailure({
						username: emailForDbLookup,
						reason: 'Invalid password',
						actorType: 'serving',
						userId: user.id
					});
					return sendJson(res, { error: 'Binding failed: Invalid credentials' }, 401);
				}
			}
			if (user.status === false) {
				return sendJson(res, { error: 'Your account or branch has been temporarily suspended please contact your admin' }, 403);
			}
			if (!user.branchId) {
				return sendJson(res, { error: 'NO_BRANCH', message: 'Your account does not have a branch assigned.' }, 403);
			}
			const [branch] = await db.select().top(1).from(branches).where(eq(branches.id, user.branchId));
			if (branch && branch.status === false) {
				return sendJson(res, { error: 'Your account or branch has been temporarily suspended please contact your admin' }, 403);
			}
			let roleName = '';
			let permissions: Record<string, boolean> = {};
			if (user.roleId) {
				const [role] = await db.select().top(1).from(roles).where(eq(roles.id, user.roleId));
				roleName = role?.name ?? '';
				permissions = parsePermissions(role?.permissions);
			}
			if (roleName !== 'admin' && permissions['Serving'] !== true) {
				return sendJson(res, { error: 'NO_SERVING_PERMISSION', message: 'You do not have permission to access Serving.' }, 403);
			}
			const { today, tomorrow } = todayRange();
			const [existingCounter] = await db
				.select()
				.top(1)
				.from(counters)
				.where(and(eq(counters.userId, user.id), gte(counters.createdAt, today), lt(counters.createdAt, tomorrow)));
			const created = await createSession({
				userId: user.id,
				actorType: 'serving',
				branchId: user.branchId,
				counterId: existingCounter?.id,
				role: roleName,
				permissions,
				expiresAt: eatEndOfDayMs()
			});
			if (created.sessionToken) {
				await openUserSession({
					sessionId: created.sessionToken,
					userId: user.id,
					actorType: 'serving',
					branchId: user.branchId,
					counterId: existingCounter?.id,
					loginMethod: useLdapAuth ? 'ldap' : 'database'
				});
				await recordActivity({
					action: AUDIT_ACTION.AUTH_LOGIN,
					sessionId: created.sessionToken,
					userId: user.id,
					actorType: 'serving',
					branchId: user.branchId,
					counterId: existingCounter?.id,
					description: `${user.username} logged in to serving`
				});
			}
			sendJson(res, { success: true, hasExistingCounter: Boolean(existingCounter) });
		})
	);

	app.post(
		'/api/bank/kiosk-login',
		wrap(async (req, res) => {
			const { username, password } = req.body ?? {};
			if (!username || !password) return sendJson(res, { error: 'Username and password are required' }, 400);
			const [branch] = await db.select().top(1).from(branches).where(eq(branches.kioskUsername, username));
			if (!branch?.kioskPassword || !(await comparePassword(password, branch.kioskPassword))) {
				return sendJson(res, { error: 'Invalid credentials' }, 401);
			}
			if (branch.status === false) {
				return sendJson(res, { error: 'Your account or branch has been temporarily suspended please contact your admin' }, 403);
			}
			await createKioskSession({ branchId: branch.id, kioskUsername: branch.kioskUsername ?? undefined });
			sendJson(res, { success: true, message: 'Kiosk login successful' });
		})
	);

	app.post(
		'/api/bank/display-login',
		wrap(async (req, res) => {
			const { username, password } = req.body ?? {};
			if (!username || !password) return sendJson(res, { error: 'Username and password are required' }, 400);
			const [branch] = await db
				.select()
				.top(1)
				.from(branches)
				.where(eq(branches.hallDisplayUsername, username));
			if (!branch?.hallDisplayPassword || !(await comparePassword(password, branch.hallDisplayPassword))) {
				return sendJson(res, { error: 'Invalid credentials' }, 401);
			}
			if (branch.status === false) {
				return sendJson(res, { error: 'This branch is inactive' }, 403);
			}
			await createDisplaySession({
				branchId: branch.id,
				hallDisplayUsername: branch.hallDisplayUsername
			});
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/auth-config',
		wrap(async (_req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			sendJson(res, {
				authMethod: process.env['AUTH_METHOD'] || 'database',
				AUTH_METHOD: process.env['AUTH_METHOD'] || 'database'
			});
		})
	);

	app.get(
		'/api/bank/permissions',
		wrap(async (_req, res) => {
			const session = await getSession();
			sendJson(res, session.permissions ?? {});
		})
	);

	app.get(
		'/api/bank/dashboard',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const branchId = String(req.query['branchId'] || auth.session.branchId || '');
			if (!branchId) return sendJson(res, { error: 'branchId is required' }, 400);
			sendJson(res, await getDashboardStats(branchId));
		})
	);

	registerTicketRoutes(app);
	registerOrgRoutes(app);
	registerRatingRoutes(app);
}

function registerTicketRoutes(app: Express): void {
	app.get(
		'/api/bank/ticket',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const tickets = await listTickets({
				queueId: String(req.query['queueId'] || '') || null,
				status: String(req.query['status'] || '') || null,
				branchId: String(req.query['branchId'] || '') || null,
				counterId: String(req.query['counterId'] || '') || null
			});
			sendJson(res, tickets);
		})
	);

	app.post(
		'/api/bank/ticket',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			const branchId = String(
				auth.kioskSession?.branchId || auth.regularSession?.branchId || body.branchId || ''
			);
			if (!body.queueId || !body.issueDescription || !branchId) {
				return sendJson(res, { success: false, error: 'queueId, issueDescription and branchId are required' }, 400);
			}
			if (!UUID_RE.test(body.queueId) || !UUID_RE.test(branchId)) {
				return sendJson(res, { success: false, error: 'Invalid id format' }, 400);
			}
			if (body.language) {
				const audioDirs = await getAudioLanguageDirNames();
				if (
					body.language.length > MAX_TICKET_LANGUAGE_LENGTH ||
					!isValidTicketLanguageString(body.language, audioDirs)
				) {
					return sendJson(res, { success: false, error: 'Invalid language value' }, 400);
				}
			}
			let phoneNumber: string | null = body.phoneNumber || null;
			if (body.phoneNumber) {
				const phoneValidation = validateUgandanPhoneNumber(body.phoneNumber);
				if (!phoneValidation.isValid) {
					return sendJson(res, { success: false, error: phoneValidation.error || 'Invalid phone number' }, 400);
				}
				phoneNumber = phoneValidation.normalizedNumber ?? null;
			}
			const savedTicket = await createTicket({
				queueId: body.queueId,
				branchId,
				issueDescription: body.issueDescription,
				subItemId: body.subItemId || null,
				subSubItemId: body.subSubItemId || null,
				phoneNumber,
				language: body.language || 'English',
				multipleTransactions: body.multipleTransactions
			});
			const peopleAhead = await countPeopleAhead(body.queueId, branchId, savedTicket.id);
			await recordActivity({
				action: 'serving.ticket.create',
				userId: auth.regularSession?.userId,
				branchId,
				ticketId: savedTicket.id,
				description: `Ticket ${savedTicket.ticketNo} created`,
				performedBy: auth.regularSession?.userId ?? 'kiosk'
			});
			sendJson(
				res,
				{
					success: true,
					data: {
						id: savedTicket.id,
						ticketNo: savedTicket.ticketNo,
						issueDescription: savedTicket.issueDescription,
						smsDeferred: Boolean(phoneNumber)
					}
				},
				201
			);
			if (phoneNumber) {
				void (async () => {
					const [settings] = await db.select().top(1).from(bankSettings);
					const [branch] = await db.select().top(1).from(branches).where(eq(branches.id, branchId));
					await smsService.sendTicketNotification(
						savedTicket.ticketNo,
						phoneNumber,
						peopleAhead,
						settings?.companyName,
						branch?.name,
						savedTicket.issueDescription
					);
				})().catch((error) => logger.error('Deferred ticket SMS failed:', error));
			}
		})
	);

	app.get(
		'/api/bank/ticket/next',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const counterId = String(req.query['counterId'] || auth.regularSession?.counterId || '');
			if (!counterId) return sendJson(res, { ticket: null });
			const [counter] = await db.select().top(1).from(counters).where(eq(counters.id, counterId));
			if (!counter) return sendJson(res, { ticket: null });
			const ticket = await findClaimableTicket(counter);
			sendJson(res, { ticket: ticket ? serializeBankticket(ticket) : null });
		})
	);

	app.post(
		'/api/bank/ticket/claim',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			if (auth.sessionType === 'display' || auth.sessionType === 'kiosk') {
				return sendJson(res, { error: 'Only teller sessions can claim tickets' }, 403);
			}
			const counterId = typeof req.body?.counterId === 'string' ? req.body.counterId : null;
			if (!counterId) return sendJson(res, { error: 'counterId is required' }, 400);
			const [counter] = await db.select().top(1).from(counters).where(eq(counters.id, counterId));
			if (!counter) return sendJson(res, { error: 'Counter not found' }, 404);
			const sessionUserId = auth.regularSession?.userId;
			if (sessionUserId && counter.userId && counter.userId !== sessionUserId) {
				return sendJson(res, { error: 'Counter is not assigned to this user' }, 403);
			}
			const { today, tomorrow } = todayRange();
			const alreadyServing = await db
				.select()
				.from(banktickets)
				.where(
					and(
						eq(banktickets.counterId, counterId),
						eq(banktickets.ticketStatus, TICKET_STATUS.SERVING),
						gte(banktickets.createdAt, today),
						lt(banktickets.createdAt, tomorrow)
					)
				);
			if (alreadyServing.length > 0) {
				const keep = alreadyServing[0];
				for (const extra of alreadyServing.slice(1)) {
					await transitionTicketService({
						ticketId: extra.id,
						nextTicketStatus: TICKET_STATUS.REDIRECTED,
						endReason: SERVICE_END_REASON.REDIRECTED,
						userId: counter.userId,
						sessionId: auth.regularSession?.sessionToken ?? null,
						redirectedFromCounterId: counter.id,
						redirectedToCounterId: counter.id,
						counterId: counter.id
					});
				}
				return sendJson(res, {
					ticket: serializeBankticket(keep),
					alreadyServing: true,
					releasedDuplicates: alreadyServing.length - 1
				});
			}
			const nextTicket = await findClaimableTicket(counter, { includeRedirects: false });
			if (!nextTicket) return sendJson(res, { ticket: null, alreadyServing: false, releasedDuplicates: 0 });
			const claimed = await transitionTicketService({
				ticketId: nextTicket.id,
				nextTicketStatus: TICKET_STATUS.SERVING,
				endReason: SERVICE_END_REASON.CLAIMED,
				counterId,
				userId: counter.userId,
				sessionId: auth.regularSession?.sessionToken ?? null
			});
			await recordActivity({
				action: 'serving.ticket.claim',
				ticketId: claimed.id,
				counterId,
				description: `Claimed ticket ${claimed.ticketNo}`
			});
			const now = eatNow();
			await db.insert(ticketAnnouncements).values({
				id: uuidV7(),
				ticketId: claimed.id,
				ticketNo: claimed.ticketNo,
				branchId: claimed.branchId,
				counterId,
				counterNumber: counter.counterNumber,
				announcementType: 'initial',
				language: claimed.language || 'English',
				attemptNumber: 1,
				status: 'queued',
				ticketStatus: TICKET_STATUS.SERVING,
				callAgain: false,
				queuedAt: now,
				createdAt: now,
				updatedAt: now
			});
			sendJson(res, { ticket: serializeBankticket(claimed), alreadyServing: false, releasedDuplicates: 0 });
		})
	);

	app.post(
		'/api/bank/ticket/search',
		wrap(async (req, res) => {
			const ticketNo = String(req.body?.ticketNo || '');
			const branchId = String(req.body?.branchId || '');
			if (!ticketNo) return sendJson(res, { error: 'ticketNo is required' }, 400);
			const clauses = [eq(banktickets.ticketNo, ticketNo)];
			if (branchId) clauses.push(eq(banktickets.branchId, branchId));
			const [ticket] = await db.select().top(1).from(banktickets).where(and(...clauses));
			sendJson(res, ticket ? serializeBankticket(ticket) : null);
		})
	);

	app.get(
		'/api/bank/ticket/stats',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const branchId = String(req.query['branchId'] || '');
			const { today, tomorrow } = todayRange();
			const rows = await db
				.select({ queueId: banktickets.queueId, value: count() })
				.from(banktickets)
				.where(
					and(
						eq(banktickets.ticketStatus, TICKET_STATUS.NOT_SERVED),
						gte(banktickets.createdAt, today),
						lt(banktickets.createdAt, tomorrow),
						...(branchId ? [eq(banktickets.branchId, branchId)] : [])
					)
				)
				.groupBy(banktickets.queueId);
			sendJson(res, rows);
		})
	);

	app.get(
		'/api/bank/ticket/history',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const ticketNo = String(req.query['ticketNo'] || '').trim();
			const branchId = String(req.query['branchId'] || '');
			const date = String(req.query['date'] || '');
			const status = String(req.query['status'] || '');
			const from = String(req.query['from'] || '');
			const to = String(req.query['to'] || '');

			if (ticketNo) {
				const clauses = [eq(banktickets.ticketNo, ticketNo)];
				if (branchId) clauses.push(eq(banktickets.branchId, branchId));
				if (date) {
					try {
						const range = eatDayRangeForDate(date);
						clauses.push(gte(banktickets.createdAt, range.today));
						clauses.push(lt(banktickets.createdAt, range.tomorrow));
					} catch {
						return sendJson(res, { success: false, error: 'Invalid date' }, 400);
					}
				}
				const rows = await db
					.select()
					.from(banktickets)
					.where(and(...clauses))
					.orderBy(desc(banktickets.createdAt));
				const limited = rows.slice(0, 25);
				const tickets = [];
				for (const ticket of limited) {
					const [counter] = ticket.counterId
						? await db.select().top(1).from(counters).where(eq(counters.id, ticket.counterId))
						: [null];
					tickets.push(serializeBankticket({ ...ticket, counter: counter ?? null }));
				}
				return sendJson(res, { success: true, tickets });
			}

			const clauses = [];
			if (branchId) clauses.push(eq(banktickets.branchId, branchId));
			if (status) clauses.push(eq(banktickets.ticketStatus, status));
			if (from) clauses.push(gte(banktickets.createdAt, eatDayRangeForDate(from).today));
			if (to) clauses.push(lt(banktickets.createdAt, eatDayRangeForDate(to).tomorrow));
			const rows = await db
				.select()
				.from(banktickets)
				.where(clauses.length ? and(...clauses) : undefined)
				.orderBy(desc(banktickets.createdAt));
			sendJson(
				res,
				rows.map((t) => serializeBankticket(t))
			);
		})
	);

	app.get(
		'/api/bank/ticket/durationStats',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const counterId = String(req.query['counterId'] || '');
			if (!counterId) return sendJson(res, { error: 'counterId is required' }, 400);
			sendJson(res, await getCounterDurationAverages(counterId));
		})
	);

	app.get(
		'/api/bank/ticket/:id',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const [ticket] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, p(req, 'id')));
			if (!ticket) return sendJson(res, { error: 'Ticket not found' }, 404);
			const [counter] = ticket.counterId
				? await db.select().top(1).from(counters).where(eq(counters.id, ticket.counterId))
				: [null];
			sendJson(res, serializeBankticket({ ...ticket, counter: counter ?? null }));
		})
	);

	app.get(
		'/api/bank/ticket/:id/history',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const rows = await db
				.select()
				.from(ticketServices)
				.where(eq(ticketServices.ticketId, p(req, 'id')))
				.orderBy(asc(ticketServices.sequence));
			const services = [];
			for (const row of rows) {
				const [counter] = row.counterId
					? await db.select().top(1).from(counters).where(eq(counters.id, row.counterId))
					: [null];
				const [user] = row.userId
					? await db
							.select({
								id: users.id,
								username: users.username,
								firstName: users.firstName,
								lastName: users.lastName
							})
							.top(1)
							.from(users)
							.where(eq(users.id, row.userId))
					: [null];
				const [fromCounter] = row.redirectedFromCounterId
					? await db.select().top(1).from(counters).where(eq(counters.id, row.redirectedFromCounterId))
					: [null];
				const [toCounter] = row.redirectedToCounterId
					? await db.select().top(1).from(counters).where(eq(counters.id, row.redirectedToCounterId))
					: [null];
				services.push({
					...row,
					counter: counter ? { id: counter.id, counterNumber: counter.counterNumber } : null,
					user: user ?? null,
					redirectedFromCounter: fromCounter
						? { id: fromCounter.id, counterNumber: fromCounter.counterNumber }
						: null,
					redirectedToCounter: toCounter
						? { id: toCounter.id, counterNumber: toCounter.counterNumber }
						: null
				});
			}
			sendJson(res, { services });
		})
	);

	app.post(
		'/api/bank/ticket/:id/rating',
		wrap(async (req, res) => {
			const rating = Number(req.body?.rating);
			const ratingComment = req.body?.ratingComment ? String(req.body.ratingComment) : null;
			if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
				return sendJson(res, { error: 'rating must be 1-5' }, 400);
			}
			const [ticket] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, p(req, 'id')));
			if (!ticket) return sendJson(res, { error: 'Ticket not found' }, 404);
			await db
				.update(banktickets)
				.set({ rating, ratingComment, updatedAt: eatNow() })
				.where(eq(banktickets.id, ticket.id));
			sendJson(res, { success: true });
		})
	);

	app.put(
		'/api/bank/ticket/:id',
		wrap(async (req, res) => {
			if (!UUID_RE.test(p(req, 'id'))) return sendJson(res, { success: false, error: 'Invalid ticket ID format' }, 400);
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			const [ticket] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, p(req, 'id')));
			if (!ticket) return sendJson(res, { success: false, error: 'Ticket not found' }, 404);
			if (
				ticket.ticketStatus === TICKET_STATUS.EXPIRED &&
				(body.ticketStatus || body.redirectToCounterId || typeof body.callAgain === 'boolean')
			) {
				return sendJson(res, { success: false, error: 'Ticket has expired' }, 409);
			}

			if (typeof body.callAgain === 'boolean' && !body.ticketStatus && !body.redirectToCounterId) {
				await db.update(banktickets).set({ callAgain: body.callAgain }).where(eq(banktickets.id, ticket.id));
				if (body.callAgain) {
					const now = eatNow();
					const [counter] = ticket.counterId
						? await db.select().top(1).from(counters).where(eq(counters.id, ticket.counterId))
						: [null];
					await db.insert(ticketAnnouncements).values({
						id: uuidV7(),
						ticketId: ticket.id,
						ticketNo: ticket.ticketNo,
						branchId: ticket.branchId,
						counterId: ticket.counterId,
						counterNumber: counter?.counterNumber ?? null,
						announcementType: 'call_again',
						language: ticket.language || 'English',
						attemptNumber: 1,
						status: 'queued',
						ticketStatus: ticket.ticketStatus,
						callAgain: true,
						queuedAt: now,
						createdAt: now,
						updatedAt: now
					});
				}
				const [updated] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, ticket.id));
				return sendJson(res, { success: true, data: serializeBankticket(updated) });
			}
			if (body.redirectToCounterId) {
				const updated = await transitionTicketService({
					ticketId: ticket.id,
					nextTicketStatus: TICKET_STATUS.REDIRECTED,
					endReason: SERVICE_END_REASON.REDIRECTED,
					userId: auth.regularSession?.userId,
					sessionId: auth.regularSession?.sessionToken,
					redirectedFromCounterId: ticket.counterId,
					redirectedToCounterId: body.redirectToCounterId,
					counterId: body.redirectToCounterId
				});
				return sendJson(res, { success: true, data: serializeBankticket(updated) });
			}
			if (body.ticketStatus) {
				if (body.ticketStatus === TICKET_STATUS.SERVING) {
					const counterId = auth.regularSession?.counterId ?? ticket.counterId;
					if (counterId) await assertCounterNotServing(counterId, ticket.id);
				}
				const updated = await transitionTicketService({
					ticketId: ticket.id,
					nextTicketStatus: body.ticketStatus,
					endReason: endReasonForTransition(ticket.ticketStatus, body.ticketStatus),
					counterId: auth.regularSession?.counterId ?? ticket.counterId,
					userId: auth.regularSession?.userId,
					sessionId: auth.regularSession?.sessionToken,
					holdComment: body.holdComment ?? null,
					ticketPatch: {
						queueId: body.queueId,
						subItemId: body.subItemId,
						subSubItemId: body.subSubItemId,
						justifyReason: body.justifyReason,
						multipleTransactions: body.multipleTransactions
							? JSON.stringify(body.multipleTransactions)
							: undefined
					}
				});
				let ratingSmsDeferred = false;
				const feedbackUrl = ratingSmsUrl(updated.id);
				if (
					body.ticketStatus === TICKET_STATUS.SERVED &&
					updated.phoneNumber &&
					feedbackUrl
				) {
					ratingSmsDeferred = true;
					const ticketIdForSms = updated.id;
					const phoneForSms = updated.phoneNumber;
					const branchIdForSms = updated.branchId;
					void (async () => {
						try {
							const [settings] = await db.select().top(1).from(bankSettings);
							const [branch] = branchIdForSms
								? await db.select().top(1).from(branches).where(eq(branches.id, branchIdForSms))
								: [null];
							const smsResult = await smsService.sendRatingRequest(
								ticketIdForSms,
								phoneForSms,
								settings?.companyName,
								branch?.name
							);
							if (smsResult.success) {
								logger.info('Rating request SMS sent successfully for ticket:', updated.ticketNo);
							} else {
								logger.error('Failed to send rating request SMS:', smsResult.error);
							}
						} catch (smsError) {
							logger.error('Error sending rating request SMS:', smsError);
						}
					})();
				} else if (body.ticketStatus === TICKET_STATUS.SERVED && updated.phoneNumber && !feedbackUrl) {
					logger.warn(
						isCustomFeedbackLink()
							? 'FEEDBACK_URL not configured, skipping SMS rating request'
							: 'FEEDBACK_URL/APP_URL not configured, skipping SMS rating request'
					);
				}
				return sendJson(res, { success: true, data: serializeBankticket(updated), ratingSmsDeferred });
			}

			// Field-only updates (justify / multi-tx / queue) without status change — match Next
			const patch: Record<string, unknown> = { updatedAt: eatNow() };
			if (body.queueId !== undefined) patch.queueId = body.queueId;
			if (body.subItemId !== undefined) patch.subItemId = body.subItemId;
			if (body.subSubItemId !== undefined) patch.subSubItemId = body.subSubItemId;
			if (body.issueDescription !== undefined) patch.issueDescription = body.issueDescription;
			if (body.justifyReason !== undefined) patch.justifyReason = body.justifyReason;
			if (body.multipleTransactions !== undefined) {
				patch.multipleTransactions = body.multipleTransactions
					? JSON.stringify(body.multipleTransactions)
					: null;
			}
			if (Object.keys(patch).length <= 1) {
				return sendJson(res, { success: false, error: 'No supported update fields' }, 400);
			}
			await db.update(banktickets).set(patch).where(eq(banktickets.id, ticket.id));
			const [updated] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, ticket.id));
			return sendJson(res, { success: true, data: serializeBankticket(updated) });
		})
	);

	app.get(
		'/api/bank/ticket-announcements',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const ticketId = String(req.query['ticketId'] || '');
			const branchId = String(req.query['branchId'] || '');
			const status = String(req.query['status'] || '');
			const ticketStatus = String(req.query['ticketStatus'] || '');
			const clauses = [];
			if (ticketId) clauses.push(eq(ticketAnnouncements.ticketId, ticketId));
			if (branchId) clauses.push(eq(ticketAnnouncements.branchId, branchId));
			if (status) clauses.push(eq(ticketAnnouncements.status, status));
			if (ticketStatus) clauses.push(eq(ticketAnnouncements.ticketStatus, ticketStatus));
			const where = clauses.length ? and(...clauses) : undefined;
			const [{ value: total }] = await db
				.select({ value: count() })
				.from(ticketAnnouncements)
				.where(where);
			const rows = await db
				.select()
				.from(ticketAnnouncements)
				.where(where)
				.orderBy(desc(ticketAnnouncements.queuedAt));
			sendJson(res, { data: rows, total: Number(total ?? 0) });
		})
	);

	app.post(
		'/api/bank/ticket-announcements',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			const now = eatNow();
			const id = uuidV7();
			await db.insert(ticketAnnouncements).values({
				id,
				ticketId: body.ticketId,
				ticketNo: body.ticketNo,
				branchId: body.branchId,
				counterId: body.counterId ?? null,
				counterNumber: body.counterNumber ?? null,
				announcementType: body.announcementType || 'initial',
				language: body.language || 'English',
				attemptNumber: body.attemptNumber ?? 1,
				status: 'queued',
				ticketStatus: body.ticketStatus || TICKET_STATUS.SERVING,
				callAgain: Boolean(body.callAgain),
				previousStatus: body.previousStatus ?? null,
				hallDisplayId: body.hallDisplayId ?? null,
				queuedAt: now,
				createdAt: now,
				updatedAt: now
			});
			const [row] = await db.select().top(1).from(ticketAnnouncements).where(eq(ticketAnnouncements.id, id));
			sendJson(res, { success: true, data: row }, 201);
		})
	);

	app.get(
		'/api/bank/ticket-announcements/:id',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const [row] = await db
				.select()
				.top(1)
				.from(ticketAnnouncements)
				.where(eq(ticketAnnouncements.id, p(req, 'id')));
			if (!row) return sendJson(res, { error: 'Not found' }, 404);
			sendJson(res, row);
		})
	);

	app.put(
		'/api/bank/ticket-announcements/:id',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			await db
				.update(ticketAnnouncements)
				.set({
					status: body.status,
					playStartedAt: body.playStartedAt ? new Date(body.playStartedAt) : undefined,
					playCompletedAt: body.playCompletedAt ? new Date(body.playCompletedAt) : undefined,
					errorMessage: body.errorMessage,
					audioFiles: body.audioFiles ? JSON.stringify(body.audioFiles) : undefined,
					duration: body.duration,
					updatedAt: eatNow()
				})
				.where(eq(ticketAnnouncements.id, p(req, 'id')));
			const [row] = await db
				.select()
				.top(1)
				.from(ticketAnnouncements)
				.where(eq(ticketAnnouncements.id, p(req, 'id')));
			sendJson(res, row);
		})
	);

	app.get(
		'/api/bank/serving/reports',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const userId = auth.session.userId!;
			const sessionCounterId = auth.session.counterId ?? null;

			const dateParam = String(req.query['date'] || '').trim();
			let date = eatCalendarDate();
			let dayStart: Date;
			let dayEnd: Date;
			if (dateParam) {
				try {
					const range = eatDayRangeForDate(dateParam);
					date = dateParam;
					dayStart = range.today;
					dayEnd = range.tomorrow;
				} catch {
					return sendJson(res, { error: 'Invalid date. Use YYYY-MM-DD.' }, 400);
				}
			} else {
				const range = todayRange();
				dayStart = range.today;
				dayEnd = range.tomorrow;
			}

			const now = eatNow();
			const services = await db
				.select()
				.from(ticketServices)
				.where(
					and(
						eq(ticketServices.userId, userId),
						gte(ticketServices.startedAt, dayStart),
						lt(ticketServices.startedAt, dayEnd),
						inArray(ticketServices.ticketStatus, [
							TICKET_STATUS.SERVING,
							TICKET_STATUS.HOLD,
							TICKET_STATUS.REDIRECTED
						])
					)
				)
				.orderBy(asc(ticketServices.startedAt));

			type Group = {
				ticketId: string;
				ticketNo: string;
				phoneNumber: string | null;
				issueDescription: string;
				waitingTime: number;
				servingTime: number;
				holdTime: number;
				lastStartedAt: Date;
				lastEndedAt: Date | null;
				lastStatus: string;
				lastEndReason: string | null;
				skip: boolean;
			};

			const groups = new Map<string, Group>();
			const counterCounts = new Map<number, number>();

			const resolveAction = (
				lastStatus: string,
				lastEndReason: string | null
			): 'served' | 'held' | 'redirected' | 'no_show' => {
				if (
					lastEndReason === SERVICE_END_REASON.NO_SHOW ||
					lastStatus === TICKET_STATUS.NO_SHOW
				) {
					return 'no_show';
				}
				if (lastStatus === TICKET_STATUS.HOLD) return 'held';
				if (
					lastStatus === TICKET_STATUS.REDIRECTED ||
					lastEndReason === SERVICE_END_REASON.REDIRECTED
				) {
					return 'redirected';
				}
				return 'served';
			};

			const segmentDuration = (
				startedAt: Date,
				endedAt: Date | null,
				storedDuration: number
			) => {
				if (endedAt) return storedDuration;
				return calculateDurationInSeconds(startedAt, now);
			};

			for (const service of services) {
				const [ticket] = await db
					.select()
					.top(1)
					.from(banktickets)
					.where(eq(banktickets.id, service.ticketId));
				if (!ticket) continue;

				const isCurrentServing =
					ticket.ticketStatus === TICKET_STATUS.SERVING &&
					Boolean(sessionCounterId) &&
					ticket.counterId === sessionCounterId;

				const [counter] = service.counterId
					? await db.select().top(1).from(counters).where(eq(counters.id, service.counterId))
					: [null];
				if (typeof counter?.counterNumber === 'number') {
					counterCounts.set(
						counter.counterNumber,
						(counterCounts.get(counter.counterNumber) ?? 0) + 1
					);
				}

				let group = groups.get(ticket.id);
				if (!group) {
					group = {
						ticketId: ticket.id,
						ticketNo: ticket.ticketNo,
						phoneNumber: ticket.phoneNumber,
						issueDescription: ticket.issueDescription,
						waitingTime: ticket.notServedDuration ?? 0,
						servingTime: 0,
						holdTime: 0,
						lastStartedAt: service.startedAt,
						lastEndedAt: service.endedAt,
						lastStatus: service.ticketStatus,
						lastEndReason: service.endReason,
						skip: isCurrentServing
					};
					groups.set(ticket.id, group);
				}

				group.skip = isCurrentServing;
				group.lastStartedAt = service.startedAt;
				group.lastEndedAt = service.endedAt;
				group.lastStatus = service.ticketStatus;
				group.lastEndReason = service.endReason;

				const duration = segmentDuration(
					service.startedAt,
					service.endedAt,
					service.duration ?? 0
				);
				if (service.ticketStatus === TICKET_STATUS.SERVING) {
					group.servingTime += duration;
				} else if (service.ticketStatus === TICKET_STATUS.HOLD) {
					group.holdTime += duration;
				}
			}

			const tickets = Array.from(groups.values())
				.filter((group) => !group.skip)
				.map((group) => {
					const actionAt = group.lastEndedAt ?? group.lastStartedAt;
					return {
						ticketId: group.ticketId,
						ticketNo: group.ticketNo,
						phoneNumber: group.phoneNumber,
						issueDescription: group.issueDescription,
						waitingTime: group.waitingTime,
						servingTime: group.servingTime,
						holdTime: group.holdTime,
						action: resolveAction(group.lastStatus, group.lastEndReason),
						actionAt: actionAt.toISOString()
					};
				})
				.sort(
					(a, b) => new Date(b.actionAt).getTime() - new Date(a.actionAt).getTime()
				);

			const totalTickets = tickets.length;
			let sumWaiting = 0;
			let sumServing = 0;
			let sumHold = 0;
			const actionCounts = { served: 0, held: 0, redirected: 0, no_show: 0 };
			for (const ticket of tickets) {
				sumWaiting += ticket.waitingTime;
				sumServing += ticket.servingTime;
				sumHold += ticket.holdTime;
				actionCounts[ticket.action] += 1;
			}

			let counterNumber: number | null = null;
			let maxCount = 0;
			for (const [number, countVal] of counterCounts) {
				if (countVal > maxCount) {
					maxCount = countVal;
					counterNumber = number;
				}
			}

			sendJson(res, {
				date,
				counterNumber,
				stats: {
					totalTickets,
					averageWaitingTime:
						totalTickets > 0 ? Math.round(sumWaiting / totalTickets) : 0,
					averageServingTime:
						totalTickets > 0 ? Math.round(sumServing / totalTickets) : 0,
					averageHoldTime: totalTickets > 0 ? Math.round(sumHold / totalTickets) : 0
				},
				actionCounts,
				tickets
			});
		})
	);
}

function registerOrgRoutes(app: Express): void {
	app.get(
		'/api/bank/settings',
		wrap(async (_req, res) => {
			const [settings] = await db
				.select({
					id: bankSettings.id,
					companyType: bankSettings.companyType,
					companyName: bankSettings.companyName,
					email: bankSettings.email,
					contact: bankSettings.contact,
					address: bankSettings.address,
					timezone: bankSettings.timezone,
					defaultLanguage: bankSettings.defaultLanguage,
					notificationText: bankSettings.notificationText,
					logoImage: bankSettings.logoImage,
					createdAt: bankSettings.createdAt,
					updatedAt: bankSettings.updatedAt
				})
				.top(1)
				.from(bankSettings);
			sendJson(res, settings ?? null);
		})
	);

	app.post(
		'/api/bank/settings',
		wrap(async (req, res) => {
			const [existing] = await db.select({ id: bankSettings.id }).top(1).from(bankSettings);
			if (existing) {
				const auth = await requireAuth();
				if (auth.error) return sendAuthError(res, auth.error);
			}
			const body = req.body ?? {};
			const now = eatNow();
			const password = body.password ? await hashPassword(String(body.password), false) : '';
			if (!existing) {
				await db.insert(bankSettings).values({
					id: uuidV7(),
					companyType: String(body.companyType ?? ''),
					companyName: String(body.companyName ?? ''),
					email: String(body.email ?? ''),
					contact: String(body.contact ?? ''),
					address: String(body.address ?? ''),
					timezone: String(body.timezone ?? 'Africa/Kampala'),
					defaultLanguage: body.defaultLanguage || null,
					notificationText: String(body.notificationText ?? ''),
					logoImage: body.logoImage || null,
					password,
					createdAt: now,
					updatedAt: now
				});
			} else {
				await db
					.update(bankSettings)
					.set({
						companyType: body.companyType,
						companyName: body.companyName,
						email: body.email,
						contact: body.contact,
						address: body.address,
						timezone: body.timezone,
						defaultLanguage: body.defaultLanguage,
						notificationText: body.notificationText,
						...(password ? { password } : {}),
						updatedAt: now
					})
					.where(eq(bankSettings.id, existing.id));
			}
			sendJson(res, { success: true });
		})
	);

	app.post(
		'/api/bank/settings/images',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const filename = path.basename(String(req.body?.filename || `upload-${Date.now()}`));
			const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '') || `upload-${Date.now()}`;
			const raw = String(req.body?.data || '');
			const buf = Buffer.from(raw.replace(/^data:.*?;base64,/, ''), 'base64');
			if (!buf.length) return sendJson(res, { error: 'Image data is required' }, 400);
			const dir = path.join(process.cwd(), 'uploads');
			await mkdir(dir, { recursive: true });
			await writeFile(path.join(dir, safe), buf);
			sendJson(res, { url: `/api/bank/settings/images/${safe}` });
		})
	);

	app.put('/api/bank/settings', wrap(async (req, res) => {
		const auth = await requireAuth();
		if (auth.error) return sendAuthError(res, auth.error);
		req.url = '/api/bank/settings';
		const [existing] = await db.select({ id: bankSettings.id }).top(1).from(bankSettings);
		if (!existing) return sendJson(res, { error: 'Settings not found' }, 404);
		const body = req.body ?? {};
		const now = eatNow();
		const password = body.password ? await hashPassword(String(body.password), false) : '';
		await db
			.update(bankSettings)
			.set({
				companyType: body.companyType,
				companyName: body.companyName,
				email: body.email,
				contact: body.contact,
				address: body.address,
				timezone: body.timezone,
				defaultLanguage: body.defaultLanguage,
				notificationText: body.notificationText,
				logoImage: body.logoImage,
				...(password ? { password } : {}),
				updatedAt: now
			})
			.where(eq(bankSettings.id, existing.id));
		sendJson(res, { success: true });
	}));

	app.get(
		'/api/bank/branches',
		wrap(async (_req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			sendJson(res, await db.select().from(branches).orderBy(asc(branches.name)));
		})
	);
	app.post(
		'/api/bank/branches',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			const now = eatNow();
			const id = uuidV7();
			await db.insert(branches).values({
				id,
				name: body.name,
				address: body.address ?? '',
				localNetworkAddress: body.localNetworkAddress ?? null,
				databaseHost: body.databaseHost ?? null,
				databaseName: body.databaseName ?? null,
				databaseUser: body.databaseUser ?? null,
				databasePassword: body.databasePassword
					? await hashPassword(body.databasePassword, false)
					: null,
				hallDisplayUsername: body.hallDisplayUsername,
				hallDisplayPassword: body.hallDisplayPassword
					? await hashPassword(body.hallDisplayPassword, false)
					: '',
				kioskUsername: body.kioskUsername ?? null,
				kioskPassword: body.kioskPassword ? await hashPassword(body.kioskPassword, false) : null,
				kioskIpAddress: body.kioskIpAddress ?? null,
				platform: body.platform ?? null,
				status: body.status !== false,
				createdAt: now,
				updatedAt: now
			});
			const [row] = await db.select().top(1).from(branches).where(eq(branches.id, id));
			sendJson(res, row, 201);
		})
	);
	app.get(
		'/api/bank/branches/:id',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const [row] = await db.select().top(1).from(branches).where(eq(branches.id, p(req, 'id')));
			sendJson(res, row ?? null);
		})
	);
	app.put(
		'/api/bank/branches/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = { ...req.body };
			delete body.id;
			delete body.createdAt;
			delete body.updatedAt;
			if (body.databasePassword) body.databasePassword = await hashPassword(body.databasePassword, false);
			else delete body.databasePassword;
			if (body.hallDisplayPassword) body.hallDisplayPassword = await hashPassword(body.hallDisplayPassword, false);
			else delete body.hallDisplayPassword;
			if (body.kioskPassword) body.kioskPassword = await hashPassword(body.kioskPassword, false);
			else delete body.kioskPassword;
			await db.update(branches).set({ ...body, updatedAt: eatNow() }).where(eq(branches.id, p(req, 'id')));
			const [row] = await db.select().top(1).from(branches).where(eq(branches.id, p(req, 'id')));
			sendJson(res, row);
		})
	);
	app.delete(
		'/api/bank/branches/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.delete(branches).where(eq(branches.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/users',
		wrap(async (_req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const rows = await db.select().from(users);
			const roleRows = await db.select({ id: roles.id, name: roles.name }).from(roles);
			const branchRows = await db.select({ id: branches.id, name: branches.name }).from(branches);
			const roleMap = new Map(roleRows.map((r) => [r.id, r]));
			const branchMap = new Map(branchRows.map((b) => [b.id, b]));
			sendJson(
				res,
				rows.map((u) => ({
					...u,
					password: undefined,
					role: u.roleId ? (roleMap.get(u.roleId) ?? null) : null,
					branch: u.branchId ? (branchMap.get(u.branchId) ?? null) : null
				}))
			);
		})
	);
	app.post(
		'/api/bank/users',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			const now = eatNow();
			const id = uuidV7();
			const roleId = body.roleId ?? body.role ?? null;
			const branchId = body.branchId ?? body.branch ?? null;
			const username = String(body.username ?? '');
			const authMethod = process.env['AUTH_METHOD'] || 'database';
			let password: string | null = null;
			if (authMethod === 'database') {
				if (!username) return sendJson(res, { error: 'Username is required' }, 400);
				password = await hashPassword(username, false);
			} else if (body.password) {
				password = await hashPassword(String(body.password), false);
			}
			await db.insert(users).values({
				id,
				firstName: body.firstName ?? null,
				lastName: body.lastName ?? null,
				email: body.email,
				username,
				password,
				roleId,
				branchId,
				status: body.status !== false,
				createdAt: now,
				updatedAt: now
			});
			const [row] = await db.select().top(1).from(users).where(eq(users.id, id));
			sendJson(res, { ...row, password: undefined }, 201);
		})
	);
	app.put(
		'/api/bank/users/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = { ...req.body };
			delete body.id;
			delete body.createdAt;
			delete body.updatedAt;
			delete body.role;
			delete body.branch;
			delete body.activeSessionToken;
			delete body.lastSessionAt;
			if (body.roleId === undefined && req.body?.role !== undefined) body.roleId = req.body.role;
			if (body.branchId === undefined && req.body?.branch !== undefined) body.branchId = req.body.branch;
			const authMethod = process.env['AUTH_METHOD'] || 'database';
			if (authMethod === 'database') {
				const username =
					body.username !== undefined
						? String(body.username)
						: (
								await db
									.select({ username: users.username })
									.top(1)
									.from(users)
									.where(eq(users.id, p(req, 'id')))
							)[0]?.username;
				if (!username) return sendJson(res, { error: 'Username is required' }, 400);
				body.password = await hashPassword(username, false);
				if (body.username !== undefined) body.username = username;
			} else if (body.password) {
				body.password = await hashPassword(body.password, false);
			} else {
				delete body.password;
			}
			await db.update(users).set({ ...body, updatedAt: eatNow() }).where(eq(users.id, p(req, 'id')));
			const [row] = await db.select().top(1).from(users).where(eq(users.id, p(req, 'id')));
			sendJson(res, { ...row, password: undefined });
		})
	);
	app.delete(
		'/api/bank/users/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.delete(users).where(eq(users.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/roles',
		wrap(async (_req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const rows = await db.select().from(roles);
			sendJson(
				res,
				rows.map((role) => ({
					...role,
					permissions: parsePermissions(role.permissions)
				}))
			);
		})
	);
	app.post(
		'/api/bank/roles',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const now = eatNow();
			const id = uuidV7();
			await db.insert(roles).values({
				id,
				name: req.body.name,
				permissions: typeof req.body.permissions === 'string' ? req.body.permissions : JSON.stringify(req.body.permissions ?? {}),
				createdAt: now,
				updatedAt: now
			});
			const [row] = await db.select().top(1).from(roles).where(eq(roles.id, id));
			sendJson(res, { ...row, permissions: parsePermissions(row?.permissions) }, 201);
		})
	);
	app.put(
		'/api/bank/roles/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db
				.update(roles)
				.set({
					name: req.body.name,
					permissions:
						typeof req.body.permissions === 'string'
							? req.body.permissions
							: JSON.stringify(req.body.permissions ?? {}),
					updatedAt: eatNow()
				})
				.where(eq(roles.id, p(req, 'id')));
			const [row] = await db.select().top(1).from(roles).where(eq(roles.id, p(req, 'id')));
			sendJson(res, { ...row, permissions: parsePermissions(row?.permissions) });
		})
	);
	app.delete(
		'/api/bank/roles/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.delete(roles).where(eq(roles.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/queues',
		wrap(async (_req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const branchId = queueListBranchId(auth);
			sendJson(res, await listQueuesNested(branchId));
		})
	);
	app.post(
		'/api/bank/queues',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			const menuItem = body.menuItem;
			const name = body.name || menuItem?.name;
			if (!name || typeof name !== 'string') {
				return sendJson(res, { success: false, error: "Invalid or missing 'menuItem' or 'subMenuItems'" }, 400);
			}
			const branchError = await requireQueueBranches(body.branchIds);
			if (branchError) return sendJson(res, { success: false, error: branchError }, 400);
			const items = Array.isArray(menuItem?.subMenuItems)
				? menuItem.subMenuItems
				: Array.isArray(body.subMenuItems)
					? body.subMenuItems
					: [];
			const now = eatNow();
			const id = uuidV7();
			await db.insert(queues).values({
				id,
				name,
				status: body.status ?? 1,
				createdAt: now,
				updatedAt: now
			});
			for (const sub of items) {
				if (!sub?.name) continue;
				const subId = uuidV7();
				await db.insert(subMenuItems).values({
					id: subId,
					queueId: id,
					name: sub.name,
					priority: Boolean(sub.priority) && !(sub.subSubMenuItems?.length > 0),
					createdAt: now,
					updatedAt: now
				});
				for (const subSub of sub.subSubMenuItems ?? []) {
					if (!subSub?.name) continue;
					await db.insert(subSubMenuItems).values({
						id: uuidV7(),
						subMenuItemId: subId,
						name: subSub.name,
						priority: Boolean(subSub.priority),
						createdAt: now,
						updatedAt: now
					});
				}
			}
			const createdBranches = parseQueueBranchIds(body.branchIds);
			if (createdBranches.ok) await replaceQueueBranches(id, createdBranches.ids);
			const nested = await listQueuesNested();
			sendJson(res, nested.find((q) => q.id === id) ?? { id }, 201);
		})
	);
	app.put(
		'/api/bank/queues/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			if (body.branchIds !== undefined) {
				const branchError = await requireQueueBranches(body.branchIds);
				if (branchError) return sendJson(res, { success: false, error: branchError }, 400);
			}
			const name = body.name || body.menuItem?.name;
			const patch: Record<string, unknown> = { updatedAt: eatNow() };
			if (name) patch['name'] = name;
			if (body.status !== undefined && body.status !== null) patch['status'] = body.status;
			await db.update(queues).set(patch).where(eq(queues.id, p(req, 'id')));
			if (Array.isArray(body.subMenuItems) || Array.isArray(body.menuItem?.subMenuItems)) {
				const items = body.subMenuItems || body.menuItem.subMenuItems;
				const existingSubs = await db
					.select({ id: subMenuItems.id })
					.from(subMenuItems)
					.where(eq(subMenuItems.queueId, p(req, 'id')));
				for (const sub of existingSubs) {
					await db.delete(subSubMenuItems).where(eq(subSubMenuItems.subMenuItemId, sub.id));
				}
				await db.delete(subMenuItems).where(eq(subMenuItems.queueId, p(req, 'id')));
				for (const sub of items) {
					if (!sub?.name) continue;
					const subId = sub.id && UUID_RE.test(sub.id) ? sub.id : uuidV7();
					const now = eatNow();
					const hasChildren = Array.isArray(sub.subSubMenuItems) && sub.subSubMenuItems.length > 0;
					await db.insert(subMenuItems).values({
						id: subId,
						queueId: p(req, 'id'),
						name: sub.name,
						priority: Boolean(sub.priority) && !hasChildren,
						createdAt: now,
						updatedAt: now
					});
					for (const subSub of sub.subSubMenuItems ?? []) {
						if (!subSub?.name) continue;
						await db.insert(subSubMenuItems).values({
							id: uuidV7(),
							subMenuItemId: subId,
							name: subSub.name,
							priority: Boolean(subSub.priority),
							createdAt: now,
							updatedAt: now
						});
					}
				}
			}
			if (body.branchIds !== undefined) {
				const updatedBranches = parseQueueBranchIds(body.branchIds);
				if (updatedBranches.ok) await replaceQueueBranches(p(req, 'id'), updatedBranches.ids);
			}
			sendJson(res, { success: true });
		})
	);
	app.delete(
		'/api/bank/queues/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await deleteQueueBranches(p(req, 'id'));
			const existingSubs = await db
				.select({ id: subMenuItems.id })
				.from(subMenuItems)
				.where(eq(subMenuItems.queueId, p(req, 'id')));
			for (const sub of existingSubs) {
				await db.delete(subSubMenuItems).where(eq(subSubMenuItems.subMenuItemId, sub.id));
			}
			await db.delete(subMenuItems).where(eq(subMenuItems.queueId, p(req, 'id')));
			await db.delete(queues).where(eq(queues.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/counters',
		wrap(async (_req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const session = auth.session;
			const admin = isDashboardAdmin(session);
			if (!admin && !session.branchId) {
				return sendJson(res, { error: 'Unauthorized' }, 401);
			}

			const rows = await db
				.select({
					id: counters.id,
					counterNumber: counters.counterNumber,
					available: counters.available,
					createdAt: counters.createdAt,
					userId: counters.userId,
					queueId: counters.queueId,
					branchId: counters.branchId
				})
				.from(counters)
				.where(admin ? undefined : eq(counters.branchId, session.branchId!))
				.orderBy(desc(counters.createdAt));

			const counterIds = rows.map((r) => r.id);
			const ticketIdsByCounter = new Map<string, Set<string>>();
			const addTicket = (counterId: string | null | undefined, ticketId: string) => {
				if (!counterId) return;
				const set = ticketIdsByCounter.get(counterId) ?? new Set<string>();
				set.add(ticketId);
				ticketIdsByCounter.set(counterId, set);
			};

			if (counterIds.length > 0) {
				const [serviceRows, assignedTickets] = await Promise.all([
					db
						.select({ counterId: ticketServices.counterId, ticketId: ticketServices.ticketId })
						.from(ticketServices)
						.where(inArray(ticketServices.counterId, counterIds)),
					db
						.select({ counterId: banktickets.counterId, id: banktickets.id })
						.from(banktickets)
						.where(inArray(banktickets.counterId, counterIds))
				]);
				for (const row of serviceRows) addTicket(row.counterId, row.ticketId);
				for (const ticket of assignedTickets) addTicket(ticket.counterId, ticket.id);
			}

			const result = [];
			for (const row of rows) {
				const [user] = row.userId
					? await db
							.select({
								id: users.id,
								username: users.username,
								firstName: users.firstName,
								lastName: users.lastName
							})
							.top(1)
							.from(users)
							.where(eq(users.id, row.userId))
					: [null];
				const [queue] = row.queueId
					? await db
							.select({ id: queues.id, name: queues.name })
							.top(1)
							.from(queues)
							.where(eq(queues.id, row.queueId))
					: [null];
				const [branch] = row.branchId
					? await db
							.select({ id: branches.id, name: branches.name })
							.top(1)
							.from(branches)
							.where(eq(branches.id, row.branchId))
					: [null];
				result.push({
					id: row.id,
					counterNumber: row.counterNumber,
					available: row.available,
					createdAt: row.createdAt,
					ticketCount: ticketIdsByCounter.get(row.id)?.size ?? 0,
					user: user ?? null,
					queue: queue ?? null,
					branch: branch ?? null
				});
			}

			sendJson(res, { counters: result });
		})
	);

	app.get(
		'/api/bank/counter',
		wrap(async (_req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const { today, tomorrow } = todayRange();
			const [row] = await db
				.select()
				.top(1)
				.from(counters)
				.where(
					and(
						eq(counters.userId, auth.session.userId!),
						gte(counters.createdAt, today),
						lt(counters.createdAt, tomorrow)
					)
				);
			if (!row) return sendJson(res, null);
			const [queue] = row.queueId
				? await db
						.select({ id: queues.id, name: queues.name })
						.top(1)
						.from(queues)
						.where(eq(queues.id, row.queueId))
				: [null];
			const averages = await getCounterDurationAverages(row.id);
			sendJson(res, {
				...row,
				queue: queue
					? { id: queue.id, name: queue.name }
					: { id: row.queueId, name: 'Queue' },
				averageServingTime: formatAverageClock(averages.averageServingSeconds),
				averageServingSeconds: averages.averageServingSeconds
			});
		})
	);

	app.post(
		'/api/bank/counter',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			const counterNumber = Number(body.counterNumber);
			const branchId = String(body.branchId || auth.session.branchId || '');
			if (!Number.isFinite(counterNumber) || !branchId) {
				return sendJson(res, { error: 'Counter number and branch are required' }, 400);
			}
			const { today, tomorrow } = todayRange();
			const [existing] = await db
				.select({ id: counters.id })
				.top(1)
				.from(counters)
				.where(
					and(
						eq(counters.branchId, branchId),
						eq(counters.counterNumber, counterNumber),
						gte(counters.createdAt, today),
						lt(counters.createdAt, tomorrow)
					)
				);
			if (existing) {
				return sendJson(res, { error: `Counter ${counterNumber} is already taken today` }, 400);
			}
			const now = eatNow();
			const id = uuidV7();
			await db.insert(counters).values({
				id,
				userId: auth.session.userId!,
				counterNumber,
				queueId: body.queueId,
				subItemId: body.subItemId ?? null,
				subSubItemId: body.subSubItemId ?? null,
				branchId,
				available: true,
				createdAt: now,
				updatedAt: now
			});
			await recordCounterAvailabilityEvent(id, COUNTER_AVAILABILITY_EVENT.AVAILABLE);
			const { patchSession } = await import('../session');
			await patchSession({ counterId: id });
			const [row] = await db.select().top(1).from(counters).where(eq(counters.id, id));
			sendJson(res, row, 201);
		})
	);

	app.put(
		'/api/bank/counter',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const counterId = auth.session.counterId;
			if (!counterId) return sendJson(res, { error: 'No counter' }, 400);
			const body = req.body ?? {};
			const patch: Record<string, unknown> = { updatedAt: eatNow() };
			let beforeCounter: typeof counters.$inferSelect | undefined;
			let pauseReason: string | null = null;

			if (typeof body.available === 'boolean') {
				const [current] = await db
					.select()
					.top(1)
					.from(counters)
					.where(eq(counters.id, counterId));
				if (!current) return sendJson(res, { error: 'No counter' }, 400);
				beforeCounter = current;
				if (body.available) {
					patch.available = true;
					patch.unavailableReason = null;
				} else {
					if (!isUnavailableReason(body.unavailableReason)) {
						return sendJson(res, { error: 'Select a reason for going unavailable' }, 400);
					}
					pauseReason = body.unavailableReason;
					patch.available = false;
					patch.unavailableReason = pauseReason;
				}
			}
			if (body.queueId) patch.queueId = String(body.queueId);
			if (body.counterNumber != null && body.counterNumber !== '') {
				const counterNumber = Number(body.counterNumber);
				if (!Number.isFinite(counterNumber)) {
					return sendJson(res, { error: 'Invalid counter number' }, 400);
				}
				const [current] = await db
					.select({ branchId: counters.branchId })
					.top(1)
					.from(counters)
					.where(eq(counters.id, counterId));
				const branchId = current?.branchId || auth.session.branchId || '';
				if (branchId) {
					const { today, tomorrow } = todayRange();
					const [taken] = await db
						.select({ id: counters.id })
						.top(1)
						.from(counters)
						.where(
							and(
								eq(counters.branchId, branchId),
								eq(counters.counterNumber, counterNumber),
								gte(counters.createdAt, today),
								lt(counters.createdAt, tomorrow),
								ne(counters.id, counterId)
							)
						);
					if (taken) {
						return sendJson(
							res,
							{ error: `Counter ${counterNumber} is already taken today` },
							400
						);
					}
				}
				patch.counterNumber = counterNumber;
			}
			if (body.subItemId !== undefined) patch.subItemId = body.subItemId || null;
			if (body.subSubItemId !== undefined) patch.subSubItemId = body.subSubItemId || null;

			await db.update(counters).set(patch).where(eq(counters.id, counterId));
			const [row] = await db.select().top(1).from(counters).where(eq(counters.id, counterId));

			if (typeof body.available === 'boolean') {
				await recordCounterAvailabilityEvent(
					counterId,
					body.available
						? COUNTER_AVAILABILITY_EVENT.AVAILABLE
						: COUNTER_AVAILABILITY_EVENT.PAUSED,
					body.available ? null : pauseReason
				);
			}

			const availabilityToggled =
				typeof body.available === 'boolean' &&
				beforeCounter != null &&
				body.available !== beforeCounter.available;
			if (availabilityToggled && auth.session.actorType === 'serving') {
				await recordActivity({
					action: body.available
						? AUDIT_ACTION.SERVING_AVAILABLE
						: AUDIT_ACTION.SERVING_PAUSED,
					collectionName: 'Counter',
					operation: body.available ? 'available' : 'paused',
					documentId: counterId,
					userId: auth.session.userId,
					performedBy: auth.session.userId,
					counterId,
					description: body.available
						? `Went available at counter ${row?.counterNumber ?? counterId}`
						: `Paused counter ${row?.counterNumber ?? counterId} (${pauseReason})`,
					before: beforeCounter,
					after: row,
					metadata: { branchId: auth.session.branchId }
				});
			}

			sendJson(res, row);
		})
	);

	app.get(
		'/api/bank/counter/available',
		wrap(async (req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			const branchId = String(req.query['branchId'] || '');
			const { today, tomorrow } = todayRange();
			const rows = await db
				.select()
				.from(counters)
				.where(
					and(
						eq(counters.available, true),
						gte(counters.createdAt, today),
						lt(counters.createdAt, tomorrow),
						...(branchId ? [eq(counters.branchId, branchId)] : [])
					)
				);
			const result = [];
			for (const row of rows) {
				const [queue] = row.queueId
					? await db
							.select({ name: queues.name })
							.top(1)
							.from(queues)
							.where(eq(queues.id, row.queueId))
					: [null];
				result.push({
					id: row.id,
					number: row.counterNumber,
					queueName: queue?.name || 'Queue',
					available: row.available,
					queueId: row.queueId
				});
			}
			sendJson(res, result);
		})
	);

	app.get(
		'/api/bank/counter/check-availability',
		wrap(async (req, res) => {
			const branchId = String(req.query['branchId'] || '');
			const counterNumberRaw = String(req.query['counterNumber'] || '');
			const excludeCounterId = String(req.query['excludeCounterId'] || '');
			if (!branchId || !counterNumberRaw) {
				return sendJson(res, { error: 'Counter number and branch ID are required' }, 400);
			}
			const counterNumber = Number(counterNumberRaw);
			if (!Number.isFinite(counterNumber)) {
				return sendJson(res, { error: 'Invalid counter number' }, 400);
			}
			const { today, tomorrow } = todayRange();
			const clauses = [
				eq(counters.branchId, branchId),
				eq(counters.counterNumber, counterNumber),
				gte(counters.createdAt, today),
				lt(counters.createdAt, tomorrow),
			];
			if (excludeCounterId) {
				clauses.push(ne(counters.id, excludeCounterId));
			}
			const [existing] = await db
				.select({ id: counters.id })
				.top(1)
				.from(counters)
				.where(and(...clauses));
			const available = !existing;
			sendJson(res, {
				available,
				message: available
					? `Counter ${counterNumber} is available`
					: `Counter ${counterNumber} is already taken today`,
			});
		})
	);

	app.put(
		'/api/bank/counter/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const session = auth.session;
			const admin = isDashboardAdmin(session);
			if (!admin && !session.branchId) {
				return sendJson(res, { error: 'Unauthorized' }, 401);
			}

			const id = p(req, 'id');
			const [counter] = await db.select().top(1).from(counters).where(eq(counters.id, id));
			if (!counter) return sendJson(res, { error: 'Counter not found' }, 404);
			if (!admin && counter.branchId !== session.branchId) {
				return sendJson(res, { error: 'Unauthorized' }, 401);
			}

			const body = req.body ?? {};
			const nextCounterNumber =
				body.counterNumber !== undefined && body.counterNumber !== null
					? Number(body.counterNumber)
					: undefined;

			if (
				nextCounterNumber !== undefined &&
				nextCounterNumber !== counter.counterNumber
			) {
				if (!Number.isFinite(nextCounterNumber) || nextCounterNumber < 1) {
					return sendJson(res, { error: 'Enter a valid counter number' }, 400);
				}
				const { today, tomorrow } = todayRange();
				const [existing] = await db
					.select({ id: counters.id })
					.top(1)
					.from(counters)
					.where(
						and(
							eq(counters.branchId, counter.branchId),
							eq(counters.counterNumber, nextCounterNumber),
							gte(counters.createdAt, today),
							lt(counters.createdAt, tomorrow),
							ne(counters.id, id)
						)
					);
				if (existing) {
					return sendJson(res, { error: 'Counter number is already in use' }, 400);
				}
			}

			const patch: Record<string, unknown> = { updatedAt: eatNow() };
			let pauseReason: string | null = null;
			if (typeof body.available === 'boolean') {
				patch.available = body.available;
				if (body.available) {
					patch.unavailableReason = null;
				} else if (isUnavailableReason(body.unavailableReason)) {
					pauseReason = body.unavailableReason;
					patch.unavailableReason = pauseReason;
				}
			}
			if (body.queueId) patch.queueId = String(body.queueId);
			if (nextCounterNumber !== undefined) patch.counterNumber = nextCounterNumber;
			if (body.subItemId !== undefined) patch.subItemId = body.subItemId || null;
			if (body.subSubItemId !== undefined) patch.subSubItemId = body.subSubItemId || null;

			await db.update(counters).set(patch).where(eq(counters.id, id));
			const [updated] = await db.select().top(1).from(counters).where(eq(counters.id, id));

			if (typeof body.available === 'boolean' && body.available !== counter.available) {
				await recordCounterAvailabilityEvent(
					id,
					body.available
						? COUNTER_AVAILABILITY_EVENT.AVAILABLE
						: COUNTER_AVAILABILITY_EVENT.PAUSED,
					body.available ? null : pauseReason
				);
			}

			const availabilityToggled =
				typeof body.available === 'boolean' && body.available !== counter.available;

			if (availabilityToggled && session.actorType === 'serving') {
				await recordActivity({
					action: body.available
						? AUDIT_ACTION.SERVING_AVAILABLE
						: AUDIT_ACTION.SERVING_PAUSED,
					collectionName: 'Counter',
					operation: body.available ? 'available' : 'paused',
					documentId: id,
					userId: session.userId,
					performedBy: session.userId,
					counterId: id,
					description: body.available
						? `Went available at counter ${updated?.counterNumber ?? id}`
						: pauseReason
							? `Paused counter ${updated?.counterNumber ?? id} (${pauseReason})`
							: `Paused counter ${updated?.counterNumber ?? id}`,
					before: counter,
					after: updated,
					metadata: { branchId: session.branchId }
				});
			} else {
				await createAuditLog({
					collectionName: 'Counter',
					operation: 'update',
					documentId: id,
					userId: session.userId,
					performedBy: session.userId,
					counterId: id,
					description: `Updated counter ${updated?.counterNumber ?? id}`,
					before: counter,
					after: updated,
					metadata: { branchId: session.branchId }
				});
			}

			sendJson(res, { success: true, message: 'Counter updated successfully' });
		})
	);

	app.get(
		'/api/bank/exchange-rates',
		wrap(async (_req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			sendJson(res, await db.select().from(exchangeRates).orderBy(asc(exchangeRates.displayOrder)));
		})
	);
	app.post(
		'/api/bank/exchange-rates',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = req.body ?? {};
			if (body.countryCode) {
				const [existing] = await db
					.select({ id: exchangeRates.id })
					.top(1)
					.from(exchangeRates)
					.where(eq(exchangeRates.countryCode, String(body.countryCode)));
				if (existing) {
					return sendJson(
						res,
						{
							error: 'DUPLICATE_COUNTRY',
							message:
								'An exchange rate for this country already exists. Each country can only have one exchange rate entry.'
						},
						409
					);
				}
			}
			const now = eatNow();
			const id = uuidV7();
			const maxOrder = await db
				.select({ displayOrder: exchangeRates.displayOrder })
				.from(exchangeRates)
				.orderBy(asc(exchangeRates.displayOrder));
			const displayOrder =
				typeof body.displayOrder === 'number'
					? body.displayOrder
					: maxOrder.length
						? (maxOrder[maxOrder.length - 1]?.displayOrder ?? 0) + 1
						: 0;
			await db.insert(exchangeRates).values({
				id,
				countryName: body.countryName,
				countryCode: body.countryCode,
				currencyCode: body.currencyCode,
				buyingRate: Number(body.buyingRate),
				sellingRate: Number(body.sellingRate),
				displayOrder,
				createdAt: now,
				updatedAt: now
			});
			const [row] = await db.select().top(1).from(exchangeRates).where(eq(exchangeRates.id, id));
			sendJson(res, row, 201);
		})
	);
	app.put(
		'/api/bank/exchange-rates/reorder',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const ids: string[] =
				req.body?.ids ??
				(Array.isArray(req.body?.rates) ? req.body.rates.map((r: { id: string }) => r.id) : []);
			for (let i = 0; i < ids.length; i++) {
				await db
					.update(exchangeRates)
					.set({ displayOrder: i, updatedAt: eatNow() })
					.where(eq(exchangeRates.id, ids[i]));
			}
			sendJson(res, { success: true });
		})
	);
	app.put(
		'/api/bank/exchange-rates/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const body = { ...req.body };
			delete body.id;
			delete body.createdAt;
			delete body.updatedAt;
			if (body.countryCode) {
				const [existing] = await db
					.select({ id: exchangeRates.id })
					.top(1)
					.from(exchangeRates)
					.where(eq(exchangeRates.countryCode, String(body.countryCode)));
				if (existing && existing.id !== p(req, 'id')) {
					return sendJson(
						res,
						{
							error: 'DUPLICATE_COUNTRY',
							message:
								'An exchange rate for this country already exists. Each country can only have one exchange rate entry.'
						},
						409
					);
				}
			}
			if (body.buyingRate !== undefined) body.buyingRate = Number(body.buyingRate);
			if (body.sellingRate !== undefined) body.sellingRate = Number(body.sellingRate);
			await db.update(exchangeRates).set({ ...body, updatedAt: eatNow() }).where(eq(exchangeRates.id, p(req, 'id')));
			const [row] = await db.select().top(1).from(exchangeRates).where(eq(exchangeRates.id, p(req, 'id')));
			sendJson(res, row);
		})
	);
	app.delete(
		'/api/bank/exchange-rates/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.delete(exchangeRates).where(eq(exchangeRates.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);

	registerAdsRoutes(app);

	app.get(
		'/api/bank/announcements',
		wrap(async (_req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			sendJson(res, await db.select().from(announcements));
		})
	);
	app.post(
		'/api/bank/announcements',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const id = uuidV7();
			await db.insert(announcements).values({
				id,
				text: req.body.text,
				type: req.body.type ?? null,
				isActive: req.body.isActive !== false,
				createdAt: eatNow()
			});
			const [row] = await db.select().top(1).from(announcements).where(eq(announcements.id, id));
			sendJson(res, row, 201);
		})
	);
	app.put(
		'/api/bank/announcements/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.update(announcements).set(req.body).where(eq(announcements.id, p(req, 'id')));
			const [row] = await db.select().top(1).from(announcements).where(eq(announcements.id, p(req, 'id')));
			sendJson(res, row);
		})
	);
	app.delete(
		'/api/bank/announcements/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.delete(announcements).where(eq(announcements.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/announcement-types',
		wrap(async (_req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			sendJson(res, await db.select().from(announcementTypes));
		})
	);
	app.post(
		'/api/bank/announcement-types',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const id = uuidV7();
			await db.insert(announcementTypes).values({
				id,
				name: req.body.name,
				backgroundColor: req.body.backgroundColor,
				textColor: req.body.textColor,
				createdAt: eatNow()
			});
			const [row] = await db.select().top(1).from(announcementTypes).where(eq(announcementTypes.id, id));
			sendJson(res, row, 201);
		})
	);
	app.put(
		'/api/bank/announcement-types/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.update(announcementTypes).set(req.body).where(eq(announcementTypes.id, p(req, 'id')));
			const [row] = await db.select().top(1).from(announcementTypes).where(eq(announcementTypes.id, p(req, 'id')));
			sendJson(res, row);
		})
	);
	app.delete(
		'/api/bank/announcement-types/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.delete(announcementTypes).where(eq(announcementTypes.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/social-media',
		wrap(async (_req, res) => {
			const auth = await requireAnySession();
			if (auth.error) return sendAuthError(res, auth.error);
			sendJson(res, await db.select().from(socialMedia));
		})
	);
	app.post(
		'/api/bank/social-media',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const id = uuidV7();
			await db.insert(socialMedia).values({
				id,
				platform: req.body.platform,
				handle: req.body.handle,
				createdAt: eatNow()
			});
			const [row] = await db.select().top(1).from(socialMedia).where(eq(socialMedia.id, id));
			sendJson(res, row, 201);
		})
	);
	app.put(
		'/api/bank/social-media/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.update(socialMedia).set(req.body).where(eq(socialMedia.id, p(req, 'id')));
			const [row] = await db.select().top(1).from(socialMedia).where(eq(socialMedia.id, p(req, 'id')));
			sendJson(res, row);
		})
	);
	app.delete(
		'/api/bank/social-media/:id',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db.delete(socialMedia).where(eq(socialMedia.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/logs',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const userId = String(req.query['userId'] || '');
			const action = String(req.query['action'] || '');
			const startDate = String(req.query['startDate'] || '');
			const endDate = String(req.query['endDate'] || '');
			const page = Math.max(1, Number(req.query['page'] || 1));
			const limit = Math.min(100, Math.max(1, Number(req.query['limit'] || 50)));
			const clauses = [];
			if (userId) clauses.push(eq(logs.userId, userId));
			if (action) clauses.push(like(logs.action, `%${action}%`));
			if (startDate) {
				try {
					clauses.push(gte(logs.createdAt, eatDayRangeForDate(startDate.slice(0, 10)).today));
				} catch {
					/* ignore */
				}
			}
			if (endDate) {
				try {
					clauses.push(lt(logs.createdAt, eatDayRangeForDate(endDate.slice(0, 10)).tomorrow));
				} catch {
					/* ignore */
				}
			}
			const where = clauses.length ? and(...clauses) : undefined;
			const [{ value: total }] = await db.select({ value: count() }).from(logs).where(where);
			const rows = await db
				.select()
				.from(logs)
				.where(where)
				.orderBy(desc(logs.createdAt))
				.offset((page - 1) * limit)
				.fetch(limit);
			const enriched = [];
			for (const row of rows) {
				const [user] = row.userId
					? await db
							.select({
								id: users.id,
								firstName: users.firstName,
								lastName: users.lastName,
								email: users.email,
								username: users.username
							})
							.top(1)
							.from(users)
							.where(eq(users.id, row.userId))
					: [null];
				enriched.push({ ...row, user: user ?? null });
			}
			sendJson(res, {
				logs: enriched,
				pagination: {
					page,
					limit,
					total: Number(total ?? 0),
					totalPages: Math.max(1, Math.ceil(Number(total ?? 0) / limit))
				}
			});
		})
	);
	app.get(
		'/api/bank/audit-logs',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const view = String(req.query['view'] || '');
			const userId = String(req.query['userId'] || '');
			const category = String(req.query['category'] || '');
			const actorType = String(req.query['actorType'] || '');
			const operation = String(req.query['operation'] || '');
			const collectionName = String(req.query['collectionName'] || '');
			const action = String(req.query['action'] || '');
			const startDate = String(req.query['startDate'] || '');
			const endDate = String(req.query['endDate'] || '');
			const day = String(req.query['day'] || '');
			const page = Math.max(1, Number(req.query['page'] || 1));
			const limit = Math.min(500, Math.max(1, Number(req.query['limit'] || 50)));

			const dateClauses = [];
			if (day) {
				try {
					const range = eatDayRangeForDate(day.slice(0, 10));
					dateClauses.push(gte(auditLogs.createdAt, range.today));
					dateClauses.push(lt(auditLogs.createdAt, range.tomorrow));
				} catch {
					/* ignore */
				}
			} else {
				if (startDate) {
					try {
						dateClauses.push(gte(auditLogs.createdAt, eatDayRangeForDate(startDate.slice(0, 10)).today));
					} catch {
						/* ignore */
					}
				}
				if (endDate) {
					try {
						dateClauses.push(lt(auditLogs.createdAt, eatDayRangeForDate(endDate.slice(0, 10)).tomorrow));
					} catch {
						/* ignore */
					}
				}
			}

			if (view === 'sessions') {
				const sessionClauses = [];
				if (userId) sessionClauses.push(eq(userSessions.userId, userId));
				if (actorType) sessionClauses.push(eq(userSessions.actorType, actorType));
				if (startDate) {
					try {
						sessionClauses.push(gte(userSessions.startedAt, eatDayRangeForDate(startDate.slice(0, 10)).today));
					} catch {
						/* ignore */
					}
				}
				if (endDate) {
					try {
						sessionClauses.push(lt(userSessions.startedAt, eatDayRangeForDate(endDate.slice(0, 10)).tomorrow));
					} catch {
						/* ignore */
					}
				}
				const rawSessions = await db
					.select()
					.from(userSessions)
					.where(sessionClauses.length ? and(...sessionClauses) : undefined)
					.orderBy(desc(userSessions.startedAt));

				type DayGroup = {
					id: string;
					userId: string | null;
					date: string;
					actorTypes: string[];
					branchNames: string[];
					startedAt: Date;
					userInfo: { id: string; username: string; firstName: string | null; lastName: string | null; email: string } | null;
					hasOpenSession: boolean;
					lastEndedAt: Date | null;
					lastEndReason: string | null;
				};
				const groups = new Map<string, DayGroup>();
				for (const row of rawSessions) {
					const started = row.startedAt instanceof Date ? row.startedAt : new Date(row.startedAt);
					const date = `${started.getUTCFullYear()}-${String(started.getUTCMonth() + 1).padStart(2, '0')}-${String(started.getUTCDate()).padStart(2, '0')}`;
					const userKey = row.userId ?? '__admin__';
					const id = `${userKey}::${date}`;
					const [user] = row.userId
						? await db
								.select({
									id: users.id,
									username: users.username,
									firstName: users.firstName,
									lastName: users.lastName,
									email: users.email
								})
								.top(1)
								.from(users)
								.where(eq(users.id, row.userId))
						: [null];
					const [branch] = row.branchId
						? await db.select({ name: branches.name }).top(1).from(branches).where(eq(branches.id, row.branchId))
						: [null];
					const existing = groups.get(id);
					if (!existing) {
						groups.set(id, {
							id,
							userId: row.userId,
							date,
							actorTypes: [row.actorType],
							branchNames: branch?.name ? [branch.name] : [],
							startedAt: started,
							userInfo: user ?? null,
							hasOpenSession: row.endedAt == null,
							lastEndedAt: row.endedAt,
							lastEndReason: row.endReason
						});
						continue;
					}
					if (!existing.actorTypes.includes(row.actorType)) existing.actorTypes.push(row.actorType);
					if (branch?.name && !existing.branchNames.includes(branch.name)) existing.branchNames.push(branch.name);
					if (started < existing.startedAt) existing.startedAt = started;
					if (row.endedAt == null) existing.hasOpenSession = true;
					else if (!existing.lastEndedAt || row.endedAt > existing.lastEndedAt) {
						existing.lastEndedAt = row.endedAt;
						existing.lastEndReason = row.endReason;
					}
					if (!existing.userInfo && user) existing.userInfo = user;
				}
				const grouped = Array.from(groups.values())
					.map((group) => ({
						id: group.id,
						userId: group.userId,
						date: group.date,
						actorType: group.actorTypes[0] ?? null,
						actorTypes: group.actorTypes,
						branchName: group.branchNames.join(', ') || null,
						startedAt: group.startedAt,
						endedAt: group.hasOpenSession ? null : group.lastEndedAt,
						endReason: group.hasOpenSession ? null : group.lastEndReason,
						userInfo: group.userInfo,
						eventCount: 0
					}))
					.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
				const total = grouped.length;
				const pageRows = grouped.slice((page - 1) * limit, page * limit);
				for (const row of pageRows) {
					try {
						const range = eatDayRangeForDate(row.date);
						const logClauses = [gte(auditLogs.createdAt, range.today), lt(auditLogs.createdAt, range.tomorrow)];
						if (row.userId) logClauses.push(eq(auditLogs.userId, row.userId));
						else {
							logClauses.push(isNull(auditLogs.userId));
							logClauses.push(eq(auditLogs.actorType, 'admin'));
						}
						if (category) logClauses.push(eq(auditLogs.category, category));
						const [{ value }] = await db.select({ value: count() }).from(auditLogs).where(and(...logClauses));
						row.eventCount = Number(value ?? 0);
					} catch {
						row.eventCount = 0;
					}
				}
				return sendJson(res, {
					sessions: pageRows,
					pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
				});
			}

			const clauses = [...dateClauses];
			if (userId) clauses.push(eq(auditLogs.userId, userId));
			if (category) clauses.push(eq(auditLogs.category, category));
			if (actorType) clauses.push(eq(auditLogs.actorType, actorType));
			if (operation) clauses.push(eq(auditLogs.operation, operation));
			if (collectionName) clauses.push(like(auditLogs.collectionName, `%${collectionName}%`));
			if (action) clauses.push(eq(auditLogs.action, action));
			const where = clauses.length ? and(...clauses) : undefined;
			const [{ value: total }] = await db.select({ value: count() }).from(auditLogs).where(where);
			const rows = await db
				.select()
				.from(auditLogs)
				.where(where)
				.orderBy(day ? asc(auditLogs.createdAt) : desc(auditLogs.createdAt))
				.offset((page - 1) * limit)
				.fetch(limit);
			const parseJson = (value: string | null) => {
				if (!value) return null;
				try {
					return JSON.parse(value);
				} catch {
					return value;
				}
			};
			const enriched = [];
			for (const row of rows) {
				const [userInfo] = row.userId
					? await db
							.select({
								id: users.id,
								username: users.username,
								firstName: users.firstName,
								lastName: users.lastName,
								email: users.email
							})
							.top(1)
							.from(users)
							.where(eq(users.id, row.userId))
					: [null];
				const [performedByInfo] =
					row.performedBy && UUID_RE.test(row.performedBy)
						? await db
								.select({
									id: users.id,
									username: users.username,
									firstName: users.firstName,
									lastName: users.lastName,
									email: users.email
								})
								.top(1)
								.from(users)
								.where(eq(users.id, row.performedBy))
						: [null];
				enriched.push({
					...row,
					before: parseJson(row.before),
					after: parseJson(row.after),
					metadata: parseJson(row.metadata),
					userInfo: userInfo ?? null,
					performedByInfo: performedByInfo ?? null
				});
			}
			sendJson(res, {
				auditLogs: enriched,
				pagination: {
					page,
					limit,
					total: Number(total ?? 0),
					totalPages: Math.max(1, Math.ceil(Number(total ?? 0) / limit))
				}
			});
		})
	);
	app.post(
		'/api/bank/audit-logs/view',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await recordActivity({
				action: AUDIT_ACTION.PAGE_VIEW,
				description: `Viewed ${req.body?.path || 'page'}`,
				metadata: { path: req.body?.path }
			});
			sendJson(res, { success: true });
		})
	);

	app.get(
		'/api/bank/sessions',
		wrap(async (_req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			const activeUsers = await db.select().from(users).where(isNotNull(users.activeSessionToken));
			const sessions = [];
			for (const user of activeUsers) {
				const [role] = user.roleId
					? await db.select({ name: roles.name }).top(1).from(roles).where(eq(roles.id, user.roleId))
					: [null];
				const [branch] = user.branchId
					? await db
							.select({ id: branches.id, name: branches.name })
							.top(1)
							.from(branches)
							.where(eq(branches.id, user.branchId))
					: [null];
				const nameParts = [user.firstName, user.lastName].filter(Boolean);
				sessions.push({
					userId: user.id,
					username: user.username,
					email: user.email,
					firstName: user.firstName,
					lastName: user.lastName,
					fullName: nameParts.length ? nameParts.join(' ') : user.username || user.email,
					role: role?.name || 'No Role',
					branch: branch ? { id: branch.id, name: branch.name } : null,
					sessionToken: user.activeSessionToken,
					lastSessionAt: user.lastSessionAt,
					isActive: user.status
				});
			}
			sessions.sort((a, b) => {
				const at = a.lastSessionAt ? new Date(a.lastSessionAt).getTime() : 0;
				const bt = b.lastSessionAt ? new Date(b.lastSessionAt).getTime() : 0;
				return bt - at;
			});
			sendJson(res, sessions);
		})
	);
	app.delete(
		'/api/bank/sessions/:userId',
		wrap(async (req, res) => {
			const auth = await requireAuth();
			if (auth.error) return sendAuthError(res, auth.error);
			await db
				.update(users)
				.set({ activeSessionToken: null, updatedAt: eatNow() })
				.where(eq(users.id, p(req, 'userId')));
			await db
				.update(userSessions)
				.set({ endedAt: eatNow(), endReason: 'terminated', updatedAt: eatNow() })
				.where(and(eq(userSessions.userId, p(req, 'userId')), isNull(userSessions.endedAt)));
			sendJson(res, { success: true, message: 'Session terminated' });
		})
	);
}

function queueListBranchId(auth: {
	sessionType: 'regular' | 'display' | 'kiosk';
	regularSession?: { actorType?: string; branchId?: string };
	displaySession?: { branchId?: string };
	kioskSession?: { branchId?: string };
}): string | undefined {
	if (auth.sessionType === 'kiosk') return auth.kioskSession?.branchId || undefined;
	if (auth.sessionType === 'display') return auth.displaySession?.branchId || undefined;
	if (auth.sessionType === 'regular' && auth.regularSession?.actorType === 'serving') {
		return auth.regularSession.branchId || undefined;
	}
	return undefined;
}

async function requireQueueBranches(raw: unknown): Promise<string | null> {
	const parsed = parseQueueBranchIds(raw);
	if (!parsed.ok) return parsed.error;
	if (!(await branchesExist(parsed.ids))) return 'One or more branches were not found';
	return null;
}

function isDashboardAdmin(session: {
	role?: string | null;
	permissions?: Record<string, boolean> | null;
}): boolean {
	const roleIsAdmin =
		session.role === 'admin' ||
		Boolean(session.role && session.role.toLowerCase().includes('admin'));
	const hasAdminPermissions = Boolean(
		session.permissions &&
			(session.permissions['Branches'] === true ||
				session.permissions['Users'] === true ||
				session.permissions['Settings'] === true)
	);
	return Boolean(roleIsAdmin || hasAdminPermissions);
}

function registerRatingRoutes(app: Express): void {
	app.get(
		'/api/bank/ratings/branches',
		wrap(async (req, res) => {
			const err = validateRatingRequest(req);
			if (err) return sendJson(res, { error: err }, 403);
			const rows = await db
				.select({ id: branches.id, name: branches.name, address: branches.address, status: branches.status })
				.from(branches)
				.where(eq(branches.status, true))
				.orderBy(asc(branches.name));
			sendJson(res, rows);
		})
	);
	app.post(
		'/api/bank/ratings/ticket/search',
		wrap(async (req, res) => {
			const err = validateRatingRequest(req);
			if (err) return sendJson(res, { error: err }, 403);
			const ticketNo = String(req.body?.ticketNo || '');
			const branchId = String(req.body?.branchId || '');
			if (!ticketNo) return sendJson(res, { success: false, error: 'Ticket number is required' }, 400);
			const { today, tomorrow } = todayRange();
			const clauses = [
				eq(banktickets.ticketNo, ticketNo.trim()),
				gte(banktickets.createdAt, today),
				lt(banktickets.createdAt, tomorrow)
			];
			if (branchId) clauses.push(eq(banktickets.branchId, branchId));
			const found = await db
				.select()
				.from(banktickets)
				.where(and(...clauses))
				.orderBy(desc(banktickets.createdAt));
			const ticket = found[0];
			if (!ticket) return sendJson(res, { success: false, error: 'Ticket not found' }, 404);
			if (ticket.rating) {
				return sendJson(
					res,
					{ success: false, error: 'This ticket already has feedback submitted. Each ticket can only be rated once.' },
					400
				);
			}
			sendJson(res, { success: true, ticket: serializeBankticket(ticket) });
		})
	);
	app.get(
		'/api/bank/ratings/ticket/:id',
		wrap(async (req, res) => {
			const err = validateRatingRequest(req);
			if (err) return sendJson(res, { error: err }, 403);
			const [ticket] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, p(req, 'id')));
			if (!ticket) return sendJson(res, { error: 'Ticket not found' }, 404);
			sendJson(res, serializeBankticket(ticket));
		})
	);
	app.post(
		'/api/bank/ratings/ticket/:id',
		wrap(async (req, res) => {
			const err = validateRatingRequest(req);
			if (err) return sendJson(res, { error: err }, 403);
			const rating = Number(req.body?.rating);
			if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
				return sendJson(res, { error: 'rating must be 1-5' }, 400);
			}
			const [existing] = await db.select().top(1).from(banktickets).where(eq(banktickets.id, p(req, 'id')));
			if (!existing) return sendJson(res, { error: 'Ticket not found' }, 404);
			if (existing.rating) {
				return sendJson(
					res,
					{ error: 'This ticket already has feedback submitted. Each ticket can only be rated once.' },
					400
				);
			}
			await db
				.update(banktickets)
				.set({
					rating,
					ratingComment: req.body?.ratingComment ? String(req.body.ratingComment) : null,
					updatedAt: eatNow()
				})
				.where(eq(banktickets.id, p(req, 'id')));
			sendJson(res, { success: true });
		})
	);
	app.get(
		'/api/bank/ratings/branch/:id',
		wrap(async (req, res) => {
			const err = validateRatingRequest(req);
			if (err) return sendJson(res, { error: err }, 403);
			const [branch] = await db
				.select({ id: branches.id, name: branches.name, address: branches.address, status: branches.status })
				.top(1)
				.from(branches)
				.where(eq(branches.id, p(req, 'id')));
			if (!branch) return sendJson(res, { error: 'Branch not found' }, 404);
			sendJson(res, branch);
		})
	);
}
