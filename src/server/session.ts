import { randomBytes } from 'node:crypto';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';
import { logger } from './logger';
import { closeUserSession } from './userSession';
import { eatEndOfDayMs, eatNow } from './timezone';
import { getRequestContext } from './requestContext';
import { sessionPassword, shouldUseSecureCookies } from './cookies';
import type { PublicSession, SessionFields } from './sessionTypes';

export type { PublicSession, SessionFields } from './sessionTypes';
export type SessionData = IronSession<SessionFields>;

const sessionOptions: SessionOptions = {
	password: sessionPassword(),
	cookieName: 'auth-session',
	cookieOptions: {
		secure: shouldUseSecureCookies(),
		httpOnly: true,
		sameSite: 'lax',
		path: '/'
	}
};

async function getIronAuthSession() {
	const { req, res } = getRequestContext();
	return getIronSession<SessionFields>(req, res, sessionOptions);
}

export function toPublicSession(session: Partial<SessionFields>): PublicSession {
	const isLoggedIn = Boolean(session.isLoggedIn && session.userId);
	return {
		isLoggedIn,
		userId: isLoggedIn ? session.userId : undefined,
		role: isLoggedIn ? session.role : undefined,
		actorType: isLoggedIn ? session.actorType : undefined,
		branchId: isLoggedIn ? session.branchId : undefined,
		counterId: isLoggedIn ? session.counterId : undefined,
		department: isLoggedIn ? session.department : undefined,
		permissions: isLoggedIn ? session.permissions : undefined,
		hallDisplayUsername: isLoggedIn ? session.hallDisplayUsername : undefined,
		expiresAt: isLoggedIn ? session.expiresAt : undefined
	};
}

export async function getSession(): Promise<SessionData> {
	const session = await getIronAuthSession();
	if (!session.isLoggedIn) {
		session.isLoggedIn = false;
		return session;
	}
	if (!session.expiresAt || Date.now() > session.expiresAt) {
		if (session.sessionToken) await closeUserSession(session.sessionToken, 'expired');
		session.destroy();
		session.isLoggedIn = false;
		return session;
	}
	if (session.userId && session.userId !== 'admin' && session.sessionToken) {
		try {
			const [user] = await db
				.select({ activeSessionToken: users.activeSessionToken })
				.top(1)
				.from(users)
				.where(eq(users.id, session.userId));
			if (!user || user.activeSessionToken !== session.sessionToken) {
				await closeUserSession(session.sessionToken, 'superseded');
				session.destroy();
				session.isLoggedIn = false;
				session.userId = undefined;
				session.sessionToken = undefined;
			}
		} catch (error) {
			logger.error('Error validating session token:', error);
		}
	}
	return session;
}

export async function createSession(sessionData: Partial<SessionFields>): Promise<SessionData> {
	const session = await getIronAuthSession();
	const sessionToken = randomBytes(32).toString('hex');
	session.sessionToken = sessionToken;
	if (sessionData.userId !== undefined) session.userId = sessionData.userId;
	if (sessionData.branchId !== undefined) session.branchId = sessionData.branchId;
	if (sessionData.counterId !== undefined) session.counterId = sessionData.counterId;
	if (sessionData.role !== undefined) session.role = sessionData.role;
	if (sessionData.permissions !== undefined) session.permissions = sessionData.permissions;
	if (sessionData.department !== undefined) session.department = sessionData.department;
	if (sessionData.hallDisplayUsername !== undefined) {
		session.hallDisplayUsername = sessionData.hallDisplayUsername;
	}
	if (sessionData.actorType !== undefined) session.actorType = sessionData.actorType;
	session.isLoggedIn = true;
	session.expiresAt = sessionData.expiresAt !== undefined ? sessionData.expiresAt : eatEndOfDayMs();
	if (sessionData.userId && sessionData.userId !== 'admin') {
		const now = eatNow();
		await db
			.update(users)
			.set({ activeSessionToken: sessionToken, lastSessionAt: now, updatedAt: now })
			.where(eq(users.id, sessionData.userId));
	}
	await session.save();
	return session;
}

export async function patchSession(fields: Partial<SessionFields>): Promise<SessionData> {
	const session = await getIronAuthSession();
	for (const [key, value] of Object.entries(fields)) {
		(session as Record<string, unknown>)[key] = value;
	}
	await session.save();
	return session;
}

export async function destroyAuthSession(): Promise<void> {
	const session = await getIronAuthSession();
	if (session.sessionToken) await closeUserSession(session.sessionToken, 'logout');
	session.destroy();
}
