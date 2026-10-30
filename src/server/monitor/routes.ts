import { createHash, timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { recordClientBatch, recordError } from './collector';
import { getClusterReport } from './clusterReport';
import { DASHBOARD_HTML } from './dashboard';
import { computeInsights } from './insights';
import { clientIp } from './requestMonitor';
import { logger } from '../logger';

/** Trim and drop one pair of surrounding quotes, which some env loaders (PM2, systemd, docker) keep literally. */
function normalizeToken(value: string): string {
	return value.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
}

/** Short one-way fingerprint so two values can be compared in logs without exposing either. */
function fingerprint(value: string): string {
	return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

/** Version marker so you can tell from the logs which build is actually running. */
const MONITOR_AUTH_BUILD = 'auth-v3-quote-strip';

type TokenCheck = { ok: true } | { ok: false; reason: string };

/** Checks the token and, on failure, says why without revealing the expected value or its length. */
function checkToken(req: Request): TokenCheck {
	const expected = normalizeToken(process.env['MONITOR_TOKEN'] ?? '');
	const header = req.headers['authorization'];
	const hasBearer = typeof header === 'string' && /^Bearer\s/i.test(header);
	const fromHeader = hasBearer ? normalizeToken((header as string).replace(/^Bearer\s+/i, '')) : '';
	const fromQuery = normalizeToken(String(req.query['token'] ?? ''));
	const given = fromHeader || fromQuery;
	if (!given) {
		return {
			ok: false,
			reason: typeof header === 'string'
				? `Authorization header arrived with scheme "${header.split(' ')[0].slice(0, 12)}" but no Bearer token (a proxy may be rewriting it)`
				: 'No token received: no Authorization header and no ?token= parameter (a proxy may be stripping the header)'
		};
	}
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true };
	return {
		ok: false,
		reason: `Token received via ${fromHeader ? 'Authorization header' : '?token= parameter'} (${a.length} chars) does not match this server's MONITOR_TOKEN` +
			(/\s/.test(given) ? '; it contains whitespace' : '') + (/["']/.test(given) ? '; it contains quote characters' : '')
	};
}

function requireToken(req: Request, res: Response, next: NextFunction): void {
	if (!normalizeToken(process.env['MONITOR_TOKEN'] ?? '')) {
		res.status(404).json({ error: 'Monitor read access is disabled. Set MONITOR_TOKEN to enable it.' });
		return;
	}
	const check = checkToken(req);
	if (!check.ok) {
		const expected = normalizeToken(process.env['MONITOR_TOKEN'] ?? '');
		const header = req.headers['authorization'];
		const given = normalizeToken(typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : String(req.query['token'] ?? ''));
		logger.warn('Monitor token rejected', {
			build: MONITOR_AUTH_BUILD,
			pid: process.pid,
			pm2: process.env['pm_id'] ?? null,
			ip: clientIp(req),
			host: req.headers['host'],
			reason: check.reason,
			givenLen: given.length,
			givenFp: fingerprint(given),
			expectedLen: expected.length,
			expectedFp: fingerprint(expected),
			rawEnvLen: (process.env['MONITOR_TOKEN'] ?? '').length
		});
		res.status(401).json({ error: 'Invalid monitor token', reason: check.reason, serverPid: process.pid, build: MONITOR_AUTH_BUILD });
		return;
	}
	res.setHeader('Cache-Control', 'no-store');
	next();
}

const clientHits = new Map<string, { n: number; reset: number }>();

function windowOf(req: Request): number {
	const w = Number(req.query['window']);
	return Number.isFinite(w) && w > 0 ? Math.min(w, 1440) : 15;
}

export function registerMonitorRoutes(app: Express): void {
	// Browser round-trip timings. Unauthenticated by design (kiosks/displays have no token) but capped.
	app.post('/api/monitor/client', (req, res) => {
		const ip = clientIp(req);
		const now = Date.now();
		const hit = clientHits.get(ip);
		if (!hit || hit.reset < now) clientHits.set(ip, { n: 1, reset: now + 60_000 });
		else if (++hit.n > 20) {
			res.status(429).end();
			return;
		}
		if (clientHits.size > 2000) clientHits.clear();
		const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
		for (const it of items) {
			if (!it || typeof it.route !== 'string' || typeof it.ms !== 'number' || !Number.isFinite(it.ms)) continue;
			const route = it.route.slice(0, 120);
			const failed = it.failed === true;
			recordClientBatch(route, Math.min(it.ms, 600_000), failed);
			if (failed) {
				recordError({
					kind: 'client',
					code: it.status === 0 ? 'NETWORK' : String(it.status ?? 'FAIL'),
					route,
					message: `Browser saw failure after ${Math.round(it.ms)}ms${it.offline ? ' (offline)' : ''}`
				});
			}
		}
		res.status(204).end();
	});

	app.get('/monitor', (_req, res) => {
		if (!process.env['MONITOR_TOKEN']) {
			res.status(404).send('Monitor read access is disabled. Set MONITOR_TOKEN to enable it.');
			return;
		}
		// Replaces the app-wide nonce CSP: this page is self-contained and holds no data.
		res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'");
		res.setHeader('Cache-Control', 'no-store');
		res.type('html').send(DASHBOARD_HTML);
	});

	app.get('/api/monitor/summary', requireToken, async (req, res, next) => {
		try {
			const report = await getClusterReport(windowOf(req));
			res.json({ live: report.live, snapshot: report.snapshot, insights: computeInsights(report.snapshot) });
		} catch (error) {
			next(error);
		}
	});
	app.get('/api/monitor/insights', requireToken, async (req, res, next) => {
		try {
			res.json(computeInsights((await getClusterReport(windowOf(req))).snapshot));
		} catch (error) {
			next(error);
		}
	});
	app.get('/api/monitor/recent', requireToken, async (_req, res, next) => {
		try {
			res.json((await getClusterReport(15)).rings);
		} catch (error) {
			next(error);
		}
	});
	app.get('/api/monitor/pool', requireToken, async (_req, res, next) => {
		try {
			res.json((await getClusterReport(15)).live.pool);
		} catch (error) {
			next(error);
		}
	});
}
