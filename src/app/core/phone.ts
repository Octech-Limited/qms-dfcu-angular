/** Client-side Ugandan phone helpers (aligned with dfuQms-updated/lib/phoneUtils). */

export function identifyTelco(phoneNumber: string): string {
  const normalizedNumber = phoneNumber.replace(/\D/g, '');
  let prefix: string;
  if (normalizedNumber.startsWith('256')) {
    prefix = normalizedNumber.substring(3, 5);
  } else if (normalizedNumber.startsWith('0')) {
    prefix = normalizedNumber.substring(1, 3);
  } else {
    prefix = normalizedNumber.substring(
      normalizedNumber.length - 10,
      normalizedNumber.length - 8,
    );
  }
  const mtnPrefixes = ['77', '78', '79', '76', '31', '39'];
  const airtelPrefixes = ['70', '75', '74', '20'];
  if (mtnPrefixes.includes(prefix)) return 'MTN';
  if (airtelPrefixes.includes(prefix)) return 'Airtel';
  return 'Unknown';
}

export function validateUgandanPhoneNumber(phoneNumber: string): {
  isValid: boolean;
  normalizedNumber: string;
  telco: string;
  error?: string;
} {
  const normalizedNumber = phoneNumber.replace(/\D/g, '');
  if (!normalizedNumber) {
    return {
      isValid: false,
      normalizedNumber: '',
      telco: 'Unknown',
      error: 'Phone number is required',
    };
  }

  let isValid = false;
  let error = '';
  if (normalizedNumber.startsWith('256') && normalizedNumber.length === 12) {
    isValid = true;
  } else if (normalizedNumber.startsWith('0') && normalizedNumber.length === 10) {
    isValid = true;
  } else if (normalizedNumber.length === 9) {
    isValid = true;
  } else {
    error = 'Invalid phone number format. Please use a valid Ugandan phone number.';
  }

  const telco = identifyTelco(normalizedNumber);
  if (isValid && telco === 'Unknown') {
    error = 'Phone number is not from a recognized Ugandan network (MTN or Airtel)';
    isValid = false;
  }

  return {
    isValid,
    normalizedNumber,
    telco,
    error: error || undefined,
  };
}
