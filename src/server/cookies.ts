export function shouldUseSecureCookies(): boolean {
	if (process.env['COOKIE_SECURE'] !== undefined) {
		return process.env['COOKIE_SECURE'] === 'true';
	}
	return process.env['NODE_ENV'] === 'production';
}

export function sessionPassword(): string {
	return process.env['SESSION_PASSWORD'] || 'complex_password_at_least_32_characters_long';
}

export function oneMonthFromNow(): number {
	const now = new Date();
	return new Date(
		now.getFullYear(),
		now.getMonth() + 1,
		now.getDate(),
		now.getHours(),
		now.getMinutes(),
		now.getSeconds()
	).getTime();
}
