export interface LdapConfig {
	url: string;
	baseDN: string;
	domain: string;
	timeout: number;
	connectTimeout: number;
	tlsOptions: { rejectUnauthorized: boolean };
}

export function getLdapConfig(): LdapConfig {
	return {
		url: process.env['LDAP_URL'] || 'ldaps://HQ-SRV-AD-01.dfcugroup.com',
		baseDN: process.env['LDAP_BASE_DN'] || 'dc=dfcugroup,dc=com',
		domain: process.env['LDAP_DOMAIN'] || 'dfcugroup.com',
		timeout: parseInt(process.env['LDAP_TIMEOUT'] || '5000', 10),
		connectTimeout: parseInt(process.env['LDAP_CONNECT_TIMEOUT'] || '10000', 10),
		tlsOptions: {
			rejectUnauthorized: process.env['LDAP_REJECT_UNAUTHORIZED'] !== 'false'
		}
	};
}

export function isLdapEnabled(): boolean {
	return (
		process.env['AUTH_METHOD'] === 'ldap' ||
		process.env['AUTH_METHOD'] === 'hybrid' ||
		process.env['USE_LDAP'] === 'true'
	);
}
