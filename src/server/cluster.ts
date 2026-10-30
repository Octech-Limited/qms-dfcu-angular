import { logger } from './logger';
import { setBus, type RealtimeEvent } from './realtime/hub';

/** True when this process was forked by scripts/cluster.mjs. */
export const isClusterWorker = process.env['QMS_CLUSTER_WORKER'] === '1' && typeof process.send === 'function';

let leader = process.env['QMS_IS_LEADER'] === 'true';

type RpcHandler = (args: unknown) => unknown;
const rpcHandlers = new Map<string, RpcHandler>();
const pendingCollects = new Map<number, { resolve: (results: unknown[]) => void; timer: ReturnType<typeof setTimeout> }>();
let nextCollectId = 1;

/** Answers `clusterCollect(name, ...)` calls made by any worker (including this one). */
export function onClusterRequest(name: string, handler: RpcHandler): void {
	rpcHandlers.set(name, handler);
}

/**
 * Asks every live worker to run its `onClusterRequest(name)` handler and returns all answers.
 * Outside a cluster it just runs the local handler. Resolves with whatever arrived if some
 * worker is slow (the primary gives up after ~2.5s), and never rejects.
 */
export async function clusterCollect<T>(name: string, args: unknown): Promise<T[]> {
	if (!isClusterWorker) {
		const handler = rpcHandlers.get(name);
		return handler ? [(await handler(args)) as T] : [];
	}
	return new Promise<T[]>((resolve) => {
		const id = nextCollectId++;
		const timer = setTimeout(() => {
			pendingCollects.delete(id);
			resolve([]);
		}, 4000);
		pendingCollects.set(id, { resolve: resolve as (results: unknown[]) => void, timer });
		try {
			process.send?.({ type: 'rpc-collect', id, name, args });
		} catch {
			clearTimeout(timer);
			pendingCollects.delete(id);
			resolve([]);
		}
	});
}

/** Single-process runs are always the leader; in a cluster exactly one worker is. */
export function isLeader(): boolean {
	return !isClusterWorker || leader;
}

/**
 * Wires a worker to the primary: realtime events go through the primary so every worker's SSE
 * clients see them, and the primary tells this worker when it becomes (or stops being) leader.
 */
export function initClusterWorker(onShutdown: () => void): void {
	if (!isClusterWorker) return;
	const handlers: ((event: RealtimeEvent) => void)[] = [];

	setBus({
		publish(event) {
			try {
				process.send?.({ type: 'qms-event', event });
			} catch {
				// primary is gone; this worker is about to be stopped anyway
			}
		},
		onMessage(handler) {
			handlers.push(handler);
		}
	});

	process.on('message', async (message: {
		type?: string;
		event?: RealtimeEvent;
		value?: boolean;
		key?: number;
		id?: number;
		name?: string;
		args?: unknown;
		results?: unknown[];
	}) => {
		if (message?.type === 'qms-event' && message.event) {
			for (const handler of handlers) handler(message.event);
		} else if (message?.type === 'leader') {
			leader = !!message.value;
			logger.info(leader ? 'This worker is now the job leader' : 'This worker is no longer the job leader');
		} else if (message?.type === 'shutdown') {
			onShutdown();
		} else if (message?.type === 'rpc-req') {
			let payload: unknown = null;
			try {
				payload = await rpcHandlers.get(String(message.name))?.(message.args);
			} catch (error) {
				logger.warn('Cluster request handler failed', { name: message.name, error });
			}
			try {
				process.send?.({ type: 'rpc-res', key: message.key, payload });
			} catch {
				// primary is gone
			}
		} else if (message?.type === 'rpc-collect-res') {
			const pending = pendingCollects.get(Number(message.id));
			if (pending) {
				clearTimeout(pending.timer);
				pendingCollects.delete(Number(message.id));
				pending.resolve(message.results ?? []);
			}
		}
	});

	if (leader) logger.info('This worker is the job leader');
}
