import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-mssql';
import sql from 'mssql';
import { parseSqlServerUrl } from './connection';
import * as schema from './schema';
import { instrumentMssql } from '../monitor/dbMonitor';

const url = process.env['DATABASE_URL'];
const config = url
	? parseSqlServerUrl(url)
	: {
			server: '127.0.0.1',
			user: 'extract',
			password: 'extract',
			database: 'extract',
			options: { encrypt: false, trustServerCertificate: true }
		};

const globalForDb = globalThis as unknown as {
	mssqlPool?: sql.ConnectionPool;
	drizzleDb?: ReturnType<typeof drizzle<typeof schema, sql.ConnectionPool>>;
};

const pool = globalForDb.mssqlPool ?? new sql.ConnectionPool(config);
globalForDb.mssqlPool = pool;
instrumentMssql(sql as never, pool as never);

export const db =
	globalForDb.drizzleDb ??
	drizzle({
		client: pool,
		schema
	});

if (process.env['NODE_ENV'] !== 'production') globalForDb.drizzleDb = db;

export function ensureDb() {
	if (pool.connected) return Promise.resolve(pool);
	return pool.connect();
}

export { schema };
