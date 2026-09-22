import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from './db';
import { userSessions } from './db/schema';
import { logger } from './logger';
import { eatNow } from './timezone';
import type { SessionActorType } from './sessionTypes';

export type { SessionActorType };
export type SessionEndReason = 'logout' | 'terminated' | 'superseded' | 'expired';
export type SessionLoginMethod = 'database' | 'ldap' | 'admin';

export function resolveDbUserId(userId?: string | null): string | null {
	if (!userId || userId === 'admin' || userId === 'unknown' || userId === 'system') return null;
	return userId;
}

export async function openUserSession(input: {
	sessionId: string;
	userId?: string | null;
	actorType: SessionActorType;
	branchId?: string | null;
	counterId?: string | null;
	loginMethod?: SessionLoginMethod | null;
}): Promise<void> {
	try {
		const dbUserId = resolveDbUserId(input.userId);
		const now = eatNow();
		if (dbUserId) {
			await db
				.update(userSessions)
				.set({ endedAt: now, endReason: 'superseded', updatedAt: now })
				.where(
					and(
						eq(userSessions.userId, dbUserId),
						isNull(userSessions.endedAt),
						ne(userSessions.id, input.sessionId)
					)
				);
		}
		await db.insert(userSessions).values({
			id: input.sessionId,
			userId: dbUserId,
			actorType: input.actorType,
			branchId: input.branchId ?? null,
			counterId: input.counterId ?? null,
			loginMethod: input.loginMethod ?? null,
			startedAt: now,
			createdAt: now,
			updatedAt: now
		});
	} catch (error) {
		logger.error('Failed to open user session:', error);
	}
}

export async function closeUserSession(
	sessionId: string | null | undefined,
	endReason: SessionEndReason
): Promise<void> {
	if (!sessionId) return;
	try {
		const now = eatNow();
		await db
			.update(userSessions)
			.set({ endedAt: now, endReason, updatedAt: now })
			.where(and(eq(userSessions.id, sessionId), isNull(userSessions.endedAt)));
	} catch (error) {
		logger.error('Failed to close user session:', error);
	}
}

export async function ensureUserSession(input: {
	sessionId: string;
	userId?: string | null;
	actorType?: SessionActorType | null;
	branchId?: string | null;
	counterId?: string | null;
}): Promise<string | null> {
	try {
		const [existing] = await db
			.select({ id: userSessions.id })
			.top(1)
			.from(userSessions)
			.where(eq(userSessions.id, input.sessionId));
		if (existing) return existing.id;
		const now = eatNow();
		await db.insert(userSessions).values({
			id: input.sessionId,
			userId: resolveDbUserId(input.userId),
			actorType: input.actorType ?? 'dashboard',
			branchId: input.branchId ?? null,
			counterId: input.counterId ?? null,
			startedAt: now,
			createdAt: now,
			updatedAt: now
		});
		return input.sessionId;
	} catch (error) {
		const [raced] = await db
			.select({ id: userSessions.id })
			.top(1)
			.from(userSessions)
			.where(eq(userSessions.id, input.sessionId));
		if (raced) return raced.id;
		logger.error('Failed to ensure user session:', error);
		return null;
	}
}
