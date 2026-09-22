import type { Response } from 'express';
import { logger } from './logger';
import { getSession, type SessionData } from './session';
import { getDisplaySession } from './displaySession';
import { getKioskSession } from './kioskSession';

export function sendJson(res: Response, body: unknown, status = 200): void {
	res.status(status).json(body);
}

export async function requireAuth(): Promise<
	{ session: SessionData; error: null } | { session: null; error: { status: number; body: unknown } }
> {
	try {
		const session = await getSession();
		if (!session.isLoggedIn || !session.userId) {
			return { session: null, error: { status: 401, body: { error: 'Unauthorized - Authentication required' } } };
		}
		return { session, error: null };
	} catch (error) {
		logger.error('Error validating session:', error);
		return { session: null, error: { status: 500, body: { error: 'Internal server error' } } };
	}
}

export async function requireAnySession(): Promise<
	| {
			sessionType: 'regular' | 'display' | 'kiosk';
			regularSession?: SessionData;
			displaySession?: Awaited<ReturnType<typeof getDisplaySession>>;
			kioskSession?: Awaited<ReturnType<typeof getKioskSession>>;
			error: null;
	  }
	| { sessionType: null; error: { status: number; body: unknown } }
> {
	try {
		const [regularSession, displaySession, kioskSession] = await Promise.all([
			getSession(),
			getDisplaySession(),
			getKioskSession()
		]);
		if (regularSession.isLoggedIn && regularSession.userId) {
			return { sessionType: 'regular', regularSession, error: null };
		}
		if (displaySession.isLoggedIn) {
			return { sessionType: 'display', displaySession, error: null };
		}
		if (kioskSession.isLoggedIn) {
			return { sessionType: 'kiosk', kioskSession, error: null };
		}
		return {
			sessionType: null,
			error: { status: 401, body: { error: 'Unauthorized - Authentication required' } }
		};
	} catch (error) {
		logger.error('Error validating any session:', error);
		return { sessionType: null, error: { status: 500, body: { error: 'Internal server error' } } };
	}
}

export function sendAuthError(
	res: Response,
	error: { status: number; body: unknown }
): void {
	sendJson(res, error.body, error.status);
}
