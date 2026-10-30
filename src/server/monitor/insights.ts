import type { Snapshot } from './store';

export interface Insight {
	severity: 'critical' | 'warning' | 'info' | 'ok';
	id: string;
	title: string;
	detail: string;
	advice?: string;
}

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const CONN_CODES = new Set(['ECONNRESET', 'ECONNCLOSED', 'ESOCKET', 'ETIMEOUT', 'ELOGIN', 'ENOTOPEN', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH']);

/** Rule-based diagnosis over an aggregated window. Every finding carries its evidence. */
export function computeInsights(s: Snapshot): Insight[] {
	const out: Insight[] = [];
	const t = s.totals;
	if (t.count === 0) {
		out.push({ severity: 'info', id: 'no-traffic', title: 'No requests recorded in this window', detail: `Window: last ${s.windowMin} min.` });
		return out;
	}

	// --- Pool saturation -------------------------------------------------
	const p = s.pool;
	if (p.sampledMinutes > 0) {
		const growing = p.maxBorrowed < p.configuredMax * 0.8;
		if ((p.queuedMinutes > 0 || t.avgAcquireMs > 50) && growing) {
			out.push({
				severity: t.avgAcquireMs > 100 ? 'warning' : 'info',
				id: 'pool-cold',
				title: 'Requests waited while new DB connections were being opened',
				detail:
					`Up to ${p.maxPending} requests queued although only ${p.maxBorrowed}/${p.configuredMax} connections were ever in use, ` +
					`so the pool was not full: it was still opening connections (avg wait ${ms(t.avgAcquireMs)}). Connections idle for 30s are closed and reopened on the next burst.`,
				advice: 'Set config.pool.min (e.g. 2-4) and a lower-risk idleTimeoutMillis in src/server/db/index.ts so warm connections are always ready. If the DB is remote, each new connection (TCP + TLS + login) can cost hundreds of ms.'
			});
		} else if (p.queuedMinutes > 0 || t.avgAcquireMs > 50) {
			out.push({
				severity: p.queuedMinutes >= 3 || t.avgAcquireMs > 200 ? 'critical' : 'warning',
				id: 'pool-saturation',
				title: 'DB connection pool is saturated',
				detail:
					`Requests queued for a connection in ${p.queuedMinutes}/${p.sampledMinutes} sampled minutes (max ${p.maxPending} waiting, ` +
					`pool max ${p.configuredMax}, max borrowed ${p.maxBorrowed}). Average wait to get a connection: ${ms(t.avgAcquireMs)}.`,
				advice:
					'Cut redundant polling first (see the polling findings), then raise the pool size via config.pool.max in src/server/db/index.ts ' +
					'(check SQL Server can handle it) and make sure no handler holds a connection while doing slow non-DB work.'
			});
		} else if (p.saturatedMinutes > 0) {
			out.push({
				severity: 'warning', id: 'pool-near-full', title: 'Pool hit its ceiling but did not queue',
				detail: `All ${p.configuredMax} connections were borrowed in ${p.saturatedMinutes} minute(s). Headroom is thin.`
			});
		} else {
			out.push({ severity: 'ok', id: 'pool-ok', title: 'Connection pool has headroom', detail: `Max ${p.maxBorrowed}/${p.configuredMax} borrowed, nobody queued.` });
		}
	}

	// --- Where does latency live? ---------------------------------------
	const appMs = Math.max(0, t.avgMs - t.avgDbMs);
	if (t.p95 > 1000 || t.avgMs > 300) {
		const dbShare = t.avgMs ? t.avgDbMs / t.avgMs : 0;
		if (dbShare > 0.6) {
			const worst = s.queries.filter((q) => q.p95 > 200).slice(0, 3);
			out.push({
				severity: 'warning', id: 'db-bound', title: 'Request time is dominated by the database',
				detail:
					`Avg request ${ms(t.avgMs)} of which ${ms(t.avgDbMs)} (${pct(dbShare)}) is DB (including waiting for a connection). p95 ${ms(t.p95)}.` +
					(worst.length ? ` Slowest query shapes: ${worst.map((q) => `"${q.shape.slice(0, 70)}" p95 ${ms(q.p95)} x${q.n}`).join('; ')}.` : ''),
				advice: p.queuedMinutes > 0
					? 'Mostly connection queueing, not slow SQL: see pool finding.'
					: 'Pool is not queueing, so the SQL itself or the DB host/network is slow: check indexes on the shapes above and DB server load/latency.'
			});
		} else if (s.lag.badMinutes > 0 || s.lag.maxMs > 200) {
			out.push({
				severity: 'warning', id: 'event-loop', title: 'Node event loop is being blocked',
				detail: `Event-loop lag peaked at ${ms(s.lag.maxMs)} (${s.lag.badMinutes} minute(s) above 100ms). App-side time is ${ms(appMs)} per request vs ${ms(t.avgDbMs)} DB.`,
				advice: 'CPU-bound work in the single Node thread (bcrypt, sharp image processing, big JSON, SSR HTML buffering) delays every request. Consider more cluster workers (WORKERS in scripts/cluster.mjs) or moving the heavy work off-thread.'
			});
		} else {
			out.push({
				severity: 'info', id: 'app-or-outbound', title: 'Slow time is neither DB nor event-loop',
				detail: `Avg ${ms(t.avgMs)}, DB only ${ms(t.avgDbMs)}, event-loop healthy. Likely outbound calls (LDAP/SMS/printer) or slow clients downloading responses.`
			});
		}
	} else {
		out.push({ severity: 'ok', id: 'latency-ok', title: 'Server-side latency looks healthy', detail: `p50 ${ms(t.p50)}, p95 ${ms(t.p95)}, p99 ${ms(t.p99)} over ${t.count} requests.` });
	}

	// --- Per-route outliers ----------------------------------------------
	const slowRoutes = s.routes.filter((r) => r.n >= 5 && r.p95 > 1000).slice(0, 5);
	if (slowRoutes.length) {
		out.push({
			severity: 'warning', id: 'slow-routes', title: 'Routes with p95 above 1s',
			detail: slowRoutes.map((r) => `${r.route} p95 ${ms(r.p95)} (avg DB ${ms(r.avgDbMs)}, n=${r.n})`).join('; ')
		});
	}

	// --- Errors -----------------------------------------------------------
	if (t.errorRate > 0.01) {
		out.push({
			severity: t.errorRate > 0.05 ? 'critical' : 'warning', id: 'error-rate', title: `Error rate ${pct(t.errorRate)}`,
			detail: `${t.errors} of ${t.count} requests failed (HTTP 5xx). A further ${t.aborted} were aborted by the client before finishing.`
		});
	}
	const connErrs = s.errors.filter((e) => CONN_CODES.has(e.code));
	if (connErrs.length) {
		const n = connErrs.reduce((a, e) => a + e.n, 0);
		out.push({
			severity: 'critical', id: 'db-connectivity', title: 'Database connectivity / timeout errors',
			detail: `${n} error(s): ${connErrs.slice(0, 4).map((e) => `${e.code} x${e.n}`).join(', ')}. Latest: ${connErrs[0].msg}`,
			advice: 'ETIMEOUT = query or connect exceeded the limit (slow DB or saturated pool). ECONNRESET/ECONNCLOSED = connection dropped (DB restart, firewall, idle cutoff). ELOGIN = credentials/DB availability.'
		});
	}
	const idle = s.errors.reduce((a, e) => a + e.idleDrops, 0);
	if (idle > 0) {
		out.push({
			severity: 'critical', id: 'idle-drops', title: 'Failures right after idle periods',
			detail: `${idle} DB error(s) happened after >25s without DB activity. This is the signature of a firewall/NAT/proxy silently killing idle pooled TCP connections.`,
			advice: 'Set config.pool.min > 0 with a periodic keep-alive query (e.g. select 1 every 20s), or lower idleTimeoutMillis below the network device idle timeout. The ticket-expiry sweep (every 60s) is too slow to keep connections warm.'
		});
	}
	const appErrs = s.errors.filter((e) => !CONN_CODES.has(e.code) && e.kind !== 'client').slice(0, 3);
	if (appErrs.length) {
		out.push({
			severity: 'warning', id: 'app-errors', title: 'Recurring application errors',
			detail: appErrs.map((e) => `[${e.kind}] ${e.code} on ${e.route} x${e.n}: ${e.msg.slice(0, 120)}`).join(' | ')
		});
	}

	// --- Polling / traffic shape ----------------------------------------
	const top = s.pairs[0];
	if (top && top.perMin > 60) {
		out.push({
			severity: 'info', id: 'polling', title: 'Heavy repeated polling',
			detail: 'Top source+route pairs: ' + s.pairs.slice(0, 4).map((x) => `${x.source} -> ${x.route} ${x.perMin.toFixed(0)}/min`).join('; ') + `. Overall ${t.rps.toFixed(1)} req/s.`,
			advice: 'Every poll consumes a pool connection and often a session lookup. Batch endpoints, dedupe calls (refreshDesk calls GET /api/bank/ticket twice), lengthen intervals, or switch to SSE/websocket push.'
		});
	}
	const top3 = s.sources.slice(0, 3).reduce((a, x) => a + x.share, 0);
	if (s.sources.length > 3 && top3 > 0.8) {
		out.push({
			severity: 'info', id: 'source-concentration', title: 'Traffic concentrated in few sources',
			detail: `Top 3 sources produce ${pct(top3)}: ${s.sources.slice(0, 3).map((x) => `${x.source} (${x.n})`).join(', ')}.`
		});
	}

	// --- Network vs server ----------------------------------------------
	const gaps = s.client.filter((c) => c.n >= 5 && c.clientP95 > c.serverP95 * 2 + 300);
	if (gaps.length) {
		out.push({
			severity: 'warning', id: 'network-gap', title: 'Browser-seen latency far exceeds server latency',
			detail: gaps.slice(0, 4).map((c) => `${c.route}: browser p95 ${ms(c.clientP95)} vs server p95 ${ms(c.serverP95)}`).join('; '),
			advice: 'Time is being lost between browser and Node (network, reverse proxy, LAN/Wi-Fi) rather than in the app or DB.'
		});
	}
	const failedClient = s.client.filter((c) => c.fail > 0);
	if (failedClient.length) {
		const f = failedClient.reduce((a, c) => a + c.fail, 0);
		const srvErr = t.errors;
		out.push({
			severity: f > srvErr * 2 ? 'warning' : 'info', id: 'client-failures', title: 'Browsers reported failed calls',
			detail: `${f} client-side failures vs ${srvErr} server-recorded errors. ` + (f > srvErr * 2 ? 'Most never reached the app: network/proxy/server down.' : 'Consistent with server errors.')
		});
	}

	// --- Background jobs -----------------------------------------------
	for (const j of s.jobs) {
		if (j.err > 0 || j.maxMs > 2000) {
			out.push({ severity: j.err ? 'warning' : 'info', id: `job-${j.name}`, title: `Background job "${j.name}"`, detail: `${j.n} runs, ${j.err} failed, avg ${ms(j.avgMs)}, max ${ms(j.maxMs)}.` });
		}
	}

	if (s.rssMbMax > 1500) {
		out.push({ severity: 'warning', id: 'memory', title: 'High memory use', detail: `RSS peaked at ${s.rssMbMax} MB.` });
	}

	const rank = { critical: 0, warning: 1, info: 2, ok: 3 };
	return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
