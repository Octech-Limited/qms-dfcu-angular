import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { monitorStorage, recordError, requestFinished, requestStarted, type RequestRecord } from './collector';

const STATIC_EXT = /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|mp3|wav|ogg|json|txt)$/i;

function collapse(p: string): string {
	return p
		.split('/')
		.map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /^[0-9a-f]{16,}$/i.test(seg) ? ':id' : seg))
		.join('/');
}

/** Stable route label: matched Express pattern for API calls, collapsed path otherwise. */
export function routeLabel(req: Request): string {
	const matched = req.route?.path as string | undefined;
	if (matched) return `${req.method} ${req.baseUrl ?? ''}${matched}`;
	const p = req.path;
	if (STATIC_EXT.test(p)) return 'STATIC';
	if (p.startsWith('/api/')) return `${req.method} ${collapse(p)} (unmatched)`;
	return `PAGE ${collapse(p)}`;
}

export function clientIp(req: Request): string {
	const fwd = req.headers['x-forwarded-for'];
	const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
	return (first || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

export function classifyPage(page: string): string {
	const p = page.toLowerCase();
	if (p.includes('kiosk')) return 'kiosk';
	if (p.includes('halldisplay') || p.includes('display')) return 'hall-display';
	if (p.includes('serving')) return 'teller';
	if (p.includes('dashboard') || p.includes('settingsform')) return 'admin';
	if (p.includes('rate') || p.includes('rating') || p.includes('feedback')) return 'feedback';
	if (p.includes('login')) return 'login';
	return p ? 'other' : 'unknown';
}

function pageOf(req: Request): string {
	const hdr = req.headers['x-qms-page'];
	if (typeof hdr === 'string' && hdr) return hdr.slice(0, 80);
	const ref = req.headers['referer'];
	if (typeof ref === 'string') {
		try {
			return new URL(ref).pathname.slice(0, 80);
		} catch {
			/* ignore */
		}
	}
	return '';
}

/** Mount first. Times every request and splits the time into DB vs app. */
export function requestMonitorMiddleware(req: Request, res: Response, next: NextFunction): void {
	// The monitor's own traffic must not pollute the stats it reports.
	// SSE streams stay open for hours; counting them would wreck inflight and latency stats.
	if (req.path.startsWith('/api/monitor') || req.path === '/monitor' || req.path === '/api/events') {
		next();
		return;
	}
	const rec: RequestRecord = {
		id: (req.headers['x-request-id'] as string) || randomUUID().slice(0, 8),
		startedAt: performance.now(),
		dbMs: 0,
		acquireMs: 0,
		queries: 0,
		// Live label so slow queries can be attributed to the route Express matched.
		get route() {
			return req.route?.path ? `${req.method} ${req.baseUrl ?? ''}${req.route.path}` : `${req.method} ${req.path}`;
		}
	};
	res.setHeader('X-Request-Id', rec.id);
	requestStarted();
	let done = false;

	const finish = (aborted: boolean) => {
		if (done) return;
		done = true;
		const ms = performance.now() - rec.startedAt;
		const route = routeLabel(req);
		const page = pageOf(req);
		const ip = clientIp(req);
		const source = `${classifyPage(page)}@${ip}`;
		if (res.statusCode >= 500) {
			recordError({ kind: 'request', route, status: res.statusCode, message: `HTTP ${res.statusCode} on ${req.method} ${req.originalUrl.slice(0, 120)}` });
		}
		requestFinished({
			id: rec.id, method: req.method, url: req.originalUrl, ip, route, status: aborted ? 499 : res.statusCode, ms,
			dbMs: rec.dbMs, acquireMs: rec.acquireMs, queries: rec.queries, source, aborted,
			bytes: Number(res.getHeader('content-length')) || 0
		});
	};
	res.on('finish', () => finish(false));
	res.on('close', () => finish(!res.writableFinished));

	monitorStorage.run(rec, next);
}
