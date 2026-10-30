import {
	bit,
	datetime2,
	float,
	index,
	int,
	mssqlTable,
	nvarchar,
	primaryKey,
	tinyint,
	uniqueIndex
} from 'drizzle-orm/mssql-core';

const id = () => nvarchar({ length: 1000 }).primaryKey();
const str = (length: number | 'max' = 1000) => nvarchar({ length });
const ts = () => datetime2();

export const ads = mssqlTable('ads', {
	id: id(),
	name: str().notNull(),
	image: str(),
	video: str(),
	youtubeUrl: str(),
	isLive: bit().notNull(),
	validFrom: ts(),
	validUntil: ts(),
	createdAt: ts().notNull(),
	updatedAt: ts().notNull()
});

export const adBranches = mssqlTable(
	'ad_branches',
	{
		id: id(),
		adId: str().notNull(),
		branchId: str().notNull()
	},
	(t) => [uniqueIndex('ad_branches_adId_branchId_key').on(t.adId, t.branchId)]
);

export const branches = mssqlTable('branches', {
	id: id(),
	name: str().notNull(),
	address: str().notNull(),
	localNetworkAddress: str(),
	databaseHost: str(),
	databaseName: str(),
	databaseUser: str(),
	databasePassword: str(),
	kioskUsername: str(),
	kioskPassword: str(),
	kioskIpAddress: str(),
	platform: str(),
	hallDisplayUsername: str().notNull(),
	hallDisplayPassword: str().notNull(),
	status: bit().notNull(),
	createdAt: ts().notNull(),
	updatedAt: ts().notNull()
});

export const exchangeRates = mssqlTable(
	'exchange_rates',
	{
		id: id(),
		countryName: str().notNull(),
		countryCode: str().notNull(),
		currencyCode: str().notNull(),
		buyingRate: float().notNull(),
		sellingRate: float().notNull(),
		displayOrder: int().notNull(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [index('exchange_rates_displayOrder_idx').on(t.displayOrder)]
);

export const queues = mssqlTable('queues', {
	id: id(),
	name: str().notNull(),
	status: int().notNull(),
	createdAt: ts().notNull(),
	updatedAt: ts().notNull()
});

export const queueBranches = mssqlTable(
	'queue_branches',
	{
		id: id(),
		queueId: str()
			.notNull()
			.references(() => queues.id),
		branchId: str()
			.notNull()
			.references(() => branches.id)
	},
	(t) => [uniqueIndex('queue_branches_queueId_branchId_key').on(t.queueId, t.branchId)]
);

export const subMenuItems = mssqlTable('sub_menu_items', {
	id: id(),
	queueId: str().notNull(),
	name: str().notNull(),
	priority: bit().notNull(),
	createdAt: ts().notNull(),
	updatedAt: ts().notNull()
});

export const subSubMenuItems = mssqlTable('sub_sub_menu_items', {
	id: id(),
	subMenuItemId: str().notNull(),
	name: str().notNull(),
	priority: bit().notNull(),
	createdAt: ts().notNull(),
	updatedAt: ts().notNull()
});

export const roles = mssqlTable('roles', {
	id: id(),
	name: str().notNull(),
	permissions: str('max').notNull(),
	createdAt: ts().notNull(),
	updatedAt: ts().notNull()
});

export const bankSettings = mssqlTable('settings', {
	id: id(),
	companyType: str().notNull(),
	companyName: str().notNull(),
	email: str().notNull(),
	contact: str().notNull(),
	address: str().notNull(),
	timezone: str(),
	defaultLanguage: str(),
	notificationText: str().notNull(),
	logoImage: str(),
	password: str().notNull(),
	createdAt: ts().notNull(),
	updatedAt: ts().notNull()
});

export const users = mssqlTable(
	'users',
	{
		id: id(),
		firstName: str(),
		lastName: str(),
		email: str().notNull(),
		username: str().notNull(),
		image: str(),
		password: str(),
		roleId: str(),
		branchId: str(),
		status: bit().notNull(),
		activeSessionToken: str(),
		lastSessionAt: ts(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [
		uniqueIndex('users_email_key').on(t.email),
		uniqueIndex('users_username_key').on(t.username),
		index('users_activeSessionToken_idx').on(t.activeSessionToken)
	]
);

export const counters = mssqlTable(
	'counters',
	{
		id: id(),
		userId: str().notNull(),
		counterNumber: int().notNull(),
		queueId: str().notNull(),
		subItemId: str(),
		subSubItemId: str(),
		branchId: str().notNull(),
		available: bit().notNull(),
		unavailableReason: str(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [
		index('counters_subItemId_idx').on(t.subItemId),
		index('counters_subSubItemId_idx').on(t.subSubItemId)
	]
);

export const banktickets = mssqlTable(
	'banktickets',
	{
		id: id(),
		ticketNo: str().notNull(),
		queueId: str().notNull(),
		subItemId: str(),
		subSubItemId: str(),
		issueDescription: str().notNull(),
		rating: tinyint(),
		ratingComment: str(),
		justifyReason: str(),
		ticketStatus: str().notNull(),
		counterId: str(),
		currentServiceId: str(),
		pendingRedirectAcceptance: bit().notNull(),
		branchId: str().notNull(),
		callAgain: bit().notNull(),
		language: str().notNull(),
		phoneNumber: str(),
		templateId: str(),
		oldContacts: str('max'),
		multipleTransactions: str('max'),
		notServedAt: ts().notNull(),
		servedAt: ts(),
		notServedDuration: int().notNull(),
		servingDuration: int().notNull(),
		holdDuration: int().notNull(),
		totalDuration: int().notNull(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [
		index('banktickets_currentServiceId_idx').on(t.currentServiceId),
		index('banktickets_branchId_ticketStatus_createdAt_idx').on(
			t.branchId,
			t.ticketStatus,
			t.createdAt
		),
		index('banktickets_counterId_ticketStatus_createdAt_idx').on(
			t.counterId,
			t.ticketStatus,
			t.createdAt
		)
	]
);

export const ticketServices = mssqlTable(
	'ticket_services',
	{
		id: id(),
		ticketId: str().notNull(),
		sequence: int().notNull(),
		ticketStatus: str().notNull(),
		counterId: str(),
		userId: str(),
		queueId: str(),
		subItemId: str(),
		subSubItemId: str(),
		startedAt: ts().notNull(),
		endedAt: ts(),
		duration: int().notNull(),
		holdComment: str(),
		redirectedFromCounterId: str(),
		redirectedToCounterId: str(),
		endReason: str(),
		sessionId: str(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [
		uniqueIndex('ticket_services_ticketId_sequence_key').on(t.ticketId, t.sequence),
		index('ticket_services_ticketId_endedAt_idx').on(t.ticketId, t.endedAt),
		index('ticket_services_counterId_ticketStatus_endedAt_idx').on(
			t.counterId,
			t.ticketStatus,
			t.endedAt
		),
		index('ticket_services_sessionId_idx').on(t.sessionId)
	]
);

export const counterAvailabilityEvents = mssqlTable(
	'counter_availability_events',
	{
		id: id(),
		counterId: str().notNull(),
		eventType: str().notNull(),
		reason: str(),
		at: ts().notNull(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [index('counter_availability_events_counterId_at_idx').on(t.counterId, t.at)]
);

export const ticketAnnouncements = mssqlTable(
	'ticket_announcements',
	{
		id: id(),
		ticketId: str().notNull(),
		ticketNo: str().notNull(),
		branchId: str().notNull(),
		counterId: str(),
		counterNumber: int(),
		announcementType: str().notNull(),
		language: str().notNull(),
		attemptNumber: int().notNull(),
		status: str().notNull(),
		playStartedAt: ts(),
		playCompletedAt: ts(),
		errorMessage: str('max'),
		ticketStatus: str().notNull(),
		callAgain: bit().notNull(),
		previousStatus: str(),
		hallDisplayId: str(),
		audioFiles: str('max'),
		duration: int(),
		queuedAt: ts().notNull(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [
		index('ticket_announcements_ticketId_idx').on(t.ticketId),
		index('ticket_announcements_branchId_idx').on(t.branchId),
		index('ticket_announcements_status_idx').on(t.status),
		index('ticket_announcements_queuedAt_idx').on(t.queuedAt),
		index('ticket_announcements_ticketId_attemptNumber_idx').on(t.ticketId, t.attemptNumber)
	]
);

export const logs = mssqlTable('logs', {
	id: id(),
	userId: str(),
	action: str().notNull(),
	details: str().notNull(),
	createdAt: ts().notNull(),
	updatedAt: ts().notNull()
});

export const userSessions = mssqlTable(
	'user_sessions',
	{
		id: id(),
		userId: str(),
		actorType: str().notNull(),
		branchId: str(),
		counterId: str(),
		loginMethod: str(),
		startedAt: ts().notNull(),
		endedAt: ts(),
		endReason: str(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [
		index('user_sessions_userId_startedAt_idx').on(t.userId, t.startedAt),
		index('user_sessions_branchId_startedAt_idx').on(t.branchId, t.startedAt),
		index('user_sessions_actorType_startedAt_idx').on(t.actorType, t.startedAt)
	]
);

export const auditLogs = mssqlTable(
	'audit_logs',
	{
		id: id(),
		collectionName: str().notNull(),
		documentId: str(),
		operation: str().notNull(),
		userId: str(),
		performedBy: str(),
		description: str(),
		before: str('max'),
		after: str('max'),
		metadata: str('max'),
		sessionId: str(),
		actorType: str(),
		category: str(),
		action: str(),
		outcome: str(),
		branchId: str(),
		ticketId: str(),
		ticketServiceId: str(),
		counterId: str(),
		createdAt: ts().notNull(),
		updatedAt: ts().notNull()
	},
	(t) => [
		index('audit_logs_sessionId_createdAt_idx').on(t.sessionId, t.createdAt),
		index('audit_logs_userId_createdAt_idx').on(t.userId, t.createdAt),
		index('audit_logs_action_createdAt_idx').on(t.action, t.createdAt),
		index('audit_logs_branchId_createdAt_idx').on(t.branchId, t.createdAt),
		index('audit_logs_ticketId_idx').on(t.ticketId),
		index('audit_logs_category_createdAt_idx').on(t.category, t.createdAt)
	]
);

export const announcementTypes = mssqlTable('announcement_types', {
	id: id(),
	name: str().notNull(),
	backgroundColor: str().notNull(),
	textColor: str().notNull(),
	createdAt: ts().notNull()
});

export const announcements = mssqlTable('announcements', {
	id: id(),
	text: str().notNull(),
	type: str(),
	isActive: bit().notNull(),
	createdAt: ts().notNull()
});

export const socialMedia = mssqlTable('social_media', {
	id: id(),
	platform: str().notNull(),
	handle: str().notNull(),
	createdAt: ts().notNull()
});

/** Last ticket sequence handed out per branch per EAT calendar day; advanced atomically in SQL. */
export const ticketCounters = mssqlTable(
	'ticket_counters',
	{
		branchId: nvarchar({ length: 64 }).notNull(),
		day: nvarchar({ length: 10 }).notNull(),
		lastNumber: int().notNull()
	},
	(t) => [primaryKey({ columns: [t.branchId, t.day] })]
);
