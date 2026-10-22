import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { logger } from '../logger';
import {
	MINUTE,
	addClient,
	addError,
	addJob,
	addPoolSample,
	addQuery,
	addRequest,
	aggregate,
	compactBucket,
	newBucket,
	type Bucket,
	type ReqSample,
	type Snapshot
} from './store';

export interface RequestRecord {
	id: string;
	startedAt: number;
	dbMs: number;
	acquireMs: number;
	queries: number;
	route: string;
}

export const monitorStorage = new AsyncLocalStorage<RequestRecord>();

const SLOW_REQ_MS = Number(process.env['MONITOR_SLOW_REQ_MS'] || 1000);
const SLOW_QUERY_MS = Number(process.env['MONITOR_SLOW_QUERY_MS'] || 500);
const RETENTION_DAYS = Number(process.env['MONITOR_RETENTION_DAYS'] || 7);
const MONITOR_DIR = process.env['MONITOR_DIR'] || path.join(process.cwd(), 'logs', 'monitor');
const KEEP_MINUTES = 24 * 60;
const IDLE_GAP_MS = 25_000;
const CONN_CODES = new Set(['ECONNRESET', 'ECONNCLOSED', 'ESOCKET', 'ETIMEOUT', 'ELOGIN', 'ENOTOPEN', 'ECONNREFUSED', 'ETIMEDOUT']);

export interface RingEvent {
	t: number;
	[key: string]: unknown;
}

const buckets: Bucket[] = [];
const recentErrors: RingEvent[] = [];
const slowRequests: RingEvent[] = [];
const slowQueries: RingEvent[] = [];
let inflight = 0;
let lastDbActivity = Date.now();
const startedAt = Date.now();

function push(ring: RingEvent[], e: RingEvent, cap = 300): void {
	ring.unshift(e);
	if (ring.length > cap) ring.length = cap;
}

function bucket(now = Date.now()): Bucket {
	const t = Math.floor(now / MINUTE) * MINUTE;
	let b = buckets[buckets.length - 1];
	if (!b || b.t !== t) {
		if (b) persist({ k: 'min', at: b.t, bucket: compactBucket(b) });
		b = newBucket(t);
		buckets.push(b);
		while (buckets.length > KEEP_MINUTES) buckets.shift();
	}
	return b;
}

// --------------------------------------------------------------------------
// Persistence: batched async JSONL, one file per local day
// --------------------------------------------------------------------------
let queue: string[] = [];
let flushing = false;

function dayFile(d = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return path.join(MONITOR_DIR, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.jsonl`);
}

function persist(obj: Record<string, unknown>): void {
	queue.push(JSON.stringify(obj));
	if (queue.length > 5000) queue = queue.slice(-2500);
}

async function flush(): Promise<void> {
	if (flushing || queue.length === 0) return;
	flushing = true;
	const lines = queue;
	queue = [];
	try {
		await fs.promises.mkdir(MONITOR_DIR, { recursive: true });
		await fs.promises.appendFile(dayFile(), lines.join('\n') + '\n');
	} catch (error) {
		logger.warn('Monitor could not write metrics file', error);
	} finally {
		flushing = false;
	}
}

function flushSync(): void {
	if (queue.length === 0) return;
	try {
		fs.mkdirSync(MONITOR_DIR, { recursive: true });
		fs.appendFileSync(dayFile(), queue.join('\n') + '\n');
		queue = [];
	} catch {
		// Shutting down; nothing more we can do.
	}
}

function cleanup(): void {
	fs.promises
		.readdir(MONITOR_DIR)
		.then((files) => {
			const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
			for (const f of files) {
				if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) continue;
				const full = path.join(MONITOR_DIR, f);
				fs.promises.stat(full).then((st) => (st.mtimeMs < cutoff ? fs.promises.unlink(full) : undefined)).catch(() => undefined);
			}
		})
		.catch(() => undefined);
}

// --------------------------------------------------------------------------
// Recording API
// --------------------------------------------------------------------------
export function requestStarted(): number {
	inflight++;
	const b = bucket();
	b.inflightMax = Math.max(b.inflightMax, inflight);
	return inflight;
}

export interface FinishedRequest extends ReqSample {
	id: string;
	method: string;
	url: string;
	ip: string;
	queries: number;
	bytes: number;
}

export function requestFinished(r: FinishedRequest): void {
	inflight = Math.max(0, inflight - 1);
	const now = Date.now();
	addRequest(bucket(now), r);
	const failed = r.status >= 500 || r.aborted;
	if (r.ms >= SLOW_REQ_MS || failed) {
		const ev = {
			t: now, id: r.id, route: r.route, url: r.url.slice(0, 200), status: r.status, ms: Math.round(r.ms),
			dbMs: Math.round(r.dbMs), acquireMs: Math.round(r.acquireMs), queries: r.queries, source: r.source,
			ip: r.ip, aborted: r.aborted
		};
		push(slowRequests, ev);
		persist({ k: 'req', ...ev });
	}
}

export function recordQuery(shape: string, ms: number, error?: { code?: string; message: string }): void {
	const now = Date.now();
	lastDbActivity = now;
	addQuery(bucket(now), shape, ms, !!error);
	const rec = monitorStorage.getStore();
	if (rec) {
		rec.dbMs += ms;
		rec.queries++;
	}
	if (ms >= SLOW_QUERY_MS || error) {
		const ev = { t: now, shape: shape.slice(0, 300), ms: Math.round(ms), route: rec?.route ?? '', error: error?.message?.slice(0, 200) };
		push(slowQueries, ev);
		persist({ k: 'query', ...ev });
	}
}

export function recordAcquire(ms: number): void {
	const rec = monitorStorage.getStore();
	if (rec) {
		rec.acquireMs += ms;
		rec.dbMs += ms;
	}
}

export function recordError(e: { kind: string; code?: string; route?: string; message: string; status?: number }): void {
	const now = Date.now();
	const code = e.code || (e.status ? String(e.status) : 'ERR');
	const idleDrop = CONN_CODES.has(code) && now - lastDbActivity > IDLE_GAP_MS;
	const route = e.route ?? monitorStorage.getStore()?.route ?? '';
	addError(bucket(now), { kind: e.kind, code, route, msg: e.message, t: now, idleDrop });
	const ev = { t: now, kind: e.kind, code, route, message: e.message.slice(0, 400), idleGapMs: idleDrop ? now - lastDbActivity : undefined };
	push(recentErrors, ev);
	persist({ k: 'err', ...ev });
}

export function recordJob(name: string, ms: number, failed: boolean): void {
	addJob(bucket(), name, ms, failed);
}

export function recordClientBatch(route: string, ms: number, failed: boolean): void {
	addClient(bucket(), route, ms, failed);
}

export function touchDbActivity(): void {
	lastDbActivity = Date.now();
}

/** Run an async job under timing; failures are recorded and rethrown. */
export async function timedJob<T>(name: string, fn: () => Promise<T>): Promise<T> {
	const t0 = performance.now();
	try {
		const out = await fn();
		recordJob(name, performance.now() - t0, false);
		return out;
	} catch (error) {
		recordJob(name, performance.now() - t0, true);
		recordError({ kind: 'job', code: (error as { code?: string })?.code, route: name, message: error instanceof Error ? error.message : String(error) });
		throw error;
	}
}

// --------------------------------------------------------------------------
// Reading API
// --------------------------------------------------------------------------
export function getSnapshot(windowMin: number): Snapshot {
	return aggregate(buckets, windowMin);
}

export function getRings() {
	return { errors: recentErrors, slowRequests, slowQueries };
}

export function getLive() {
	const pool = readPool();
	return { uptimeSec: Math.round((Date.now() - startedAt) / 1000), inflight, pool, pid: process.pid, node: process.version, pm2: process.env['pm_id'] ?? null };
}

// --------------------------------------------------------------------------
// Periodic sampling (pool, event loop, memory, CPU)
// --------------------------------------------------------------------------
interface PoolLike {
	connected?: boolean;
	size?: number;
	available?: number;
	pending?: number;
	borrowed?: number;
	config?: { pool?: { max?: number } };
}

function readPool() {
	const pool = (globalThis as unknown as { mssqlPool?: PoolLike }).mssqlPool;
	if (!pool) return null;
	try {
		if (!pool.connected) return { connected: false, size: 0, available: 0, pending: 0, borrowed: 0, max: pool.config?.pool?.max ?? 10 };
		return {
			connected: true, size: pool.size ?? 0, available: pool.available ?? 0, pending: pool.pending ?? 0,
			borrowed: pool.borrowed ?? 0, max: pool.config?.pool?.max ?? 10
		};
	} catch {
		return null;
	}
}

let started = false;

export function startMonitor(): void {
	if (started) return;
	started = true;
	const hist = monitorEventLoopDelay({ resolution: 10 });
	hist.enable();
	let lastCpu = process.cpuUsage();
	let lastCpuAt = Date.now();

	const sample = setInterval(() => {
		const b = bucket();
		const p = readPool();
		if (p && p.connected) addPoolSample(b, p);
		const lag = Math.max(0, hist.max / 1e6 - 10);
		hist.reset();
		b.lagMaxMs = Math.max(b.lagMaxMs, Math.round(lag));
		b.rssMb = Math.max(b.rssMb, Math.round(process.memoryUsage().rss / 1048576));
		const now = Date.now();
		const cpu = process.cpuUsage(lastCpu);
		const pctCpu = ((cpu.user + cpu.system) / 1000 / Math.max(1, now - lastCpuAt)) * 100;
		lastCpu = process.cpuUsage();
		lastCpuAt = now;
		b.cpuPct = Math.max(b.cpuPct, Math.round(pctCpu));
	}, 5000);
	sample.unref();

	const flusher = setInterval(() => void flush(), 2000);
	flusher.unref();
	const roll = setInterval(() => bucket(), 15_000); // makes sure idle minutes still get written
	roll.unref();

	cleanup();
	setInterval(cleanup, 6 * 3600_000).unref();

	persist({ k: 'start', at: Date.now(), pid: process.pid, node: process.version, pm2: process.env['pm_id'] ?? null });
	const onExit = () => {
		const b = buckets[buckets.length - 1];
		if (b) persist({ k: 'min', at: b.t, bucket: compactBucket(b) });
		persist({ k: 'stop', at: Date.now() });
		flushSync();
	};
	process.once('SIGTERM', () => { onExit(); process.exit(0); });
	process.once('SIGINT', () => { onExit(); process.exit(0); });
	process.once('beforeExit', onExit);
	logger.info('Monitor started', { dir: MONITOR_DIR, slowReqMs: SLOW_REQ_MS, slowQueryMs: SLOW_QUERY_MS });
}
