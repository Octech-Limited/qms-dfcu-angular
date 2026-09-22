export function validateUgandanPhoneNumber(phoneNumber: string): {
	isValid: boolean;
	normalizedNumber?: string;
	error?: string;
} {
	const digits = phoneNumber.replace(/\D/g, '');
	let normalized = digits;
	if (normalized.startsWith('256')) {
		// already international
	} else if (normalized.startsWith('0')) {
		normalized = '256' + normalized.slice(1);
	} else if (normalized.length === 9) {
		normalized = '256' + normalized;
	}
	if (!/^2567\d{8}$/.test(normalized) && !/^2563\d{8}$/.test(normalized)) {
		return { isValid: false, error: 'Enter a valid Ugandan mobile number' };
	}
	return { isValid: true, normalizedNumber: normalized };
}
