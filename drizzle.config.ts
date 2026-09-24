import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { parseSqlServerUrl } from './src/server/db/connection';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');

const parsed = parseSqlServerUrl(url);
if (!parsed.server || !parsed.user || !parsed.password || !parsed.database) {
	throw new Error('DATABASE_URL is missing server, user, password, or database');
}

export default defineConfig({
	dialect: 'mssql',
	schema: './src/server/db/schema.ts',
	out: './drizzle',
	strict: true,
	dbCredentials: {
		server: parsed.server,
		port: parsed.port ?? 1433,
		user: parsed.user,
		password: parsed.password,
		database: parsed.database,
		options: {
			encrypt: parsed.options?.encrypt !== false,
			trustServerCertificate: parsed.options?.trustServerCertificate === true
		}
	}
});
