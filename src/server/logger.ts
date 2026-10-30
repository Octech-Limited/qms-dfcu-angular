import fs from 'node:fs';
import path from 'node:path';
import pino, { type Logger as PinoLogger } from 'pino';
import SonicBoom from 'sonic-boom';

const LOGS_DIR = path.join(process.cwd(), 'logs');
// Cluster workers each write their own file (app.w1.log, ...) so rotation never races between processes.
const WORKER_SUFFIX = process.env['QMS_WORKER_ID'] ? `.w${process.env['QMS_WORKER_ID']}` : '';
const APP_LOG = path.join(LOGS_DIR, `app${WORKER_SUFFIX}.log`);

function localDateString(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function archivePathForDate(dateStr: string): string {
	return path.join(LOGS_DIR, `app${WORKER_SUFFIX}.${dateStr}.log`);
}

/** Daily file rotation: writes to logs/app.log, archives as logs/app.YYYY-MM-DD.log. */
class DailyRotatingDestination {
	private stream: SonicBoom | null = null;
	private currentDate: string | null = null;

	constructor() {
		fs.mkdirSync(LOGS_DIR, { recursive: true });
		this.ensureStartupArchive();
		this.openStream(localDateString());
	}

	private ensureStartupArchive(): void {
		if (!fs.existsSync(APP_LOG)) return;

		const today = localDateString();
		const mtime = fs.statSync(APP_LOG).mtime;
		const fileDate = localDateString(mtime);

		if (fileDate !== today) {
			this.archiveFile(fileDate);
		}
	}

	private archiveFile(dateStr: string): void {
		if (!fs.existsSync(APP_LOG)) return;

		const archivePath = archivePathForDate(dateStr);
		const content = fs.readFileSync(APP_LOG);

		if (fs.existsSync(archivePath)) {
			fs.appendFileSync(archivePath, content);
			fs.unlinkSync(APP_LOG);
		} else {
			fs.renameSync(APP_LOG, archivePath);
		}
	}

	private closeStream(): void {
		if (!this.stream) return;
		const stream = this.stream;
		this.stream = null;

		// Flush buffered writes before ending to avoid "SonicBoom destroyed" races.
		try {
			stream.flushSync();
		} catch {
			// Ignore close-time errors; we re-open a fresh stream immediately.
		}

		try {
			stream.end();
		} catch {
			// Ignore close-time errors for already-ended/destroyed streams.
		}
	}

	private openStream(dateStr: string): void {
		// `sync: true` keeps writes in-process and avoids async flush races during rotation.
		this.stream = new SonicBoom({ dest: APP_LOG, append: true, sync: true });
		this.currentDate = dateStr;
	}

	private rotateIfNeeded(): void {
		const today = localDateString();
		if (this.currentDate === today) return;

		this.closeStream();

		if (fs.existsSync(APP_LOG) && this.currentDate) {
			this.archiveFile(this.currentDate);
		}

		this.openStream(today);
	}

	write(data: string): void {
		this.rotateIfNeeded();

		if (!this.stream) {
			this.openStream(localDateString());
		}

		try {
			this.stream?.write(data);
		} catch {
			// If a stream was torn down unexpectedly, recover and retry once.
			this.openStream(localDateString());
			this.stream?.write(data);
		}
	}
}

const destination = new DailyRotatingDestination();

const pinoLogger: PinoLogger = pino(
	{
		level: process.env['LOG_LEVEL'] ?? 'info',
		timestamp: pino.stdTimeFunctions.isoTime,
		formatters: {
			level(label) {
				return { level: label.toUpperCase() };
			}
		}
	},
	{
		write(msg: string) {
			destination.write(msg);
		}
	}
);

type LogArgs = unknown[];

function buildLogPayload(args: LogArgs): { msg?: string; bindings: Record<string, unknown> } {
	if (args.length === 0) {
		return { bindings: {} };
	}

	let msg: string | undefined;
	let rest: LogArgs;

	if (typeof args[0] === 'string') {
		msg = args[0];
		rest = args.slice(1);
	} else {
		rest = args;
	}

	const bindings: Record<string, unknown> = {};

	if (rest.length === 1) {
		const value = rest[0];
		if (value instanceof Error) {
			bindings['err'] = value;
		} else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			Object.assign(bindings, value as Record<string, unknown>);
		} else {
			bindings['data'] = value;
		}
	} else if (rest.length > 1) {
		bindings['data'] = rest;
	}

	return { msg, bindings };
}

export interface LoggerFacade {
	debug: (...args: LogArgs) => void;
	info: (...args: LogArgs) => void;
	warn: (...args: LogArgs) => void;
	error: (...args: LogArgs) => void;
	fatal: (...args: LogArgs) => void;
}

function createFacade(base: PinoLogger): LoggerFacade {
	const log =
		(level: 'debug' | 'info' | 'warn' | 'error' | 'fatal') =>
		(...args: LogArgs) => {
			const { msg, bindings } = buildLogPayload(args);
			if (msg !== undefined) {
				base[level](bindings, msg);
			} else {
				base[level](bindings);
			}
		};

	return {
		debug: log('debug'),
		info: log('info'),
		warn: log('warn'),
		error: log('error'),
		fatal: log('fatal')
	};
}

export const logger = createFacade(pinoLogger);

export function createLogger(bindings: Record<string, unknown>): LoggerFacade {
	return createFacade(pinoLogger.child(bindings));
}
