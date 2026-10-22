import 'dotenv/config';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { requestContextMiddleware } from './server/requestContext';
import { applyCspNonces, buildCSPHeader, generateCSPNonce, getSecurityHeaders } from './server/csp';
import { registerApi } from './server/api';
import { ensureDb } from './server/db';
import { expireTicketsPastCreationDay } from './server/ticketService';
import { logger } from './server/logger';
import { requestMonitorMiddleware } from './server/monitor/requestMonitor';
import { registerMonitorRoutes } from './server/monitor/routes';
import { recordError, startMonitor, timedJob } from './server/monitor/collector';

const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();
const allowedHostsEnv = (process.env['NG_ALLOWED_HOSTS'] || process.env['ALLOWED_HOSTS'] || 'localhost,127.0.0.1')
	.split(',')
	.map((host) => host.trim())
	.filter(Boolean);
const angularApp = new AngularNodeAppEngine({
	// Use NG_ALLOWED_HOSTS=* (or ALLOWED_HOSTS=*) when accessing via LAN IP / hostname.
	allowedHosts: allowedHostsEnv,
});

startMonitor();
app.use(requestMonitorMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(requestContextMiddleware);
app.use((req, res, next) => {
  const nonce = generateCSPNonce();
  const isApi = req.path.startsWith('/api/');
  for (const [key, value] of Object.entries(getSecurityHeaders(isApi))) {
    res.setHeader(key, value);
  }
  res.setHeader('Content-Security-Policy', buildCSPHeader(nonce));
  res.removeHeader('X-Powered-By');
  (res.locals as { cspNonce: string }).cspNonce = nonce;
  next();
});

app.use('/api/bank/settings/images', express.static(join(process.cwd(), 'uploads')));
app.use('/api/bank/ads/images', express.static(join(process.cwd(), 'uploads')));
registerMonitorRoutes(app);
registerApi(app);

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);
app.use('/audio', express.static(join(process.cwd(), 'public', 'audio')));
app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api/')) {
    logger.error('Unhandled API error', { method: req.method, url: req.originalUrl, err });
    recordError({
      kind: 'handler',
      code: (err as { code?: string })?.code,
      route: `${req.method} ${req.route?.path ?? req.path}`,
      message: err instanceof Error ? err.message : String(err)
    });
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
  next(err);
});

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => {
      if (!response) return next();
      const nonce = (res.locals as { cspNonce?: string }).cspNonce;
      if (nonce && response.body) {
        return response.text().then((html) => {
          const stamped = applyCspNonces(html, nonce);
          res.status(response.status);
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'content-length') res.setHeader(key, value);
          });
          res.send(stamped);
        });
      }
      return writeResponseToNodeResponse(response, res);
    })
    .catch(next);
});

let ticketExpirationStarted = false;

function startTicketExpiration() {
	if (ticketExpirationStarted) return;
	ticketExpirationStarted = true;
	const run = () => {
		void timedJob('ticket-expiry-sweep', () => ensureDb().then(() => expireTicketsPastCreationDay())).catch((error) =>
			logger.error('Ticket expiration sweep failed', error)
		);
	};
	run();
	setInterval(run, 60_000);
}

if (isMainModule(import.meta.url) || process.env['pm_id']) {
	const port = Number(process.env['PORT'] || 4000);
	const host = process.env['HOST'] || '0.0.0.0';
	app.listen(port, host, (error) => {
		if (error) throw error;
		console.log(`Node Express server listening on http://${host}:${port}`);
		startTicketExpiration();
	});
} else {
	startTicketExpiration();
}

export const reqHandler = createNodeRequestHandler(app);
