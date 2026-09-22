import bcrypt from 'bcryptjs';

export function validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];
	if (!password || password.length < 8) errors.push('Password must be at least 8 characters');
	if (password.length > 128) errors.push('Password exceeds maximum length');
	if (!/[A-Z]/.test(password)) errors.push('Password must include an uppercase letter');
	if (!/[a-z]/.test(password)) errors.push('Password must include a lowercase letter');
	if (!/[0-9]/.test(password)) errors.push('Password must include a number');
	if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must include a special character');
	return { isValid: errors.length === 0, errors };
}

export async function hashPassword(password: string, validateStrength = true): Promise<string> {
	if (validateStrength) {
		const validation = validatePasswordStrength(password);
		if (!validation.isValid) throw new Error(validation.errors.join('; '));
	}
	return bcrypt.hash(password, 10);
}

export async function comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
	return bcrypt.compare(plainPassword, hashedPassword);
}
