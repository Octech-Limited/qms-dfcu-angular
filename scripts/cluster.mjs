// Runs the SSR server as several worker processes sharing one port.
//   node scripts/cluster.mjs            (WORKERS=4 by default)
// Signals to the primary:  SIGTERM/SIGINT = graceful stop,  SIGUSR2 = rolling restart.
import cluster from 'node:cluster';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '../dist/qmsangular/server/server.mjs');
const WORKERS = Math.max(1, Number.parseInt(process.env.WORKERS ?? '', 10) || 4);
const STOP_GRACE_MS = 15_000;

const log = (msg) => console.log(`[cluster ${new Date().toISOString()}] ${msg}`);

if (!cluster.isPrimary) {
	throw new Error('scripts/cluster.mjs must be started as the cluster primary');
}

cluster.setupPrimary({ exec: entry });

/** slot (1..WORKERS) -> worker. Slots give each worker a stable log file name. */
const slots = new Map();
let leader = null; // worker.id of the job leader
let shuttingDown = false;
let reloading = false;
const crashes = [];

function fork(slot, { leaderOverride } = {}) {
	const becomesLeader = leaderOverride ?? leader === null;
	const worker = cluster.fork({
		QMS_CLUSTER_WORKER: '1',
		QMS_WORKER_ID: String(slot),
		QMS_IS_LEADER: String(becomesLeader)
	});
	worker.slot = slot;
	if (becomesLeader) leader = worker.id;
	slots.set(slot, worker);
	log(`worker ${slot} started (pid ${worker.process.pid})${becomesLeader ? ' as leader' : ''}`);
	return worker;
}

function electLeader() {
	const next = [...slots.values()].find((w) => w.isConnected() && !w.isDead());
	leader = next ? next.id : null;
	if (next) {
		next.send({ type: 'leader', value: true });
		log(`worker ${next.slot} is the new leader`);
	}
}

// "Ask every worker" requests (used by the monitor dashboard to merge per-worker stats).
// requester sends rpc-collect; each live worker answers rpc-res; the requester gets rpc-collect-res.
const pendingRpc = new Map();
let rpcKey = 0;

function finishRpc(key) {
	const call = pendingRpc.get(key);
	if (!call) return;
	pendingRpc.delete(key);
	clearTimeout(call.timer);
	if (call.requester.isConnected()) {
		call.requester.send({ type: 'rpc-collect-res', id: call.id, results: call.results });
	}
}

function startRpc(requester, message) {
	const targets = [...slots.values()].filter((w) => w.isConnected() && !w.isDead());
	if (!targets.length) return requester.send({ type: 'rpc-collect-res', id: message.id, results: [] });
	const key = ++rpcKey;
	const call = {
		requester,
		id: message.id,
		waiting: new Set(targets.map((w) => w.id)),
		results: [],
		timer: setTimeout(() => finishRpc(key), 2500)
	};
	pendingRpc.set(key, call);
	for (const worker of targets) worker.send({ type: 'rpc-req', key, name: message.name, args: message.args });
}

cluster.on('message', (worker, message) => {
	if (message?.type === 'qms-event') {
		for (const w of Object.values(cluster.workers)) {
			if (w?.isConnected()) w.send(message);
		}
	} else if (message?.type === 'rpc-collect') {
		startRpc(worker, message);
	} else if (message?.type === 'rpc-res') {
		const call = pendingRpc.get(message.key);
		if (!call) return;
		call.results.push(message.payload);
		call.waiting.delete(worker.id);
		if (call.waiting.size === 0) finishRpc(message.key);
	}
});

cluster.on('exit', (worker, code, signal) => {
	// A worker that dies mid-request must not hold up the others' answers.
	for (const [key, call] of pendingRpc) {
		if (call.waiting.delete(worker.id) && call.waiting.size === 0) finishRpc(key);
	}
	if (slots.get(worker.slot) === worker) slots.delete(worker.slot);
	const wasLeader = leader === worker.id;
	if (wasLeader) leader = null;
	if (shuttingDown || worker.intentional) return;

	log(`worker ${worker.slot} exited (${signal ?? code}) - restarting`);
	if (wasLeader) electLeader();

	// Back off if workers keep crashing right away, so a bad deploy doesn't spin the CPU.
	const now = Date.now();
	crashes.push(now);
	while (crashes.length && now - crashes[0] > 30_000) crashes.shift();
	// Allow every worker to die together twice before slowing down (e.g. a brief DB outage).
	const delay = crashes.length > WORKERS * 2 ? 10_000 : 500;
	setTimeout(() => {
		if (!shuttingDown && !slots.has(worker.slot)) fork(worker.slot);
	}, delay);
});

const waitListening = (worker, ms = 30_000) =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`worker ${worker.slot} did not start listening`)), ms);
		worker.once('listening', () => {
			clearTimeout(timer);
			resolve();
		});
	});

function stopWorker(worker) {
	return new Promise((resolve) => {
		if (worker.isDead()) return resolve();
		worker.intentional = true;
		const kill = setTimeout(() => worker.process.kill('SIGKILL'), STOP_GRACE_MS);
		worker.once('exit', () => {
			clearTimeout(kill);
			resolve();
		});
		if (leader === worker.id) worker.send({ type: 'leader', value: false });
		worker.send({ type: 'shutdown' });
	});
}

async function rollingRestart() {
	if (reloading || shuttingDown) return;
	reloading = true;
	log('rolling restart started');
	try {
		for (const slot of [...slots.keys()].sort((a, b) => a - b)) {
			const old = slots.get(slot);
			const wasLeader = leader === old.id;
			// Start the replacement first so capacity never drops, then retire the old worker.
			const fresh = fork(slot, { leaderOverride: false });
			await waitListening(fresh);
			if (wasLeader) {
				leader = fresh.id;
				fresh.send({ type: 'leader', value: true });
			}
			await stopWorker(old);
		}
		log('rolling restart finished');
	} catch (error) {
		log(`rolling restart failed: ${error.message}`);
	} finally {
		reloading = false;
	}
}

async function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	log(`${signal} received - stopping ${slots.size} workers`);
	await Promise.all([...slots.values()].map(stopWorker));
	log('all workers stopped');
	process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGUSR2', () => void rollingRestart());

log(`starting ${WORKERS} workers`);
for (let slot = 1; slot <= WORKERS; slot++) fork(slot);
