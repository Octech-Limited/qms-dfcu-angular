import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { tap } from 'rxjs';

interface ClientTiming {
	route: string;
	ms: number;
	status: number;
	failed: boolean;
	offline: boolean;
}

const FLUSH_MS = 30_000;
const MAX_QUEUE = 200;
let queue: ClientTiming[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function normalizePath(url: string): string {
	let path = url;
	try {
		path = new URL(url, location.origin).pathname;
	} catch {
		/* keep raw */
	}
	return path.replace(/\/(\d+|[0-9a-f]{8}-[0-9a-f-]{20,}|[0-9a-f]{16,})(?=\/|$)/gi, '/:id');
}

function flush(useBeacon: boolean): void {
	if (queue.length === 0) return;
	const body = JSON.stringify({ items: queue });
	queue = [];
	try {
		if (useBeacon && navigator.sendBeacon) {
			navigator.sendBeacon('/api/monitor/client', new Blob([body], { type: 'application/json' }));
		} else {
			void fetch('/api/monitor/client', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body,
				keepalive: true
			}).catch(() => undefined);
		}
	} catch {
		/* monitoring must never break the app */
	}
}

function ensureTimer(): void {
	if (timer) return;
	timer = setInterval(() => flush(false), FLUSH_MS);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush(true);
	});
}

/**
 * Measures browser-side round-trip time for /api calls and tags each call with the current page,
 * so the server monitor can tell network latency apart from server latency and attribute traffic.
 */
export const monitorInterceptor: HttpInterceptorFn = (req, next) => {
	if (!isPlatformBrowser(inject(PLATFORM_ID)) || !req.url.includes('/api/') || req.url.includes('/api/monitor')) {
		return next(req);
	}
	ensureTimer();
	const started = performance.now();
	const route = `${req.method} ${normalizePath(req.url)}`;
	const tagged = req.clone({ setHeaders: { 'x-qms-page': location.pathname.slice(0, 80) } });
	const record = (status: number, failed: boolean) => {
		if (queue.length >= MAX_QUEUE) queue.shift();
		queue.push({ route, ms: Math.round(performance.now() - started), status, failed, offline: !navigator.onLine });
	};
	return next(tagged).pipe(
		tap({
			next: (event: HttpEvent<unknown>) => {
				if (event instanceof HttpResponse) record(event.status, false);
			},
			error: (error: unknown) => {
				const status = error instanceof HttpErrorResponse ? error.status : 0;
				record(status, status === 0 || status >= 500);
			}
		})
	);
};
