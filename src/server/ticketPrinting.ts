import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { bankSettings, branches } from './db/schema';
import { logger } from './logger';
import { formatInEat } from './timezone';

const DEFAULT_PRINT_SERVER_URL = 'http://127.0.0.1:3002/print';
const DEFAULT_ESC_POS_PRINT_SERVER_URL = 'http://127.0.0.1:3003/print';

export async function convertImageToESCPOSBitmap(logoUrl: string): Promise<string | null> {
	try {
		const filenameMatch = /images\/(.+)$/.exec(logoUrl);
		if (!filenameMatch) {
			logger.error('Invalid logo URL format:', logoUrl);
			return null;
		}

		const filename = filenameMatch[1];
		const filePath = join(process.cwd(), 'uploads', filename);
		const imageBuffer = await readFile(filePath);
		const processedImage = await sharp(imageBuffer)
			.resize(300, null, { fit: 'inside', withoutEnlargement: true })
			.greyscale()
			.raw()
			.toBuffer({ resolveWithObject: true });

		const { data, info } = processedImage;
		const width = info.width;
		const height = info.height;
		const threshold = 128;
		const bitmapData: number[] = [];

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x += 8) {
				let byte = 0;
				for (let bit = 0; bit < 8; bit++) {
					if (x + bit < width) {
						const pixelIndex = y * width + (x + bit);
						const pixelValue = data.readUInt8(pixelIndex);
						if (pixelValue < threshold) {
							byte |= 1 << (7 - bit);
						}
					}
				}
				bitmapData.push(byte);
			}
		}

		const bytesPerLine = Math.ceil(width / 8);
		const xL = bytesPerLine & 0xff;
		const xH = (bytesPerLine >> 8) & 0xff;
		const yL = height & 0xff;
		const yH = (height >> 8) & 0xff;

		let escposImage = '';
		escposImage += '\x1D\x76\x30';
		escposImage += String.fromCharCode(0);
		escposImage += String.fromCharCode(xL);
		escposImage += String.fromCharCode(xH);
		escposImage += String.fromCharCode(yL);
		escposImage += String.fromCharCode(yH);
		for (const byte of bitmapData) {
			escposImage += String.fromCharCode(byte);
		}
		return escposImage;
	} catch (error) {
		logger.error('Error converting image to ESC/POS bitmap:', error);
		return null;
	}
}

export async function generateTicketHTML(
	ticketNo: string,
	issueDescription: string,
	timestamp: string,
	logoUrl?: string,
	branchName?: string
): Promise<string> {
	let logoDataUrl = '';
	if (logoUrl) {
		try {
			const filenameMatch = /images\/(.+)$/.exec(logoUrl);
			if (filenameMatch) {
				const filename = filenameMatch[1];
				const filePath = join(process.cwd(), 'uploads', filename);
				const fileBuffer = await readFile(filePath);
				const fileExtension = filename.split('.').pop()?.toLowerCase();
				let mimeType = 'image/png';
				if (fileExtension === 'jpg' || fileExtension === 'jpeg') mimeType = 'image/jpeg';
				else if (fileExtension === 'png') mimeType = 'image/png';
				else if (fileExtension === 'gif') mimeType = 'image/gif';
				logoDataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
			}
		} catch (error) {
			logger.error('Error reading logo file:', error);
		}
	}

	return `
		<!DOCTYPE html>
		<html>
			<head>
				<meta charset="UTF-8">
				<style>
					body {
						font-family: Arial, sans-serif;
					}
					.logo-container img {
						max-width: 200px;
						max-height: 100px;
						object-fit: contain;
						background-color: #0e4480;
					}
					.branch-name {
						font-size: 12px;
						text-align: center;
						margin-top: 5px;
						color: #666;
					}
					.ticket-number {
						font-size: 24px;
						font-weight: bold;
					}
					.issue-description {
						font-size: 16px;
						padding: 10px;
						background-color: #f5f5f5;
						border-radius: 5px;
					}
					.timestamp {
						font-size: 14px;
						color: #666;
					}
					.seating-message {
						font-size: 14px;
						font-weight: bold;
						padding: 10px;
						background-color: #0e4480;
						color: white;
						border-radius: 5px;
					}
				</style>
			</head>
			<body>
				<div class="logo-container">
					${logoDataUrl ? `<img src="${logoDataUrl}" alt="Company Logo" />` : ''}
					${branchName ? `<div class="branch-name">${branchName.toLowerCase()}</div>` : ''}
				</div>
				<div class="ticket-info">
					<div class="ticket-number">Ticket No: ${ticketNo}</div>
					<div class="issue-description">${issueDescription}</div>
					<div class="timestamp">${timestamp}</div>
				</div>
				<div class="seating-message">Please be seated you will be served soon</div>
			</body>
		</html>
	`;
}

export async function generateTicketESCPOS(
	ticketNo: string,
	issueDescription: string,
	timestamp: string,
	companyName?: string,
	logoUrl?: string,
	branchName?: string
): Promise<string> {
	let escpos = '';
	escpos += '\x1B\x40';

	let hasLogo = false;
	if (logoUrl) {
		const logoBitmap = await convertImageToESCPOSBitmap(logoUrl);
		if (logoBitmap) {
			escpos += '\x1B\x61\x01';
			escpos += logoBitmap;
			escpos += '\x0A';
			hasLogo = true;
		}
	}

	if (branchName) {
		escpos += '\x1B\x61\x01';
		escpos += '\x1B\x45\x00';
		escpos += `${branchName.toLowerCase()}\n`;
		escpos += '\x0A';
	}

	if (!hasLogo && companyName) {
		escpos += '\x1B\x61\x01';
		escpos += '\x1B\x45\x01';
		escpos += `${companyName}\n`;
		escpos += '\x1B\x45\x00';
		escpos += '\x0A';
	}

	escpos += '\x1B\x61\x01';
	escpos += '\x1D\x21\x11';
	escpos += '\x1B\x45\x01';
	escpos += `Ticket No: ${ticketNo}\n`;
	escpos += '\x1B\x45\x00';
	escpos += '\x1D\x21\x00';
	escpos += '\x0A';

	escpos += '\x1B\x61\x00';
	escpos += `${issueDescription}\n`;
	escpos += '\x0A';
	escpos += `${timestamp}\n`;
	escpos += '\x0A';
	escpos += '-----------------------------\n';
	escpos += '\x0A';
	escpos += '\x1B\x61\x01';
	escpos += '\x1B\x45\x01';
	escpos += 'Please be seated\n';
	escpos += 'you will be served soon\n';
	escpos += '\x1B\x45\x00';
	escpos += '\x0A\x0A';
	escpos += '\x1D\x56\x00';

	return escpos;
}

export function convertESCPOSToJSONString(escpos: string): string {
	let result = '';
	for (let i = 0; i < escpos.length; i++) {
		const char = escpos[i];
		const code = char.charCodeAt(0);
		if (code === 0x1b) {
			result += '\\x1B';
		} else if (code === 0x1d) {
			result += '\\x1D';
		} else if (code === 0x0a || char === '\n') {
			result += '\\n';
		} else if (code < 32 || code > 126) {
			result += `\\x${code.toString(16).toUpperCase().padStart(2, '0')}`;
		} else {
			result += char;
		}
	}
	return result;
}

export async function printTicketESCPOS(
	escpos: string,
	printerName: string = 'POS80',
	kioskIpAddress?: string
): Promise<{ success: boolean; result?: unknown; error?: string }> {
	try {
		logger.info('Attempting to print ticket via ESC/POS...');
		const printUrl = kioskIpAddress
			? `http://${kioskIpAddress}:3003/print`
			: process.env['ESC_POS_PRINT_SERVER_URL'] || DEFAULT_ESC_POS_PRINT_SERVER_URL;
		const escposJSONString = convertESCPOSToJSONString(escpos);
		const response = await fetch(printUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ escpos: escposJSONString, printerName }),
			signal: AbortSignal.timeout(15000)
		});

		logger.info('ESC/POS Print response status:', response.status);
		if (response.ok) {
			const result = await response.json();
			logger.info('ESC/POS Print job result:', result);
			return { success: true, result };
		}
		const errorText = await response.text();
		logger.error('Failed to print ticket via ESC/POS:', response.status, errorText);
		return { success: false, error: errorText };
	} catch (error) {
		logger.error('Error printing ticket via ESC/POS:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

export async function printTicketHTML(
	html: string,
	kioskIpAddress?: string
): Promise<{ success: boolean; result?: unknown; error?: string }> {
	try {
		logger.info('Attempting to print ticket via HTML...');
		const printUrl = kioskIpAddress
			? `http://${kioskIpAddress}:3002/print`
			: process.env['PRINT_SERVER_URL'] || DEFAULT_PRINT_SERVER_URL;
		const response = await fetch(printUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ html }),
			signal: AbortSignal.timeout(15000)
		});

		logger.info('HTML Print response status:', response.status);
		if (response.ok) {
			const result = await response.json();
			logger.info('HTML Print job result:', result);
			return { success: true, result };
		}
		const errorText = await response.text();
		logger.error('Failed to print ticket via HTML:', response.status, errorText);
		return { success: false, error: errorText };
	} catch (error) {
		logger.error('Error printing ticket via HTML:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

export async function printKioskTicket({
	ticketNo,
	issueDescription,
	createdAt,
	branchId
}: {
	ticketNo: string;
	issueDescription: string;
	createdAt: Date | string | number | null | undefined;
	branchId: string;
}): Promise<void> {
	const [branch] = await db
		.select({
			platform: branches.platform,
			kioskIpAddress: branches.kioskIpAddress,
			name: branches.name
		})
		.top(1)
		.from(branches)
		.where(eq(branches.id, branchId));
	const [settings] = await db
		.select({
			logoImage: bankSettings.logoImage,
			companyName: bankSettings.companyName
		})
		.top(1)
		.from(bankSettings);

	const logoUrl = settings?.logoImage ?? '';
	const companyName = settings?.companyName ?? '';
	const platform = branch?.platform ?? 'Windows';
	const kioskIpAddress = branch?.kioskIpAddress ?? undefined;
	const branchName = branch?.name ?? undefined;
	const timestamp = formatInEat(createdAt ?? new Date());

	if (platform === 'Linux') {
		const ticketESCPOS = await generateTicketESCPOS(
			ticketNo,
			issueDescription,
			timestamp,
			companyName,
			logoUrl,
			branchName
		);
		const printerName = process.env['ESC_POS_PRINTER_NAME'] || 'POS80';
		const result = await printTicketESCPOS(ticketESCPOS, printerName, kioskIpAddress ?? undefined);
		if (result.success) logger.info('Ticket printed successfully via ESC/POS');
		else logger.error('Failed to print ticket via ESC/POS:', result.error);
		return;
	}

	const ticketHTML = await generateTicketHTML(ticketNo, issueDescription, timestamp, logoUrl, branchName);
	const result = await printTicketHTML(ticketHTML, kioskIpAddress ?? undefined);
	if (result.success) logger.info('Ticket printed successfully via HTML');
	else logger.error('Failed to print ticket via HTML:', result.error);
}
