export const AUDIT_CATEGORY = {
	AUTH: 'auth',
	PAGE: 'page',
	CONFIG: 'config',
	SERVING: 'serving'
} as const;

export type AuditCategory = (typeof AUDIT_CATEGORY)[keyof typeof AUDIT_CATEGORY];

export const AUDIT_ACTION = {
	AUTH_LOGIN: 'auth.login',
	AUTH_LOGIN_FAILED: 'auth.login_failed',
	AUTH_LOGOUT: 'auth.logout',
	AUTH_SESSION_TERMINATED: 'auth.session_terminated',
	PAGE_VIEW: 'page.view'
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION] | string;

const COLLECTION_TO_ENTITY: Record<string, string> = {
	Ad: 'ad',
	Branch: 'branch',
	Counter: 'counter',
	ExchangeRate: 'exchange_rate',
	Queue: 'queue',
	Role: 'role',
	User: 'user',
	BankSettings: 'bank_settings',
	Bankticket: 'ticket',
	Session: 'session',
	Page: 'page'
};

export function configActionFor(collectionName: string, operation: string): string {
	const entity =
		COLLECTION_TO_ENTITY[collectionName] ??
		collectionName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
	return `config.${entity}.${operation}`;
}

export function categoryFromAction(action: string): AuditCategory {
	const prefix = action.split('.')[0];
	if (
		prefix === AUDIT_CATEGORY.AUTH ||
		prefix === AUDIT_CATEGORY.PAGE ||
		prefix === AUDIT_CATEGORY.CONFIG ||
		prefix === AUDIT_CATEGORY.SERVING
	) {
		return prefix;
	}
	return AUDIT_CATEGORY.CONFIG;
}

export function collectionNameFromAction(action: string, fallback = 'Session'): string {
	if (action.startsWith('auth.')) return 'Session';
	if (action.startsWith('page.')) return 'Page';
	if (action.startsWith('serving.ticket.')) return 'Bankticket';
	if (action.startsWith('serving.')) return 'Counter';
	if (action.startsWith('config.')) {
		const entity = action.split('.')[1];
		const entry = Object.entries(COLLECTION_TO_ENTITY).find(([, value]) => value === entity);
		if (entry) return entry[0];
	}
	return fallback;
}

export function operationFromAction(action: string, fallback = 'update'): string {
	const parts = action.split('.');
	return parts[parts.length - 1] || fallback;
}
