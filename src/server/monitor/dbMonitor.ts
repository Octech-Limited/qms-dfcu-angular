import { recordAcquire, recordError, recordQuery, startMonitor, touchDbActivity } from './collector';

type AnyFn = (...args: any[]) => any;

interface MssqlLike {
	Request: { prototype: Record<string, AnyFn> };
}
interface PoolLike {
	_acquire?: AnyFn;
	connect: AnyFn;
	__monitored?: boolean;
}

/** Strip literals so queries group by shape and secrets never reach the logs. */
export function queryShape(text: string): string {
	return String(text)
		.replace(/'(?:[^']|'')*'/g, '?')
		.replace(/\b\d+(\.\d+)?\b/g, '?')
		.replace(/\(\s*\?(?:\s*,\s*\?)+\s*\)/g, '(?...)')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 240);
}

function errInfo(error: unknown): { code?: string; message: string } {
	const e = error as { code?: string; message?: string } | undefined;
	return { code: e?.code, message: e?.message ?? String(error) };
}

/**
 * Instruments the mssql driver: per-query timing (attributed to the active request),
 * connection-acquire wait time, and connect failures. Idempotent.
 */
export function instrumentMssql(sql: MssqlLike, pool: PoolLike): void {
	startMonitor();
	if (pool.__monitored) return;
	pool.__monitored = true;

	// Time spent waiting for a free pooled connection (the number that exposes pool starvation).
	const origAcquire = pool._acquire?.bind(pool);
	if (origAcquire) {
		pool._acquire = () => {
			const t0 = performance.now();
			return origAcquire().then(
				(conn: unknown) => {
					recordAcquire(performance.now() - t0);
					return conn;
				},
				(error: unknown) => {
					recordAcquire(performance.now() - t0);
					const { code, message } = errInfo(error);
					recordError({ kind: 'db-acquire', code, message });
					throw error;
				}
			);
		};
	}

	const origConnect = pool.connect.bind(pool);
	pool.connect = (...args: unknown[]) => {
		const t0 = performance.now();
		const res = origConnect(...args);
		if (res && typeof res.then === 'function') {
			return res.then(
				(v: unknown) => {
					touchDbActivity();
					return v;
				},
				(error: unknown) => {
					const { code, message } = errInfo(error);
					recordError({ kind: 'db-connect', code, message: `${message} (after ${Math.round(performance.now() - t0)}ms)` });
					throw error;
				}
			);
		}
		return res;
	};

	// Per-query timing. Drizzle and raw usage both go through Request.query / Request.batch.
	const proto = sql.Request.prototype;
	for (const method of ['query', 'batch'] as const) {
		const orig = proto[method];
		if (typeof orig !== 'function' || (orig as AnyFn & { __monitored?: boolean }).__monitored) continue;
		const wrapped: AnyFn & { __monitored?: boolean } = function (this: unknown, command: unknown, callback?: AnyFn) {
			const t0 = performance.now();
			const shape = queryShape(typeof command === 'string' ? command : Array.isArray(command) ? command.join('?') : 'unknown');
			const done = (error?: unknown) => {
				const ms = performance.now() - t0;
				recordQuery(shape, ms, error ? errInfo(error) : undefined);
				if (error) {
					const { code, message } = errInfo(error);
					recordError({ kind: 'db-query', code: code ?? 'EQUERY', message: `${message} :: ${shape.slice(0, 80)}` });
				}
			};
			if (typeof callback === 'function') {
				return orig.call(this, command, (err: unknown, ...rest: unknown[]) => {
					done(err);
					return callback(err, ...rest);
				});
			}
			const result = orig.call(this, command);
			if (result && typeof result.then === 'function') {
				return result.then(
					(v: unknown) => {
						done();
						return v;
					},
					(error: unknown) => {
						done(error);
						throw error;
					}
				);
			}
			return result;
		};
		wrapped.__monitored = true;
		proto[method] = wrapped;
	}
}
