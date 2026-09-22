import { getIronSession, type SessionOptions } from 'iron-session';
import { getRequestContext } from './requestContext';
import { oneMonthFromNow, sessionPassword, shouldUseSecureCookies } from './cookies';

export interface DisplaySessionFields {
	branchId?: string;
	isLoggedIn: boolean;
	hallDisplayUsername?: string;
	expiresAt: number;
	[key: string]: unknown;
}

const sessionOptions: SessionOptions = {
	password: sessionPassword(),
	cookieName: 'display-session',
	cookieOptions: {
		secure: shouldUseSecureCookies(),
		httpOnly: true,
		sameSite: 'lax',
		path: '/'
	}
};

function iron() {
	const { req, res } = getRequestContext();
	return getIronSession<DisplaySessionFields>(req, res, sessionOptions);
}

export function toPublicDisplaySession(session: Partial<DisplaySessionFields>) {
	const isLoggedIn = Boolean(session.isLoggedIn);
	return {
		isLoggedIn,
		branchId: isLoggedIn ? session.branchId : undefined,
		hallDisplayUsername: isLoggedIn ? session.hallDisplayUsername : undefined,
		expiresAt: isLoggedIn ? session.expiresAt : undefined
	};
}

export async function getDisplaySession() {
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

export async function createDisplaySession(sessionData: Partial<DisplaySessionFields>) {
	const session = await iron();
	if (sessionData.branchId !== undefined) session.branchId = sessionData.branchId;
	if (sessionData.hallDisplayUsername !== undefined) {
		session.hallDisplayUsername = sessionData.hallDisplayUsername;
	}
	session.isLoggedIn = true;
	session.expiresAt = oneMonthFromNow();
	await session.save();
	return session;
}

export async function destroyDisplaySession() {
	const session = await iron();
	session.destroy();
}
