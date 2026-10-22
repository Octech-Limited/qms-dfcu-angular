#!/usr/bin/env node
// Offline report over logs/monitor/*.jsonl (written by the in-app monitor).
// Usage: npm run monitor:report -- [--date YYYY-MM-DD] [--from HH:MM] [--to HH:MM] [--dir path] [--top N]
// Requires Node >= 22.18 (runs the shared TypeScript analysis modules directly).
import fs from 'node:fs';
import path from 'node:path';
import { aggregate, MINUTE } from '../src/server/monitor/store.ts';
import { computeInsights } from '../src/server/monitor/insights.ts';

const args = Object.fromEntries(
	process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), [])
);
const dir = args.dir || process.env.MONITOR_DIR || path.join(process.cwd(), 'logs', 'monitor');
const top = Number(args.top || 10);
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const date = args.date || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const file = path.join(dir, `${date}.jsonl`);

if (!fs.existsSync(file)) {
	console.error(`No monitor data at ${file}. Is the app running a build that includes the monitor?`);
	process.exit(1);
}

const at = (hhmm, fallback) => {
	if (!hhmm) return fallback;
	const [h, m] = hhmm.split(':').map(Number);
	return new Date(`${date}T${pad(h)}:${pad(m || 0)}:00`).getTime();
};
const dayStart = new Date(`${date}T00:00:00`).getTime();
const from = at(args.from, dayStart);
const to = at(args.to, dayStart + 86_400_000);

const byT = new Map();
const events = { errors: [], slow: [], queries: [], starts: [] };
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
	if (!line) continue;
	let r;
	try { r = JSON.parse(line); } catch { continue; }
	if (r.k === 'min') {
		const prev = byT.get(r.bucket.t);
		if (!prev || r.bucket.n >= prev.n) byT.set(r.bucket.t, r.bucket);
	} else if (r.k === 'err') events.errors.push(r);
	else if (r.k === 'req') events.slow.push(r);
	else if (r.k === 'query') events.queries.push(r);
	else if (r.k === 'start' || r.k === 'stop') events.starts.push(r);
}
const buckets = [...byT.values()].filter((b) => b.t >= from - MINUTE && b.t < to).sort((a, b) => a.t - b.t);
if (!buckets.length) {
	console.error('No data in that time range.');
	process.exit(1);
}

const end = Math.min(to, buckets[buckets.length - 1].t + MINUTE);
const windowMin = Math.ceil((end - Math.max(from, buckets[0].t)) / MINUTE);
const s = aggregate(buckets, windowMin, end);
const ms = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`);
const hm = (t) => new Date(t).toLocaleTimeString([], { hour12: false });
const section = (t) => console.log(`\n=== ${t} ${'='.repeat(Math.max(0, 70 - t.length))}`);
const print = (rows) => rows.length ? console.table(rows) : console.log('  (none)');

console.log(`QMS monitor report  ${date}  ${hm(s.from)} - ${hm(s.to)}  (${buckets.length} minutes of data; p95 across minutes is sampled/approximate)`);

section('DIAGNOSIS');
const icon = { critical: '[CRITICAL]', warning: '[WARNING] ', info: '[info]    ', ok: '[ok]      ' };
for (const i of computeInsights(s)) {
	console.log(`${icon[i.severity]} ${i.title}\n           ${i.detail}${i.advice ? `\n           -> ${i.advice}` : ''}`);
}

const t = s.totals;
section('TOTALS');
print([{ requests: t.count, 'req/s': +t.rps.toFixed(2), '5xx': t.errors, aborted: t.aborted, p50: ms(t.p50), p95: ms(t.p95), p99: ms(t.p99), max: ms(t.maxMs), avgDB: ms(t.avgDbMs), avgPoolWait: ms(t.avgAcquireMs), peakInflight: t.inflightMax }]);

section('POOL / PROCESS');
print([{ configuredMax: s.pool.configuredMax, maxBorrowed: s.pool.maxBorrowed, maxQueued: s.pool.maxPending, minutesQueued: s.pool.queuedMinutes, minutesFull: s.pool.saturatedMinutes, lagMax: ms(s.lag.maxMs), rssMaxMB: s.rssMbMax }]);

section(`BUSIEST MINUTES`);
print([...s.timeline].sort((a, b) => b.n - a.n).slice(0, 5).map((m) => ({ time: hm(m.t), requests: m.n, errors: m.err, p95: ms(m.p95), poolQueueMax: m.pendingMax, lagMax: ms(m.lagMax), cpu: `${m.cpu}%` })));

section('ROUTES (by total time)');
print(s.routes.slice(0, top).map((r) => ({ route: r.route.slice(0, 60), n: r.n, avg: ms(r.avgMs), p95: ms(r.p95), max: ms(r.maxMs), avgDB: ms(r.avgDbMs), '5xx': r.err })));

section('TRAFFIC SOURCES');
print(s.sources.slice(0, top).map((r) => ({ source: r.source, n: r.n, share: `${(r.share * 100).toFixed(1)}%`, avg: ms(r.avgMs), '5xx': r.err })));

section('REPEATED POLLING (source -> route)');
print(s.pairs.slice(0, top).map((r) => ({ source: r.source, route: r.route.slice(0, 55), perMin: +r.perMin.toFixed(1) })));

section('DB QUERIES (by total time)');
print(s.queries.slice(0, top).map((q) => ({ shape: q.shape.slice(0, 70), n: q.n, avg: ms(q.avgMs), p95: ms(q.p95), max: ms(q.maxMs), err: q.err })));

section('ERROR GROUPS');
print(s.errors.slice(0, top).map((e) => ({ kind: e.kind, code: e.code, route: e.route.slice(0, 40), n: e.n, idleDrops: e.idleDrops, last: hm(e.lastT), msg: e.msg.slice(0, 70) })));

section('BROWSER vs SERVER LATENCY');
print(s.client.slice(0, top).map((c) => ({ route: c.route.slice(0, 50), n: c.n, failed: c.fail, browserP95: ms(c.clientP95), serverP95: ms(c.serverP95) })));

section('BACKGROUND JOBS');
print(s.jobs.map((j) => ({ job: j.name, runs: j.n, failed: j.err, avg: ms(j.avgMs), max: ms(j.maxMs) })));

const inRange = (e) => (e.t ?? e.at) >= from && (e.t ?? e.at) < to;
section('SLOWEST / FAILED REQUESTS');
print(events.slow.filter(inRange).sort((a, b) => b.ms - a.ms).slice(0, top).map((r) => ({ time: hm(r.t), route: String(r.route).slice(0, 45), status: r.aborted ? 'aborted' : r.status, total: ms(r.ms), db: ms(r.dbMs), poolWait: ms(r.acquireMs), source: r.source })));

section('PROCESS STARTS / STOPS (restarts explain failures)');
print(events.starts.filter(inRange).map((e) => ({ time: hm(e.at), event: e.k, pid: e.pid ?? '', pm2: e.pm2 ?? '' })));
