import http from 'node:http';
import https from 'node:https';
import { logger } from './logger';

/**
 * VMS (vmsapi.nesscom.net) SMS gateway — always used (no D-Mark).
 *
 * Required env:
 *   SMS_API_KEY    — VMS API key (header x-api-key)
 *   SMS_SENDER_ID  — sender id / short code (e.g. "7787")
 *   SMS_ENDPOINT   — full POST URL (e.g. https://vmsapi.nesscom.net:9443/send)
 * Optional:
 *   VERIFY_TLS     — "false" to skip TLS cert verification (default: verify)
 *   FEEDBACK_URL / APP_URL / ORIGIN — base URL for rating links in SMS
 */

const SMS_TIMEOUT_MS = 12_000;

interface SMSResponse {
	success: boolean;
	result?: string;
	messageLength?: number;
	error?: string;
}

function verifyTls(): boolean {
	return (process.env['VERIFY_TLS'] || '').toLowerCase() !== 'false';
}

/**
 * POST JSON via node:http / node:https so HTTPS can set rejectUnauthorized.
 * Node's global fetch (undici) cannot disable certificate verification per request.
 */
function postJson(
	urlString: string,
	body: unknown,
	headers: Record<string, string>,
	options?: { rejectUnauthorized?: boolean }
): Promise<{ statusCode: number; body: string }> {
	const payload = JSON.stringify(body);
	const url = new URL(urlString);
	const isHttps = url.protocol === 'https:';
	const lib = isHttps ? https : http;
	const requestOptions: https.RequestOptions = {
		protocol: url.protocol,
		hostname: url.hostname,
		port: url.port || (isHttps ? 443 : 80),
		path: `${url.pathname}${url.search}`,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(payload),
			...headers
		}
	};
	if (isHttps) requestOptions.rejectUnauthorized = options?.rejectUnauthorized ?? true;
	return new Promise((resolve, reject) => {
		const req = lib.request(requestOptions, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk) => chunks.push(chunk as Buffer));
			res.on('end', () => {
				resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
			});
		});
		req.on('error', reject);
		req.setTimeout(SMS_TIMEOUT_MS, () => req.destroy(new Error('SMS request timed out')));
		req.write(payload);
		req.end();
	});
}

class SMSService {
	/** Always routes through the VMS gateway. */
	async sendSMS(message: string, phoneNumber: string): Promise<SMSResponse> {
		const normalizedNumber = this.normalizePhoneNumber(phoneNumber);
		return this.sendViaVmsApi(message, normalizedNumber);
	}

	async sendTicketNotification(
		ticketNumber: string,
		phoneNumber: string,
		peopleAhead: number,
		companyName?: string,
		branchName?: string,
		issueDescription?: string
	): Promise<SMSResponse> {
		let message = 'Dear Customer,\n\n';
		message += `Your queue ticket is ${ticketNumber}.\n\n`;
		if (issueDescription) message += `Service: ${issueDescription}\n\n`;
		if (peopleAhead === 0) message += 'Please be ready to be served!\n';
		else {
			message += `There ${peopleAhead === 1 ? 'is' : 'are'} ${peopleAhead} ${
				peopleAhead === 1 ? 'person' : 'people'
			} ahead of you. Thank you for your patience.\n`;
		}
		if (companyName || branchName) {
			message += '\n' + [companyName, branchName].filter(Boolean).join(' - ');
		}
		return this.sendSMS(message, phoneNumber);
	}

	async sendRatingRequest(
		ticketId: string,
		phoneNumber: string,
		companyName?: string,
		branchName?: string
	): Promise<SMSResponse> {
		const base =
			process.env['FEEDBACK_URL'] || process.env['APP_URL'] || process.env['ORIGIN'] || '';
		if (!base) {
			logger.warn('FEEDBACK_URL/APP_URL/ORIGIN not configured, skipping SMS rating request');
			return { success: false, error: 'FEEDBACK_URL/APP_URL missing' };
		}
		const ratingUrl = `${base.replace(/\/$/, '')}/rating/${ticketId}`;
		let message = 'Dear Customer,\n\n';
		message += 'Thank you for your service!\n\n';
		message += `Please rate your experience: ${ratingUrl}\n`;
		if (companyName || branchName) {
			message += '\n' + [companyName, branchName].filter(Boolean).join(' - ');
		}
		return this.sendSMS(message, phoneNumber);
	}

	private async sendViaVmsApi(message: string, normalizedNumber: string): Promise<SMSResponse> {
		try {
			const apiKey = process.env['SMS_API_KEY'] || '';
			const senderId = process.env['SMS_SENDER_ID'] || '';
			const endpoint = process.env['SMS_ENDPOINT'] || '';
			if (!apiKey || !senderId || !endpoint) {
				return {
					success: false,
					error: 'SMS_API_KEY/SMS_SENDER_ID/SMS_ENDPOINT are not configured'
				};
			}
			const { statusCode, body } = await postJson(
				endpoint,
				{ senderId, message, contact: normalizedNumber },
				{ 'x-api-key': apiKey },
				{ rejectUnauthorized: verifyTls() }
			);
			if (statusCode < 200 || statusCode >= 300) {
				return { success: false, error: `HTTP ${statusCode}: ${body}` };
			}
			return { success: true, result: body, messageLength: message.length };
		} catch (error) {
			logger.error('SMS sending failed (vmsapi):', error);
			return this.toErrorResponse(error);
		}
	}

	private toErrorResponse(error: unknown): SMSResponse {
		const isTimeout =
			error instanceof Error &&
			(error.name === 'TimeoutError' ||
				error.name === 'AbortError' ||
				error.message === 'SMS request timed out');
		return {
			success: false,
			error: isTimeout
				? 'SMS request timed out'
				: error instanceof Error
					? error.message
					: 'Unknown error occurred'
		};
	}

	private normalizePhoneNumber(phoneNumber: string): string {
		const normalized = phoneNumber.replace(/\D/g, '');
		if (normalized.startsWith('256')) return normalized;
		if (normalized.startsWith('0')) return '256' + normalized.substring(1);
		if (normalized.length === 9) return '256' + normalized;
		return normalized;
	}
}

export const smsService = new SMSService();
