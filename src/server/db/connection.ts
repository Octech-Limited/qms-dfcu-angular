import type { config as MsSqlConfig } from 'mssql';

/**
 * Accepts the Prisma-style SQL Server URL used by dfuQms-updated:
 * sqlserver://host:port;database=...;user=...;password=...;encrypt=true;trustServerCertificate=true
 *
 * Also accepts a standard mssql:// URL or a raw ADO connection string.
 */
export function parseSqlServerUrl(url: string): MsSqlConfig {
	const trimmed = url.trim();

	if (trimmed.startsWith('sqlserver://')) {
		const withoutProtocol = trimmed.slice('sqlserver://'.length);
		const firstSemi = withoutProtocol.indexOf(';');
		const hostPort = firstSemi === -1 ? withoutProtocol : withoutProtocol.slice(0, firstSemi);
		const paramsPart = firstSemi === -1 ? '' : withoutProtocol.slice(firstSemi + 1);
		const [server, portRaw] = hostPort.split(':');
		const params: Record<string, string> = {};

		for (const part of paramsPart.split(';')) {
			if (!part) continue;
			const eq = part.indexOf('=');
			if (eq === -1) continue;
			params[part.slice(0, eq).toLowerCase()] = part.slice(eq + 1);
		}

		return {
			server,
			port: portRaw ? Number(portRaw) : 1433,
			database: params.database,
			user: params.user,
			password: params.password,
			options: {
				encrypt: params.encrypt !== 'false',
				trustServerCertificate: params.trustservercertificate === 'true'
			}
		};
	}

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol === 'mssql:' || parsed.protocol === 'sqlserver:') {
			return {
				user: decodeURIComponent(parsed.username),
				password: decodeURIComponent(parsed.password),
				server: parsed.hostname,
				port: parsed.port ? Number(parsed.port) : 1433,
				database: parsed.pathname.replace(/^\//, ''),
				options: {
					encrypt: parsed.searchParams.get('encrypt') !== 'false',
					trustServerCertificate:
						parsed.searchParams.get('trustServerCertificate') === 'true'
				}
			};
		}
	} catch {
		// Fall through to ADO string
	}

	throw new Error(
		`Unrecognized DATABASE_URL. Use a Prisma-style sqlserver://host:port;database=...;user=...;password=... string.`
	);
}
