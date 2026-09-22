import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { bankSettings, branches, logs, roles, users } from './db/schema';
import { logger } from './logger';
import { comparePassword } from './password';
import { createSession } from './session';
import { openUserSession, type SessionActorType } from './userSession';
import { isLdapEnabled } from './ldap/config';
import { authenticateLDAP } from './ldap/ldapService';
import { AUDIT_ACTION } from './auditActions';
import { recordActivity, recordAuthFailure } from './auditLogger';
import { eatNow } from './timezone';

const ADMIN_PERMISSIONS: Record<string, boolean> = {
	Home: true,
	Branches: true,
	Users: true,
	Roles: true,
	Announcements: true,
	Socials: true,
	Queues: true,
	ExchangeRates: true,
	Ads: true,
	Settings: true,
	Sessions: true,
	Logs: true,
	AuditLogs: true,
	Serving: true,
	Preview: true
};

export type LoginResult =
	| { ok: true }
	| { ok: false; status: number; error: string };

async function createLog(
	userId: string,
	action: string,
	details: string,
	username?: string,
	actorType: SessionActorType = 'dashboard'
) {
	try {
		let logUserId: string | null = null;

		if (userId !== 'admin' && userId !== 'unknown' && userId !== 'system') {
			const [user] = await db.select({ id: users.id }).top(1).from(users).where(eq(users.id, userId));
			if (user) logUserId = userId;
		}

		const now = eatNow();
		await db.insert(logs).values({
			id: randomUUID(),
			userId: logUserId,
			action,
			details,
			createdAt: now,
			updatedAt: now
		});

		if (username && details.startsWith('failed')) {
			const reason = details.replace(/^failed\s*\(/, '').replace(/\)$/, '');
			await recordAuthFailure({ username, reason, actorType, userId });
		}
	} catch (error) {
		logger.error('Failed to create log:', error);
	}
}

async function findUserByUsernameOrEmail(value: string) {
	const [byUsername] = await db.select().top(1).from(users).where(eq(users.username, value));
	if (byUsername) return byUsername;
	const [byEmail] = await db.select().top(1).from(users).where(eq(users.email, value));
	return byEmail ?? null;
}

export async function loginStaff(input: {
	username: string;
	password: string;
	isAdminLogin?: boolean;
}): Promise<LoginResult> {
	const username = input.username;
	const { password, isAdminLogin } = input;

	if (!username || typeof username !== 'string') {
		return { ok: false, status: 400, error: 'Username is required and must be a string' };
	}
	if (!password || typeof password !== 'string') {
		return { ok: false, status: 400, error: 'Password is required and must be a string' };
	}
	if (username.length < 1 || username.length > 255) {
		return { ok: false, status: 400, error: 'Invalid username length' };
	}
	if (password.length < 1 || password.length > 128) {
		return { ok: false, status: 400, error: 'Invalid password length' };
	}
	if (username.includes('--') || username.includes(';') || username.includes('/*')) {
		return { ok: false, status: 400, error: 'Invalid username format' };
	}

	const emailForDbLookup = username.trim();
	const expirationTime = 24 * 60 * 60 * 1000;

	try {
		if (isAdminLogin) {
			const [settings] = await db.select().top(1).from(bankSettings);

			if (!settings) {
				await createLog('admin', 'Dashboard login', 'failed (Settings not found)', emailForDbLookup, 'admin');
				return { ok: false, status: 401, error: 'Invalid admin credentials' };
			}

			if (!settings.password) {
				await createLog(
					'admin',
					'Dashboard login',
					'failed (No password set in settings)',
					emailForDbLookup,
					'admin'
				);
				return { ok: false, status: 401, error: 'Invalid admin credentials' };
			}

			const isValidPassword = await comparePassword(password, settings.password);

			if (settings.email !== emailForDbLookup || !isValidPassword) {
				await createLog(
					'admin',
					'Dashboard login',
					'failed (Invalid admin credentials)',
					emailForDbLookup,
					'admin'
				);
				return { ok: false, status: 401, error: 'Invalid admin credentials' };
			}

			const created = await createSession({
				userId: 'admin',
				role: 'admin',
				actorType: 'admin',
				permissions: ADMIN_PERMISSIONS,
				expiresAt: Date.now() + expirationTime
			});

			if (created.sessionToken) {
				await openUserSession({
					sessionId: created.sessionToken,
					userId: null,
					actorType: 'admin',
					loginMethod: 'admin'
				});
				await recordActivity({
					action: AUDIT_ACTION.AUTH_LOGIN,
					sessionId: created.sessionToken,
					actorType: 'admin',
					description: 'Admin logged in to the dashboard',
					metadata: { loginMethod: 'admin', username: emailForDbLookup }
				});
			}

			await createLog('admin', 'Dashboard login', 'success');
			return { ok: true };
		}

		const ldapEnabled = isLdapEnabled();
		const authMethod = process.env.AUTH_METHOD || 'database';

		let ldapAuthResult: { success: boolean; user?: { email?: string }; message?: string } | null =
			null;
		let useLdapAuth = false;
		let ldapEmail: string | undefined;

		if (ldapEnabled && (authMethod === 'ldap' || authMethod === 'hybrid')) {
			try {
				ldapAuthResult = await authenticateLDAP(username, password);

				if (ldapAuthResult.success) {
					useLdapAuth = true;
					ldapEmail = ldapAuthResult.user?.email;
				} else if (authMethod === 'ldap') {
					await createLog(
						'unknown',
						'Dashboard login',
						`failed (${ldapAuthResult.message || 'LDAP authentication failed'})`,
						emailForDbLookup
					);
					return {
						ok: false,
						status: 401,
						error: ldapAuthResult.message || 'Binding failed: Invalid credentials'
					};
				}
			} catch (ldapError) {
				if (authMethod === 'ldap') {
					await createLog(
						'unknown',
						'Dashboard login',
						`failed (LDAP connection error: ${ldapError instanceof Error ? ldapError.message : String(ldapError)})`,
						emailForDbLookup
					);
					return {
						ok: false,
						status: 503,
						error:
							ldapError instanceof Error
								? ldapError.message
								: 'Binding failed: LDAP service unavailable'
					};
				}
			}
		}

		let user =
			useLdapAuth && ldapEmail
				? ((await findUserByUsernameOrEmail(emailForDbLookup)) ??
					(await findUserByUsernameOrEmail(ldapEmail.trim())))
				: await findUserByUsernameOrEmail(emailForDbLookup);

		if (!user) {
			await createLog(
				'unknown',
				'Dashboard login',
				useLdapAuth
					? `failed (LDAP auth succeeded but user not found in database - searched username: ${emailForDbLookup}, email: ${ldapEmail})`
					: `failed (User not found - searched username/email: ${emailForDbLookup})`,
				emailForDbLookup
			);
			return {
				ok: false,
				status: 401,
				error: 'User not found in system. Please contact your administrator.'
			};
		}

		if (!useLdapAuth) {
			let isValidPassword = false;
			if (authMethod === 'database') {
				isValidPassword = password === user.username;
			} else if (user.password) {
				isValidPassword = await comparePassword(password, user.password);
			}
			if (!isValidPassword) {
				await createLog(
					user.id,
					'Dashboard login',
					authMethod === 'database' || user.password
						? 'failed (Invalid password)'
						: 'failed (No password set for user)',
					emailForDbLookup
				);
				return {
					ok: false,
					status: 401,
					error:
						authMethod === 'database' || user.password
							? 'Binding failed: Invalid credentials'
							: 'Invalid credentials'
				};
			}
		}

		if (user.status === false) {
			await createLog(user.id, 'Dashboard login', 'failed (User account suspended)', emailForDbLookup);
			return {
				ok: false,
				status: 403,
				error: 'Your account or branch has been temporarily suspended please contact your admin'
			};
		}

		let branch: { status: boolean } | null = null;
		if (user.branchId) {
			const [row] = await db
				.select({ status: branches.status })
				.top(1)
				.from(branches)
				.where(eq(branches.id, user.branchId));
			branch = row ?? null;
			if (branch && branch.status === false) {
				await createLog(user.id, 'Dashboard login', 'failed (Branch suspended)', emailForDbLookup);
				return {
					ok: false,
					status: 403,
					error: 'Your account or branch has been temporarily suspended please contact your admin'
				};
			}
		}

		if (!user.roleId) {
			await createLog(user.id, 'Dashboard login', 'failed (No role assigned)', emailForDbLookup);
			return {
				ok: false,
				status: 403,
				error: 'Your account does not have a role assigned. Please contact your administrator.'
			};
		}

		const [role] = await db.select().top(1).from(roles).where(eq(roles.id, user.roleId));
		if (!role) {
			await createLog(user.id, 'Dashboard login', 'failed (No role assigned)', emailForDbLookup);
			return {
				ok: false,
				status: 403,
				error: 'Your account does not have a role assigned. Please contact your administrator.'
			};
		}

		const permissions = role.permissions
			? typeof role.permissions === 'string'
				? (JSON.parse(role.permissions) as Record<string, boolean>)
				: (role.permissions as Record<string, boolean>)
			: {};

		const sessionData: Parameters<typeof createSession>[0] = {
			userId: user.id,
			role: role.name || '',
			actorType: 'dashboard',
			permissions,
			expiresAt: Date.now() + expirationTime
		};

		if (user.branchId) {
			sessionData.branchId = user.branchId;
		}

		const created = await createSession(sessionData);
		const loginMethod = useLdapAuth ? 'ldap' : 'database';

		if (created.sessionToken) {
			await openUserSession({
				sessionId: created.sessionToken,
				userId: user.id,
				actorType: 'dashboard',
				branchId: user.branchId,
				loginMethod
			});
			await recordActivity({
				action: AUDIT_ACTION.AUTH_LOGIN,
				sessionId: created.sessionToken,
				userId: user.id,
				actorType: 'dashboard',
				branchId: user.branchId,
				description: `${user.username} logged in to the dashboard`,
				metadata: { loginMethod, username: user.username }
			});
		}

		const authMethodUsed = useLdapAuth ? 'LDAP' : 'database';
		await createLog(user.id, 'Dashboard login', `success (${authMethodUsed})`);
		return { ok: true };
	} catch (error) {
		await createLog(
			'unknown',
			'Dashboard login',
			`failed (Internal server error: ${error instanceof Error ? error.message : String(error)})`
		);
		return {
			ok: false,
			status: 500,
			error: error instanceof Error ? error.message : 'An error occurred during login'
		};
	}
}
