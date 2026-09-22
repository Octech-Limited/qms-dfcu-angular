import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';
import { ensureDb } from './db';

type RequestStore = { req: Request; res: Response };

const storage = new AsyncLocalStorage<RequestStore>();

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
	storage.run({ req, res }, () => {
		if (!req.path.startsWith('/api/')) {
			next();
			return;
		}
		ensureDb()
			.then(() => next())
			.catch(next);
	});
}

export function getRequestContext(): RequestStore {
	const ctx = storage.getStore();
	if (!ctx) {
		throw new Error('No request context');
	}
	return ctx;
}

export function tryGetRequestContext(): RequestStore | undefined {
	return storage.getStore();
}
