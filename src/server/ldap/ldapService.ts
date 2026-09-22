import ldap from 'ldapjs';
import { getLdapConfig } from './config';

export interface LdapUser {
	username: string;
	distinguishedName: string;
	firstName: string;
	lastName: string;
	email: string;
	groups: string[];
}

export interface LdapAuthResult {
	success: boolean;
	user?: LdapUser;
	message?: string;
}

function escapeLDAPFilter(str: string): string {
	return str
		.replace(/\\/g, '\\5c')
		.replace(/\(/g, '\\28')
		.replace(/\)/g, '\\29')
		.replace(/\*/g, '\\2a')
		.replace(/\//g, '\\2f');
}

function extractGroupMemberships(memberOf: string | string[]): string[] {
	if (!memberOf) return [];
	const memberOfArray = Array.isArray(memberOf) ? memberOf : [memberOf];
	return memberOfArray
		.map((groupDN: string) => {
			const match = groupDN.match(/CN=([^,]+)/);
			return match ? match[1].trim() : '';
		})
		.filter(Boolean);
}

export async function authenticateLDAP(username: string, password: string): Promise<LdapAuthResult> {
	const config = getLdapConfig();
	return new Promise((resolve, reject) => {
		const userPrincipalName = username.includes('@') ? username : `${username}@${config.domain}`;
		const usernameOnly = username.split('@')[0];
		const escapedUsername = escapeLDAPFilter(usernameOnly);
		const client = ldap.createClient({
			url: config.url,
			timeout: config.timeout,
			connectTimeout: config.connectTimeout,
			tlsOptions: config.tlsOptions
		});
		let isResolved = false;
		client.on('error', (err: Error) => {
			if (!isResolved) {
				isResolved = true;
				client.unbind(() => {});
				reject(new Error(`LDAP connection failed: ${err.message}`));
			}
		});
		client.bind(userPrincipalName, password, (bindErr) => {
			if (bindErr) {
				if (!isResolved) {
					isResolved = true;
					client.unbind(() => {});
					const code = (bindErr as { code?: number }).code;
					if (code === 49) {
						resolve({ success: false, message: 'Binding failed: Invalid credentials' });
					} else if (code === 81) {
						resolve({ success: false, message: 'Binding failed: LDAP server unavailable' });
					} else {
						resolve({
							success: false,
							message: `Binding failed: ${bindErr.message || 'LDAP authentication failed'}`
						});
					}
				}
				return;
			}
			client.search(
				config.baseDN,
				{
					filter: `(sAMAccountName=${escapedUsername})`,
					scope: 'sub',
					attributes: [
						'distinguishedName',
						'memberOf',
						'cn',
						'sn',
						'givenName',
						'sAMAccountName',
						'mail',
						'userPrincipalName'
					]
				},
				(searchErr, res) => {
					if (searchErr) {
						if (!isResolved) {
							isResolved = true;
							client.unbind(() => {});
							resolve({
								success: true,
								user: {
									username: usernameOnly,
									distinguishedName: '',
									firstName: '',
									lastName: '',
									email: userPrincipalName,
									groups: []
								}
							});
						}
						return;
					}
					const entries: Array<Record<string, unknown>> = [];
					res.on('searchEntry', (entry) => {
						entries.push(entry.pojo as unknown as Record<string, unknown>);
					});
					res.on('error', () => {});
					res.on('end', () => {
						if (!isResolved) {
							isResolved = true;
							client.unbind(() => {});
							let ldapUser: LdapUser;
							if (entries.length > 0) {
								const userData = entries[0] ?? {};
								ldapUser = {
									username: (userData['sAMAccountName'] as string) || usernameOnly,
									distinguishedName: (userData['distinguishedName'] as string) || '',
									firstName: (userData['givenName'] as string) || '',
									lastName: (userData['sn'] as string) || '',
									email:
										(userData['mail'] as string) ||
										(userData['userPrincipalName'] as string) ||
										userPrincipalName,
									groups: extractGroupMemberships(
										(userData['memberOf'] as string | string[]) || []
									)
								};
							} else {
								ldapUser = {
									username: usernameOnly,
									distinguishedName: '',
									firstName: '',
									lastName: '',
									email: userPrincipalName,
									groups: []
								};
							}
							resolve({ success: true, user: ldapUser });
						}
					});
				}
			);
		});
	});
}
