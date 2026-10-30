import type { Express } from 'express';
import { requireAnySession, sendAuthError } from '../auth';
import { subscribe, type RealtimeEvent } from './hub';

const HEARTBEAT_MS = 15_000;

export function registerRealtimeRoutes(app: Express): void {
	app.get('/api/events', async (req, res) => {
		// Auth first: iron-session may write cookies, which must happen before the stream headers.
		const auth = await requireAnySession();
		if (auth.error) return sendAuthError(res, auth.error);
		if (auth.sessionType === null) return;

		let branchId: string | null =
			auth.regularSession?.branchId || auth.displaySession?.branchId || auth.kioskSession?.branchId || null;
		const requested = typeof req.query['branchId'] === 'string' ? req.query['branchId'] : '';
		// Only branchless (admin) sessions may choose a branch; everyone else is pinned to their own.
		if (!branchId && /^[0-9a-fA-F-]{8,64}$/.test(requested)) branchId = requested;
		const userId = auth.regularSession?.userId ?? null;

		res.writeHead(200, {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		});
		res.write('retry: 3000\n\n');
		res.write('event: ready\ndata: {}\n\n');

		const write = (event: RealtimeEvent) => {
			res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
			if (event.type === 'session') {
				res.end();
			}
		};
		const unsubscribe = subscribe({ branchId, userId, send: write });
		const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

		req.on('close', () => {
			clearInterval(heartbeat);
			unsubscribe();
		});
	});
}
