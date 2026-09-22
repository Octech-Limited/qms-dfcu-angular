import { getIronSession, type SessionOptions } from 'iron-session';
import { getRequestContext } from './requestContext';
import { oneMonthFromNow, sessionPassword, shouldUseSecureCookies } from './cookies';

export interface KioskSessionFields {
	branchId?: string;
	isLoggedIn: boolean;
	kioskUsername?: string;
	expiresAt: number;
	[key: string]: unknown;
}

const sessionOptions: SessionOptions = {
	password: sessionPassword(),
	cookieName: 'kiosk-session',
	cookieOptions: {
		secure: shouldUseSecureCookies(),
		httpOnly: true,
		sameSite: 'lax',
		path: '/'
	}
};

function iron() {
	const { req, res } = getRequestContext();
	return getIronSession<KioskSessionFields>(req, res, sessionOptions);
}

export function toPublicKioskSession(session: Partial<KioskSessionFields>) {
	const isLoggedIn = Boolean(session.isLoggedIn);
	return {
		isLoggedIn,
		branchId: isLoggedIn ? session.branchId : undefined,
		kioskUsername: isLoggedIn ? session.kioskUsername : undefined,
		expiresAt: isLoggedIn ? session.expiresAt : undefined
	};
}

export async function getKioskSession() {
	const session = await iron();
	if (!session.isLoggedIn) {
		session.isLoggedIn = false;
		return session;
	}
	if (!session.expiresAt || Date.now() > session.expiresAt) {
		session.destroy();
		session.isLoggedIn = false;
		return session;
	}
	return session;
}

export async function createKioskSession(sessionData: Partial<KioskSessionFields>) {
	const session = await iron();
	if (sessionData.branchId !== undefined) session.branchId = sessionData.branchId;
	if (sessionData.kioskUsername !== undefined) session.kioskUsername = sessionData.kioskUsername;
	session.isLoggedIn = true;
	session.expiresAt = oneMonthFromNow();
	await session.save();
	return session;
}

export async function destroyKioskSession() {
	const session = await iron();
	session.destroy();
}
