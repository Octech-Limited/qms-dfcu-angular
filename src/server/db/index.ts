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

/** Positive integer from env, or undefined so the mssql/tarn default stays in effect. */
function envInt(name: string): number | undefined {
	const raw = process.env[name]?.trim();
	if (!raw) return undefined;
	const value = Number(raw);
	return Number.isInteger(value) && value >= 0 ? value : undefined;
}

const poolOverrides = {
	max: envInt('DB_POOL_MAX'),
	min: envInt('DB_POOL_MIN'),
	idleTimeoutMillis: envInt('DB_POOL_IDLE_TIMEOUT_MS'),
	acquireTimeoutMillis: envInt('DB_POOL_ACQUIRE_TIMEOUT_MS'),
	createTimeoutMillis: envInt('DB_POOL_CREATE_TIMEOUT_MS')
};
const poolConfig = Object.fromEntries(Object.entries(poolOverrides).filter(([, v]) => v !== undefined));
const requestTimeout = envInt('DB_REQUEST_TIMEOUT_MS');
const connectionTimeout = envInt('DB_CONNECTION_TIMEOUT_MS');

const globalForDb = globalThis as unknown as {
	mssqlPool?: sql.ConnectionPool;
	drizzleDb?: ReturnType<typeof drizzle<typeof schema, sql.ConnectionPool>>;
};

const pool =
	globalForDb.mssqlPool ??
	new sql.ConnectionPool({
		...config,
		...(requestTimeout !== undefined && { requestTimeout }),
		...(connectionTimeout !== undefined && { connectionTimeout }),
		pool: { ...config.pool, ...poolConfig }
	});
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
