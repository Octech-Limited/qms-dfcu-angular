import { EventEmitter } from 'node:events';

export type RealtimeEvent =
	| { type: 'tickets'; branchId: string; queueId?: string | null; counterId?: string | null }
	| { type: 'counters'; branchId?: string }
	| { type: 'announcements-audio'; branchId?: string }
	| {
			type: 'content';
			scope: 'settings' | 'marquee' | 'ads' | 'social' | 'rates' | 'branch' | 'queues';
			/** Omit for content shared by every branch. */
			branchId?: string | null;
	  }
	| { type: 'session'; userId: string };

export type Subscriber = {
	/** null = sees every branch (admin). */
	branchId: string | null;
	userId?: string | null;
	send: (event: RealtimeEvent) => void;
};

/**
 * Transport behind the hub. Today it is in-process; a cluster-IPC or DB-poll bus can replace it
 * without touching any publish() call site.
 */
export interface Bus {
	publish(event: RealtimeEvent): void;
	onMessage(handler: (event: RealtimeEvent) => void): void;
}

class LocalBus implements Bus {
	private readonly emitter = new EventEmitter();
	constructor() {
		this.emitter.setMaxListeners(0);
	}
	publish(event: RealtimeEvent): void {
		this.emitter.emit('event', event);
	}
	onMessage(handler: (event: RealtimeEvent) => void): void {
		this.emitter.on('event', handler);
	}
}

const subscribers = new Set<Subscriber>();
let bus: Bus = new LocalBus();

function deliver(event: RealtimeEvent): void {
	for (const sub of subscribers) {
		if (event.type === 'session') {
			if (sub.userId !== event.userId) continue;
		} else {
			const eventBranch = 'branchId' in event ? event.branchId : undefined;
			if (eventBranch && sub.branchId && sub.branchId !== eventBranch) continue;
		}
		try {
			sub.send(event);
		} catch {
			// a dead socket is removed by its close handler
		}
	}
}

bus.onMessage(deliver);

export function setBus(next: Bus): void {
	bus = next;
	bus.onMessage(deliver);
}

/** Fire-and-forget. Never throws, so a mutation can't fail because of realtime. */
export function publish(event: RealtimeEvent): void {
	try {
		bus.publish(event);
	} catch {
		// ignore
	}
}

export function subscribe(sub: Subscriber): () => void {
	subscribers.add(sub);
	return () => subscribers.delete(sub);
}

export function subscriberCount(): number {
	return subscribers.size;
}
