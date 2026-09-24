import { uuidV7 } from './ids';
import { db } from './db';
import { auditLogs } from './db/schema';
import { logger } from './logger';
import { getSession, type SessionFields } from './session';
import {
	AUDIT_ACTION,
	categoryFromAction,
	collectionNameFromAction,
	configActionFor,
	operationFromAction
} from './auditActions';
import {
	ensureUserSession,
	resolveDbUserId,
	type SessionActorType
} from './userSession';
import { eatNow } from './timezone';

export type AuditActorType = SessionActorType | 'system';
export type AuditOutcome = 'success' | 'failure';

const SENSITIVE_FIELDS = new Set([
	'password',
	'databasePassword',
	'kioskPassword',
	'hallDisplayPassword',
	'feedbackPassword',
	'apiKey',
	'token',
	'accessToken',
	'refreshToken',
	'secret'
]);

function sanitizeDocument<T>(doc: T | null | undefined): T | null {
	if (!doc) return null;

	try {
		const clone = JSON.parse(JSON.stringify(doc));

		const cleanse = (value: unknown) => {
			if (!value || typeof value !== 'object') return;
			if (Array.isArray(value)) {
				value.forEach(cleanse);
				return;
			}
			const record = value as Record<string, unknown>;
			for (const key of Object.keys(record)) {
				if (SENSITIVE_FIELDS.has(key)) {
					delete record[key];
					continue;
				}
				cleanse(record[key]);
			}
		};

		cleanse(clone);
		return clone as T;
	} catch (error) {
		logger.error('Failed to sanitize document for audit log:', error);
		return null;
	}
}

function inferActorType(session: Partial<SessionFields>): AuditActorType | null {
	if (session.actorType) return session.actorType;
	if (session.userId === 'admin' || session.role === 'admin') return 'admin';
	return null;
}

export interface RecordActivityPayload {
	action: string;
	description?: string;
	collectionName?: string;
	documentId?: string | null;
	operation?: string;
	userId?: string | null;
	performedBy?: string | null;
	sessionId?: string | null;
	actorType?: AuditActorType | null;
	branchId?: string | null;
	ticketId?: string | null;
	ticketServiceId?: string | null;
	counterId?: string | null;
	outcome?: AuditOutcome;
	before?: unknown;
	after?: unknown;
	metadata?: Record<string, unknown>;
	attachSession?: boolean;
}

export async function recordActivity(payload: RecordActivityPayload): Promise<void> {
	try {
		let sessionId = payload.sessionId ?? null;
		let userId = payload.userId;
		let branchId = payload.branchId ?? null;
		let actorType = payload.actorType ?? null;
		let counterId = payload.counterId ?? null;
		let performedBy = payload.performedBy;

		if (payload.attachSession !== false) {
			try {
				const session = await getSession();
				if (session.isLoggedIn) {
					sessionId = sessionId ?? session.sessionToken ?? null;
					if (userId === undefined) {
						userId = resolveDbUserId(session.userId);
					}
					branchId = branchId ?? session.branchId ?? null;
					actorType = actorType ?? inferActorType(session);
					counterId = counterId ?? session.counterId ?? null;
					if (performedBy === undefined) {
						performedBy = session.userId ?? null;
					}
				}
			} catch (error) {
				logger.error('Failed to attach session context to audit log:', error);
			}
		}

		if (userId === undefined) userId = null;
		else userId = resolveDbUserId(userId);

		if (performedBy === undefined) performedBy = userId;

		if (sessionId) {
			const actorForSession: SessionActorType =
				actorType === 'serving' || actorType === 'admin' || actorType === 'dashboard'
					? actorType
					: 'dashboard';
			sessionId = await ensureUserSession({
				sessionId,
				userId,
				actorType: actorForSession,
				branchId,
				counterId
			});
		}

		const action = payload.action;
		const category = categoryFromAction(action);
		const collectionName = payload.collectionName ?? collectionNameFromAction(action);
		const operation = payload.operation ?? operationFromAction(action, payload.operation);
		const now = eatNow();

		await db.insert(auditLogs).values({
			id: uuidV7(),
			collectionName,
			documentId: payload.documentId || null,
			operation,
			userId: userId || null,
			performedBy: performedBy || null,
			description: payload.description ?? null,
			before: payload.before ? JSON.stringify(sanitizeDocument(payload.before)) : null,
			after: payload.after ? JSON.stringify(sanitizeDocument(payload.after)) : null,
			metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
			sessionId,
			actorType,
			category,
			action,
			outcome: payload.outcome ?? 'success',
			branchId,
			ticketId: payload.ticketId ?? null,
			ticketServiceId: payload.ticketServiceId ?? null,
			counterId,
			createdAt: now,
			updatedAt: now
		});
	} catch (error) {
		logger.error('Failed to create audit log entry:', error);
	}
}

export async function recordAuthFailure(params: {
	username: string;
	reason: string;
	actorType: SessionActorType;
	userId?: string | null;
}): Promise<void> {
	await recordActivity({
		action: AUDIT_ACTION.AUTH_LOGIN_FAILED,
		outcome: 'failure',
		actorType: params.actorType,
		userId: resolveDbUserId(params.userId),
		performedBy: resolveDbUserId(params.userId) ?? params.username,
		description: `Login failed for ${params.username} (${params.reason})`,
		metadata: { username: params.username, reason: params.reason },
		attachSession: false,
		collectionName: 'Session',
		operation: 'login'
	});
}

export async function createAuditLog(payload: {
	collectionName: string;
	operation: string;
	action?: string;
	[key: string]: unknown;
}): Promise<void> {
	const action = payload.action ?? configActionFor(payload.collectionName, payload.operation);
	await recordActivity({
		...payload,
		action
	} as RecordActivityPayload);
}
