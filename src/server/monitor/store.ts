/**
 * Pure aggregation store for the monitor. No Node-specific imports so the offline
 * report script can load it directly (node --experimental-strip-types semantics).
 */

export interface RouteAgg {
	n: number;
	err: number;
	sumMs: number;
	sumDb: number;
	maxMs: number;
	samples: number[];
}
export interface SrcAgg {
	n: number;
	err: number;
	sumMs: number;
}
export interface QAgg {
	n: number;
	err: number;
	sumMs: number;
	maxMs: number;
	samples: number[];
}
export interface ClientAgg {
	n: number;
	fail: number;
	sumMs: number;
	samples: number[];
}
export interface ErrAgg {
	n: number;
	kind: string;
	code: string;
	route: string;
	msg: string;
	lastT: number;
	idleDrops: number;
}
export interface JobAgg {
	n: number;
	err: number;
	sumMs: number;
	maxMs: number;
}

export interface Bucket {
	t: number;
	n: number;
	err: number;
	aborted: number;
	sumMs: number;
	sumDb: number;
	sumAcq: number;
	samples: number[];
	inflightMax: number;
	routes: Record<string, RouteAgg>;
	sources: Record<string, SrcAgg>;
	pairs: Record<string, number>;
	queries: Record<string, QAgg>;
	client: Record<string, ClientAgg>;
	errs: Record<string, ErrAgg>;
	jobs: Record<string, JobAgg>;
	pool: { size: number; max: number; borrowedMax: number; pendingMax: number; availableMin: number; samples: number };
	lagMaxMs: number;
	rssMb: number;
	cpuPct: number;
}

export const MINUTE = 60_000;
const SAMPLE_CAP = 300;
const ROUTE_SAMPLE_CAP = 100;
const SMALL_CAP = 60;
const MAX_KEYS = 400;

export function newBucket(t: number): Bucket {
	return {
		t,
		n: 0,
		err: 0,
		aborted: 0,
		sumMs: 0,
		sumDb: 0,
		sumAcq: 0,
		samples: [],
		inflightMax: 0,
		routes: {},
		sources: {},
		pairs: {},
		queries: {},
		client: {},
		errs: {},
		jobs: {},
		pool: { size: 0, max: 0, borrowedMax: 0, pendingMax: 0, availableMin: Number.MAX_SAFE_INTEGER, samples: 0 },
		lagMaxMs: 0,
		rssMb: 0,
		cpuPct: 0
	};
}

export function reservoir(arr: number[], v: number, cap: number, seen: number): void {
	if (arr.length < cap) arr.push(v);
	else {
		const j = Math.floor(Math.random() * seen);
		if (j < cap) arr[j] = v;
	}
}

function entry<T>(map: Record<string, T>, key: string, make: () => T): T {
	let e = map[key];
	if (!e) {
		// Guard against unbounded cardinality (e.g. attacker-generated paths).
		if (Object.keys(map).length >= MAX_KEYS) key = '(other)';
		e = map[key] ?? (map[key] = make());
	}
	return e;
}

export interface ReqSample {
	route: string;
	status: number;
	ms: number;
	dbMs: number;
	acquireMs: number;
	source: string;
	aborted: boolean;
}

export function addRequest(b: Bucket, r: ReqSample): void {
	const failed = r.status >= 500;
	b.n++;
	if (failed) b.err++;
	if (r.aborted) b.aborted++;
	b.sumMs += r.ms;
	b.sumDb += r.dbMs;
	b.sumAcq += r.acquireMs;
	reservoir(b.samples, r.ms, SAMPLE_CAP, b.n);
	const ra = entry(b.routes, r.route, () => ({ n: 0, err: 0, sumMs: 0, sumDb: 0, maxMs: 0, samples: [] }));
	ra.n++;
	if (failed) ra.err++;
	ra.sumMs += r.ms;
	ra.sumDb += r.dbMs;
	ra.maxMs = Math.max(ra.maxMs, r.ms);
	reservoir(ra.samples, r.ms, ROUTE_SAMPLE_CAP, ra.n);
	const sa = entry(b.sources, r.source, () => ({ n: 0, err: 0, sumMs: 0 }));
	sa.n++;
	if (failed) sa.err++;
	sa.sumMs += r.ms;
	const pk = `${r.source}\u0001${r.route}`;
	if (b.pairs[pk] !== undefined || Object.keys(b.pairs).length < MAX_KEYS * 2) b.pairs[pk] = (b.pairs[pk] ?? 0) + 1;
}

export function addQuery(b: Bucket, shape: string, ms: number, failed: boolean): void {
	const q = entry(b.queries, shape, () => ({ n: 0, err: 0, sumMs: 0, maxMs: 0, samples: [] }));
	q.n++;
	if (failed) q.err++;
	q.sumMs += ms;
	q.maxMs = Math.max(q.maxMs, ms);
	reservoir(q.samples, ms, SMALL_CAP, q.n);
}

export function addClient(b: Bucket, route: string, ms: number, failed: boolean): void {
	const c = entry(b.client, route, () => ({ n: 0, fail: 0, sumMs: 0, samples: [] }));
	c.n++;
	if (failed) c.fail++;
	c.sumMs += ms;
	reservoir(c.samples, ms, SMALL_CAP, c.n);
}

export function addError(
	b: Bucket,
	e: { kind: string; code: string; route: string; msg: string; t: number; idleDrop: boolean }
): void {
	const key = `${e.kind}|${e.code}|${e.route}`;
	const a = entry(b.errs, key, () => ({ n: 0, kind: e.kind, code: e.code, route: e.route, msg: '', lastT: 0, idleDrops: 0 }));
	a.n++;
	a.msg = e.msg.slice(0, 300);
	a.lastT = e.t;
	if (e.idleDrop) a.idleDrops++;
}

export function addJob(b: Bucket, name: string, ms: number, failed: boolean): void {
	const j = entry(b.jobs, name, () => ({ n: 0, err: 0, sumMs: 0, maxMs: 0 }));
	j.n++;
	if (failed) j.err++;
	j.sumMs += ms;
	j.maxMs = Math.max(j.maxMs, ms);
}

export function addPoolSample(
	b: Bucket,
	p: { size: number; max: number; borrowed: number; pending: number; available: number }
): void {
	b.pool.size = Math.max(b.pool.size, p.size);
	b.pool.max = p.max;
	b.pool.borrowedMax = Math.max(b.pool.borrowedMax, p.borrowed);
	b.pool.pendingMax = Math.max(b.pool.pendingMax, p.pending);
	b.pool.availableMin = Math.min(b.pool.availableMin, p.available);
	b.pool.samples++;
}

/** Trim a bucket for persistence. */
export function compactBucket(b: Bucket): Bucket {
	const c: Bucket = JSON.parse(JSON.stringify(b));
	c.samples = c.samples.slice(0, 120).map(round1);
	for (const r of Object.values(c.routes)) r.samples = r.samples.slice(0, 40).map(round1);
	for (const q of Object.values(c.queries)) q.samples = q.samples.slice(0, 30).map(round1);
	for (const q of Object.values(c.client)) q.samples = q.samples.slice(0, 30).map(round1);
	if (c.pool.availableMin === Number.MAX_SAFE_INTEGER) c.pool.availableMin = 0;
	return c;
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

export function percentile(sorted: number[], p: number): number {
	if (!sorted.length) return 0;
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[idx];
}

function pcts(samples: number[]) {
	const s = [...samples].sort((a, b) => a - b);
	return { p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s.length ? s[s.length - 1] : 0 };
}

// ---------------------------------------------------------------------------
// Snapshot: merged view over a window of buckets. Consumed by insights + UI + CLI.
// ---------------------------------------------------------------------------

export interface Snapshot {
	from: number;
	to: number;
	windowMin: number;
	minutesWithTraffic: number;
	totals: {
		count: number;
		errors: number;
		aborted: number;
		errorRate: number;
		rps: number;
		avgMs: number;
		p50: number;
		p95: number;
		p99: number;
		maxMs: number;
		avgDbMs: number;
		avgAcquireMs: number;
		inflightMax: number;
	};
	routes: { route: string; n: number; err: number; avgMs: number; p95: number; maxMs: number; avgDbMs: number; totalMs: number }[];
	sources: { source: string; n: number; err: number; avgMs: number; share: number }[];
	pairs: { source: string; route: string; n: number; perMin: number }[];
	queries: { shape: string; n: number; err: number; avgMs: number; p95: number; maxMs: number; totalMs: number }[];
	client: { route: string; n: number; fail: number; clientAvgMs: number; clientP95: number; serverP95: number }[];
	errors: ErrAgg[];
	jobs: { name: string; n: number; err: number; avgMs: number; maxMs: number }[];
	pool: {
		configuredMax: number;
		maxBorrowed: number;
		maxPending: number;
		minAvailable: number;
		saturatedMinutes: number;
		queuedMinutes: number;
		sampledMinutes: number;
	};
	lag: { maxMs: number; badMinutes: number };
	rssMbMax: number;
	timeline: { t: number; n: number; err: number; p95: number; avgDb: number; pendingMax: number; borrowedMax: number; lagMax: number; cpu: number }[];
}

export function aggregate(buckets: Bucket[], windowMin: number, now = Date.now()): Snapshot {
	const from = now - windowMin * MINUTE;
	const bs = buckets.filter((b) => b.t + MINUTE > from && b.t <= now);

	const all: number[] = [];
	const routes = new Map<string, RouteAgg>();
	const sources = new Map<string, SrcAgg>();
	const pairs = new Map<string, number>();
	const queries = new Map<string, QAgg>();
	const client = new Map<string, ClientAgg>();
	const errs = new Map<string, ErrAgg>();
	const jobs = new Map<string, JobAgg>();
	let n = 0, err = 0, aborted = 0, sumMs = 0, sumDb = 0, sumAcq = 0, inflightMax = 0;
	let poolMax = 0, maxBorrowed = 0, maxPending = 0, minAvail = Number.MAX_SAFE_INTEGER;
	let saturated = 0, queued = 0, sampled = 0, lagMax = 0, lagBad = 0, rss = 0, trafficMin = 0;

	for (const b of bs) {
		n += b.n; err += b.err; aborted += b.aborted; sumMs += b.sumMs; sumDb += b.sumDb; sumAcq += b.sumAcq;
		inflightMax = Math.max(inflightMax, b.inflightMax);
		if (b.n > 0) trafficMin++;
		for (const s of b.samples) all.push(s);
		for (const [k, v] of Object.entries(b.routes)) {
			const r = routes.get(k) ?? { n: 0, err: 0, sumMs: 0, sumDb: 0, maxMs: 0, samples: [] };
			r.n += v.n; r.err += v.err; r.sumMs += v.sumMs; r.sumDb += v.sumDb; r.maxMs = Math.max(r.maxMs, v.maxMs);
			r.samples.push(...v.samples);
			routes.set(k, r);
		}
		for (const [k, v] of Object.entries(b.sources)) {
			const s = sources.get(k) ?? { n: 0, err: 0, sumMs: 0 };
			s.n += v.n; s.err += v.err; s.sumMs += v.sumMs;
			sources.set(k, s);
		}
		for (const [k, v] of Object.entries(b.pairs)) pairs.set(k, (pairs.get(k) ?? 0) + v);
		for (const [k, v] of Object.entries(b.queries)) {
			const q = queries.get(k) ?? { n: 0, err: 0, sumMs: 0, maxMs: 0, samples: [] };
			q.n += v.n; q.err += v.err; q.sumMs += v.sumMs; q.maxMs = Math.max(q.maxMs, v.maxMs);
			q.samples.push(...v.samples);
			queries.set(k, q);
		}
		for (const [k, v] of Object.entries(b.client)) {
			const c = client.get(k) ?? { n: 0, fail: 0, sumMs: 0, samples: [] };
			c.n += v.n; c.fail += v.fail; c.sumMs += v.sumMs;
			c.samples.push(...v.samples);
			client.set(k, c);
		}
		for (const [k, v] of Object.entries(b.errs)) {
			const e = errs.get(k) ?? { ...v, n: 0, idleDrops: 0 };
			e.n += v.n; e.idleDrops += v.idleDrops;
			if (v.lastT >= e.lastT) { e.lastT = v.lastT; e.msg = v.msg; }
			errs.set(k, e);
		}
		for (const [k, v] of Object.entries(b.jobs)) {
			const j = jobs.get(k) ?? { n: 0, err: 0, sumMs: 0, maxMs: 0 };
			j.n += v.n; j.err += v.err; j.sumMs += v.sumMs; j.maxMs = Math.max(j.maxMs, v.maxMs);
			jobs.set(k, j);
		}
		if (b.pool.samples > 0) {
			sampled++;
			poolMax = Math.max(poolMax, b.pool.max);
			maxBorrowed = Math.max(maxBorrowed, b.pool.borrowedMax);
			maxPending = Math.max(maxPending, b.pool.pendingMax);
			minAvail = Math.min(minAvail, b.pool.availableMin);
			if (b.pool.max > 0 && b.pool.borrowedMax >= b.pool.max) saturated++;
			if (b.pool.pendingMax > 0) queued++;
		}
		lagMax = Math.max(lagMax, b.lagMaxMs);
		if (b.lagMaxMs > 100) lagBad++;
		rss = Math.max(rss, b.rssMb);
	}

	const tot = pcts(all);
	const spanMin = Math.max(1, Math.min(windowMin, bs.length ? (now - bs[0].t) / MINUTE : windowMin));
	const routeRows = [...routes.entries()]
		.map(([route, r]) => ({
			route, n: r.n, err: r.err, avgMs: r.sumMs / r.n, p95: pcts(r.samples).p95, maxMs: r.maxMs,
			avgDbMs: r.sumDb / r.n, totalMs: r.sumMs
		}))
		.sort((a, b) => b.totalMs - a.totalMs);
	const serverP95 = new Map(routeRows.map((r) => [r.route.replace(/^\w+ /, ''), r.p95]));

	return {
		from, to: now, windowMin, minutesWithTraffic: trafficMin,
		totals: {
			count: n, errors: err, aborted, errorRate: n ? err / n : 0, rps: n / (spanMin * 60),
			avgMs: n ? sumMs / n : 0, p50: tot.p50, p95: tot.p95, p99: tot.p99, maxMs: tot.max,
			avgDbMs: n ? sumDb / n : 0, avgAcquireMs: n ? sumAcq / n : 0, inflightMax
		},
		routes: routeRows,
		sources: [...sources.entries()]
			.map(([source, s]) => ({ source, n: s.n, err: s.err, avgMs: s.sumMs / s.n, share: n ? s.n / n : 0 }))
			.sort((a, b) => b.n - a.n),
		pairs: [...pairs.entries()]
			.map(([k, c]) => {
				const [source, route] = k.split('\u0001');
				return { source, route, n: c, perMin: c / spanMin };
			})
			.sort((a, b) => b.n - a.n)
			.slice(0, 40),
		queries: [...queries.entries()]
			.map(([shape, q]) => ({ shape, n: q.n, err: q.err, avgMs: q.sumMs / q.n, p95: pcts(q.samples).p95, maxMs: q.maxMs, totalMs: q.sumMs }))
			.sort((a, b) => b.totalMs - a.totalMs)
			.slice(0, 40),
		client: [...client.entries()].map(([route, c]) => ({
			route, n: c.n, fail: c.fail, clientAvgMs: c.sumMs / c.n, clientP95: pcts(c.samples).p95,
			serverP95: serverP95.get(route.replace(/^\w+ /, '')) ?? 0
		})).sort((a, b) => b.n - a.n).slice(0, 40),
		errors: [...errs.values()].sort((a, b) => b.n - a.n).slice(0, 40),
		jobs: [...jobs.entries()].map(([name, j]) => ({ name, n: j.n, err: j.err, avgMs: j.sumMs / j.n, maxMs: j.maxMs })),
		pool: {
			configuredMax: poolMax, maxBorrowed, maxPending, minAvailable: minAvail === Number.MAX_SAFE_INTEGER ? 0 : minAvail,
			saturatedMinutes: saturated, queuedMinutes: queued, sampledMinutes: sampled
		},
		lag: { maxMs: lagMax, badMinutes: lagBad },
		rssMbMax: rss,
		timeline: bs.map((b) => ({
			t: b.t, n: b.n, err: b.err, p95: pcts(b.samples).p95, avgDb: b.n ? b.sumDb / b.n : 0,
			pendingMax: b.pool.pendingMax, borrowedMax: b.pool.borrowedMax, lagMax: b.lagMaxMs, cpu: b.cpuPct
		}))
	};
}
