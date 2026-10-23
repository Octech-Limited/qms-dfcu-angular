import { timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { getLive, getRings, getSnapshot, recordClientBatch, recordError } from './collector';
import { DASHBOARD_HTML } from './dashboard';
import { computeInsights } from './insights';
import { clientIp } from './requestMonitor';
import { logger } from '../logger';

type TokenCheck = { ok: true } | { ok: false; reason: string };

/** Checks the token and, on failure, says why without revealing the expected value or its length. */
function checkToken(req: Request): TokenCheck {
	const expected = process.env['MONITOR_TOKEN'] ?? '';
	const header = req.headers['authorization'];
	const hasBearer = typeof header === 'string' && /^Bearer\s/i.test(header);
	const fromHeader = hasBearer ? (header as string).replace(/^Bearer\s+/i, '').trim() : '';
	const fromQuery = String(req.query['token'] ?? '').trim();
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
	if (!process.env['MONITOR_TOKEN']) {
		res.status(404).json({ error: 'Monitor read access is disabled. Set MONITOR_TOKEN to enable it.' });
		return;
	}
	const check = checkToken(req);
	if (!check.ok) {
		logger.warn('Monitor token rejected', { ip: clientIp(req), host: req.headers['host'], reason: check.reason });
		res.status(401).json({ error: 'Invalid monitor token', reason: check.reason, serverPid: process.pid });
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

	app.get('/api/monitor/summary', requireToken, (req, res) => {
		const snapshot = getSnapshot(windowOf(req));
		res.json({ live: getLive(), snapshot, insights: computeInsights(snapshot) });
	});
	app.get('/api/monitor/insights', requireToken, (req, res) => {
		res.json(computeInsights(getSnapshot(windowOf(req))));
	});
	app.get('/api/monitor/recent', requireToken, (_req, res) => {
		res.json(getRings());
	});
	app.get('/api/monitor/pool', requireToken, (_req, res) => {
		res.json(getLive().pool);
	});
}
