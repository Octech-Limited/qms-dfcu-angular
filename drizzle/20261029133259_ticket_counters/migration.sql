CREATE TABLE [ticket_counters] (
	[branchId] nvarchar(64),
	[day] nvarchar(10),
	[lastNumber] int NOT NULL,
	CONSTRAINT [ticket_counters_pkey] PRIMARY KEY([branchId],[day])
);
