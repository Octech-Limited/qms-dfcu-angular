CREATE TABLE [ad_branches] (
	[id] nvarchar(1000),
	[adId] nvarchar(1000) NOT NULL,
	[branchId] nvarchar(1000) NOT NULL,
	CONSTRAINT [ad_branches_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [ads] (
	[id] nvarchar(1000),
	[name] nvarchar(1000) NOT NULL,
	[image] nvarchar(1000),
	[video] nvarchar(1000),
	[youtubeUrl] nvarchar(1000),
	[isLive] bit NOT NULL,
	[validFrom] datetime2,
	[validUntil] datetime2,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [ads_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [announcement_types] (
	[id] nvarchar(1000),
	[name] nvarchar(1000) NOT NULL,
	[backgroundColor] nvarchar(1000) NOT NULL,
	[textColor] nvarchar(1000) NOT NULL,
	[createdAt] datetime2 NOT NULL,
	CONSTRAINT [announcement_types_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [announcements] (
	[id] nvarchar(1000),
	[text] nvarchar(1000) NOT NULL,
	[type] nvarchar(1000),
	[isActive] bit NOT NULL,
	[createdAt] datetime2 NOT NULL,
	CONSTRAINT [announcements_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [audit_logs] (
	[id] nvarchar(1000),
	[collectionName] nvarchar(1000) NOT NULL,
	[documentId] nvarchar(1000),
	[operation] nvarchar(1000) NOT NULL,
	[userId] nvarchar(1000),
	[performedBy] nvarchar(1000),
	[description] nvarchar(1000),
	[before] nvarchar(max),
	[after] nvarchar(max),
	[metadata] nvarchar(max),
	[sessionId] nvarchar(1000),
	[actorType] nvarchar(1000),
	[category] nvarchar(1000),
	[action] nvarchar(1000),
	[outcome] nvarchar(1000),
	[branchId] nvarchar(1000),
	[ticketId] nvarchar(1000),
	[ticketServiceId] nvarchar(1000),
	[counterId] nvarchar(1000),
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [audit_logs_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [settings] (
	[id] nvarchar(1000),
	[companyType] nvarchar(1000) NOT NULL,
	[companyName] nvarchar(1000) NOT NULL,
	[email] nvarchar(1000) NOT NULL,
	[contact] nvarchar(1000) NOT NULL,
	[address] nvarchar(1000) NOT NULL,
	[timezone] nvarchar(1000),
	[defaultLanguage] nvarchar(1000),
	[notificationText] nvarchar(1000) NOT NULL,
	[logoImage] nvarchar(1000),
	[password] nvarchar(1000) NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [settings_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [banktickets] (
	[id] nvarchar(1000),
	[ticketNo] nvarchar(1000) NOT NULL,
	[queueId] nvarchar(1000) NOT NULL,
	[subItemId] nvarchar(1000),
	[subSubItemId] nvarchar(1000),
	[issueDescription] nvarchar(1000) NOT NULL,
	[rating] tinyint,
	[ratingComment] nvarchar(1000),
	[justifyReason] nvarchar(1000),
	[ticketStatus] nvarchar(1000) NOT NULL,
	[counterId] nvarchar(1000),
	[currentServiceId] nvarchar(1000),
	[pendingRedirectAcceptance] bit NOT NULL,
	[branchId] nvarchar(1000) NOT NULL,
	[callAgain] bit NOT NULL,
	[language] nvarchar(1000) NOT NULL,
	[phoneNumber] nvarchar(1000),
	[templateId] nvarchar(1000),
	[oldContacts] nvarchar(max),
	[multipleTransactions] nvarchar(max),
	[notServedAt] datetime2 NOT NULL,
	[servedAt] datetime2,
	[notServedDuration] int NOT NULL,
	[servingDuration] int NOT NULL,
	[holdDuration] int NOT NULL,
	[totalDuration] int NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [banktickets_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [branches] (
	[id] nvarchar(1000),
	[name] nvarchar(1000) NOT NULL,
	[address] nvarchar(1000) NOT NULL,
	[localNetworkAddress] nvarchar(1000),
	[databaseHost] nvarchar(1000),
	[databaseName] nvarchar(1000),
	[databaseUser] nvarchar(1000),
	[databasePassword] nvarchar(1000),
	[kioskUsername] nvarchar(1000),
	[kioskPassword] nvarchar(1000),
	[kioskIpAddress] nvarchar(1000),
	[platform] nvarchar(1000),
	[hallDisplayUsername] nvarchar(1000) NOT NULL,
	[hallDisplayPassword] nvarchar(1000) NOT NULL,
	[status] bit NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [branches_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [counter_availability_events] (
	[id] nvarchar(1000),
	[counterId] nvarchar(1000) NOT NULL,
	[eventType] nvarchar(1000) NOT NULL,
	[reason] nvarchar(1000),
	[at] datetime2 NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [counter_availability_events_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [counters] (
	[id] nvarchar(1000),
	[userId] nvarchar(1000) NOT NULL,
	[counterNumber] int NOT NULL,
	[queueId] nvarchar(1000) NOT NULL,
	[subItemId] nvarchar(1000),
	[subSubItemId] nvarchar(1000),
	[branchId] nvarchar(1000) NOT NULL,
	[available] bit NOT NULL,
	[unavailableReason] nvarchar(1000),
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [counters_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [exchange_rates] (
	[id] nvarchar(1000),
	[countryName] nvarchar(1000) NOT NULL,
	[countryCode] nvarchar(1000) NOT NULL,
	[currencyCode] nvarchar(1000) NOT NULL,
	[buyingRate] float NOT NULL,
	[sellingRate] float NOT NULL,
	[displayOrder] int NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [exchange_rates_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [logs] (
	[id] nvarchar(1000),
	[userId] nvarchar(1000),
	[action] nvarchar(1000) NOT NULL,
	[details] nvarchar(1000) NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [logs_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [queue_branches] (
	[id] nvarchar(1000),
	[queueId] nvarchar(1000) NOT NULL,
	[branchId] nvarchar(1000) NOT NULL,
	CONSTRAINT [queue_branches_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [queues] (
	[id] nvarchar(1000),
	[name] nvarchar(1000) NOT NULL,
	[status] int NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [queues_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [roles] (
	[id] nvarchar(1000),
	[name] nvarchar(1000) NOT NULL,
	[permissions] nvarchar(max) NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [roles_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [social_media] (
	[id] nvarchar(1000),
	[platform] nvarchar(1000) NOT NULL,
	[handle] nvarchar(1000) NOT NULL,
	[createdAt] datetime2 NOT NULL,
	CONSTRAINT [social_media_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [sub_menu_items] (
	[id] nvarchar(1000),
	[queueId] nvarchar(1000) NOT NULL,
	[name] nvarchar(1000) NOT NULL,
	[priority] bit NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [sub_menu_items_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [sub_sub_menu_items] (
	[id] nvarchar(1000),
	[subMenuItemId] nvarchar(1000) NOT NULL,
	[name] nvarchar(1000) NOT NULL,
	[priority] bit NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [sub_sub_menu_items_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [ticket_announcements] (
	[id] nvarchar(1000),
	[ticketId] nvarchar(1000) NOT NULL,
	[ticketNo] nvarchar(1000) NOT NULL,
	[branchId] nvarchar(1000) NOT NULL,
	[counterId] nvarchar(1000),
	[counterNumber] int,
	[announcementType] nvarchar(1000) NOT NULL,
	[language] nvarchar(1000) NOT NULL,
	[attemptNumber] int NOT NULL,
	[status] nvarchar(1000) NOT NULL,
	[playStartedAt] datetime2,
	[playCompletedAt] datetime2,
	[errorMessage] nvarchar(max),
	[ticketStatus] nvarchar(1000) NOT NULL,
	[callAgain] bit NOT NULL,
	[previousStatus] nvarchar(1000),
	[hallDisplayId] nvarchar(1000),
	[audioFiles] nvarchar(max),
	[duration] int,
	[queuedAt] datetime2 NOT NULL,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [ticket_announcements_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [ticket_services] (
	[id] nvarchar(1000),
	[ticketId] nvarchar(1000) NOT NULL,
	[sequence] int NOT NULL,
	[ticketStatus] nvarchar(1000) NOT NULL,
	[counterId] nvarchar(1000),
	[userId] nvarchar(1000),
	[queueId] nvarchar(1000),
	[subItemId] nvarchar(1000),
	[subSubItemId] nvarchar(1000),
	[startedAt] datetime2 NOT NULL,
	[endedAt] datetime2,
	[duration] int NOT NULL,
	[holdComment] nvarchar(1000),
	[redirectedFromCounterId] nvarchar(1000),
	[redirectedToCounterId] nvarchar(1000),
	[endReason] nvarchar(1000),
	[sessionId] nvarchar(1000),
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [ticket_services_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [user_sessions] (
	[id] nvarchar(1000),
	[userId] nvarchar(1000),
	[actorType] nvarchar(1000) NOT NULL,
	[branchId] nvarchar(1000),
	[counterId] nvarchar(1000),
	[loginMethod] nvarchar(1000),
	[startedAt] datetime2 NOT NULL,
	[endedAt] datetime2,
	[endReason] nvarchar(1000),
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [user_sessions_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
CREATE TABLE [users] (
	[id] nvarchar(1000),
	[firstName] nvarchar(1000),
	[lastName] nvarchar(1000),
	[email] nvarchar(1000) NOT NULL,
	[username] nvarchar(1000) NOT NULL,
	[image] nvarchar(1000),
	[password] nvarchar(1000),
	[roleId] nvarchar(1000),
	[branchId] nvarchar(1000),
	[status] bit NOT NULL,
	[activeSessionToken] nvarchar(1000),
	[lastSessionAt] datetime2,
	[createdAt] datetime2 NOT NULL,
	[updatedAt] datetime2 NOT NULL,
	CONSTRAINT [users_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
ALTER TABLE [queue_branches] ADD CONSTRAINT [queue_branches_queueId_queues_id_fk] FOREIGN KEY ([queueId]) REFERENCES [queues]([id]);--> statement-breakpoint
ALTER TABLE [queue_branches] ADD CONSTRAINT [queue_branches_branchId_branches_id_fk] FOREIGN KEY ([branchId]) REFERENCES [branches]([id]);--> statement-breakpoint
CREATE UNIQUE INDEX [ad_branches_adId_branchId_key] ON [ad_branches] ([adId],[branchId]);--> statement-breakpoint
CREATE INDEX [audit_logs_sessionId_createdAt_idx] ON [audit_logs] ([sessionId],[createdAt]);--> statement-breakpoint
CREATE INDEX [audit_logs_userId_createdAt_idx] ON [audit_logs] ([userId],[createdAt]);--> statement-breakpoint
CREATE INDEX [audit_logs_action_createdAt_idx] ON [audit_logs] ([action],[createdAt]);--> statement-breakpoint
CREATE INDEX [audit_logs_branchId_createdAt_idx] ON [audit_logs] ([branchId],[createdAt]);--> statement-breakpoint
CREATE INDEX [audit_logs_ticketId_idx] ON [audit_logs] ([ticketId]);--> statement-breakpoint
CREATE INDEX [audit_logs_category_createdAt_idx] ON [audit_logs] ([category],[createdAt]);--> statement-breakpoint
CREATE INDEX [banktickets_currentServiceId_idx] ON [banktickets] ([currentServiceId]);--> statement-breakpoint
CREATE INDEX [banktickets_branchId_ticketStatus_createdAt_idx] ON [banktickets] ([branchId],[ticketStatus],[createdAt]);--> statement-breakpoint
CREATE INDEX [banktickets_counterId_ticketStatus_createdAt_idx] ON [banktickets] ([counterId],[ticketStatus],[createdAt]);--> statement-breakpoint
CREATE INDEX [counter_availability_events_counterId_at_idx] ON [counter_availability_events] ([counterId],[at]);--> statement-breakpoint
CREATE INDEX [counters_subItemId_idx] ON [counters] ([subItemId]);--> statement-breakpoint
CREATE INDEX [counters_subSubItemId_idx] ON [counters] ([subSubItemId]);--> statement-breakpoint
CREATE INDEX [exchange_rates_displayOrder_idx] ON [exchange_rates] ([displayOrder]);--> statement-breakpoint
CREATE UNIQUE INDEX [queue_branches_queueId_branchId_key] ON [queue_branches] ([queueId],[branchId]);--> statement-breakpoint
CREATE INDEX [ticket_announcements_ticketId_idx] ON [ticket_announcements] ([ticketId]);--> statement-breakpoint
CREATE INDEX [ticket_announcements_branchId_idx] ON [ticket_announcements] ([branchId]);--> statement-breakpoint
CREATE INDEX [ticket_announcements_status_idx] ON [ticket_announcements] ([status]);--> statement-breakpoint
CREATE INDEX [ticket_announcements_queuedAt_idx] ON [ticket_announcements] ([queuedAt]);--> statement-breakpoint
CREATE INDEX [ticket_announcements_ticketId_attemptNumber_idx] ON [ticket_announcements] ([ticketId],[attemptNumber]);--> statement-breakpoint
CREATE UNIQUE INDEX [ticket_services_ticketId_sequence_key] ON [ticket_services] ([ticketId],[sequence]);--> statement-breakpoint
CREATE INDEX [ticket_services_ticketId_endedAt_idx] ON [ticket_services] ([ticketId],[endedAt]);--> statement-breakpoint
CREATE INDEX [ticket_services_counterId_ticketStatus_endedAt_idx] ON [ticket_services] ([counterId],[ticketStatus],[endedAt]);--> statement-breakpoint
CREATE INDEX [ticket_services_sessionId_idx] ON [ticket_services] ([sessionId]);--> statement-breakpoint
CREATE INDEX [user_sessions_userId_startedAt_idx] ON [user_sessions] ([userId],[startedAt]);--> statement-breakpoint
CREATE INDEX [user_sessions_branchId_startedAt_idx] ON [user_sessions] ([branchId],[startedAt]);--> statement-breakpoint
CREATE INDEX [user_sessions_actorType_startedAt_idx] ON [user_sessions] ([actorType],[startedAt]);--> statement-breakpoint
CREATE UNIQUE INDEX [users_email_key] ON [users] ([email]);--> statement-breakpoint
CREATE UNIQUE INDEX [users_username_key] ON [users] ([username]);--> statement-breakpoint
CREATE INDEX [users_activeSessionToken_idx] ON [users] ([activeSessionToken]);