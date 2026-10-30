import type { NextFunction, Request, Response } from 'express';
import { publish, type RealtimeEvent } from './hub';

/**
 * Route-level middleware: publishes after the response finishes with a 2xx/3xx status,
 * so failed or rejected writes never notify anyone.
 */
export function emitOnSuccess(build: (req: Request) => RealtimeEvent | null) {
	return (req: Request, res: Response, next: NextFunction): void => {
		res.on('finish', () => {
			if (res.statusCode >= 400) return;
			const event = build(req);
			if (event) publish(event);
		});
		next();
	};
}
