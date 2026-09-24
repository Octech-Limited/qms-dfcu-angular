import { randomBytes } from 'node:crypto';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEX = '0123456789abcdef';

// 12-bit counter so ids minted in the same millisecond still sort in creation order.
let lastTimestamp = 0;
let sequence = 0;

/** RFC 9562 UUID v7. The timestamp prefix makes string order match creation order. */
export function uuidV7(): string {
	let timestamp = Date.now();

	if (timestamp > lastTimestamp) {
		lastTimestamp = timestamp;
		sequence = 0;
	} else {
		timestamp = lastTimestamp;
		sequence += 1;
		if (sequence > 0x0fff) {
			lastTimestamp += 1;
			timestamp = lastTimestamp;
			sequence = 0;
		}
	}

	const bytes = new Uint8Array(16);
	let ts = timestamp;
	for (let i = 5; i >= 0; i--) {
		bytes[i] = ts % 256;
		ts = Math.floor(ts / 256);
	}

	bytes[6] = 0x70 | (sequence >> 8);
	bytes[7] = sequence & 0xff;

	const rand = randomBytes(8);
	bytes[8] = (rand[0] & 0x3f) | 0x80;
	bytes[9] = rand[1];
	bytes[10] = rand[2];
	bytes[11] = rand[3];
	bytes[12] = rand[4];
	bytes[13] = rand[5];
	bytes[14] = rand[6];
	bytes[15] = rand[7];

	let id = '';
	for (let i = 0; i < 16; i++) {
		id += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
		if (i === 3 || i === 5 || i === 7 || i === 9) id += '-';
	}
	return id;
}
