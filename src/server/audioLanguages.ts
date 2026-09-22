import { readdir } from 'node:fs/promises';
import path from 'node:path';

const AUDIO_ROOT = path.join(process.cwd(), 'public', 'audio');
export const MAX_TICKET_LANGUAGE_LENGTH = 1000;

export async function getAudioLanguageDirNames(): Promise<string[]> {
	try {
		const entries = await readdir(AUDIO_ROOT, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
			.map((e) => e.name)
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

export function isValidTicketLanguageString(value: string, audioDirNames: string[]): boolean {
	if (typeof value !== 'string' || value.length > MAX_TICKET_LANGUAGE_LENGTH) return false;
	const allowed = new Set(['English', 'Luganda', ...audioDirNames]);
	const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
	return parts.length > 0 && parts.every((p) => allowed.has(p));
}
