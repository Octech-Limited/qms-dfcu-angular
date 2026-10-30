import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ServerEventType = 'tickets' | 'counters' | 'announcements-audio' | 'content' | 'session';

export type RealtimeEvent = {
	type: ServerEventType | 'resync';
	scope?: string;
	branchId?: string | null;
	queueId?: string | null;
	counterId?: string | null;
};

type Handler = (events: RealtimeEvent[]) => void;

type Subscription = {
	types: ReadonlySet<string>;
	handler: Handler;
	pending: RealtimeEvent[];
	timer: ReturnType<typeof setTimeout> | null;
};

const SERVER_TYPES: ServerEventType[] = ['tickets', 'counters', 'announcements-audio', 'content', 'session'];
const COALESCE_MS = 150;
const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 30000;

/**
 * One EventSource per tab, shared by every screen. Events are only "something changed" signals:
 * handlers re-run their normal GETs. Handlers also get a `resync` event after every reconnect,
 * because events sent while the stream was down are lost.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
	private readonly platform = inject(PLATFORM_ID);
	private readonly subs = new Set<Subscription>();
	private source: EventSource | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private retryMs = RETRY_MIN_MS;

	/** True while the stream is open. Screens can stretch their fallback poll while this is true. */
	readonly connected = signal(false);

	/**
	 * Calls `handler` with the batch of matching events (coalesced over ~150ms).
	 * Pass `branchId` to receive only that branch's events plus branch-less (global) ones.
	 * Returns an unsubscribe function.
	 */
	subscribe(
		types: readonly (ServerEventType | 'resync')[],
		handler: Handler,
		branchId?: string | null
	): () => void {
		const sub: Subscription = {
			types: new Set(types),
			handler: branchId
				? (events) => {
						const own = events.filter((e) => !e.branchId || e.branchId === branchId);
						if (own.length) handler(own);
					}
				: handler,
			pending: [],
			timer: null
		};
		this.subs.add(sub);
		this.open();
		return () => {
			if (sub.timer) clearTimeout(sub.timer);
			this.subs.delete(sub);
			if (this.subs.size === 0) this.close();
		};
	}

	private open(): void {
		if (!isPlatformBrowser(this.platform) || typeof EventSource === 'undefined') return;
		if (this.source || this.retryTimer) return;
		const source = new EventSource('/api/events', { withCredentials: true });
		this.source = source;

		source.addEventListener('ready', () => {
			this.connected.set(true);
			this.retryMs = RETRY_MIN_MS;
			// Also on the first connect: a screen's initial load may have finished before the stream opened.
			this.dispatch({ type: 'resync' });
		});
		for (const type of SERVER_TYPES) {
			source.addEventListener(type, (message) => {
				try {
					this.dispatch(JSON.parse((message as MessageEvent<string>).data));
				} catch {
					this.dispatch({ type });
				}
			});
		}
		source.onerror = () => {
			this.connected.set(false);
			// CLOSED means the browser gave up (e.g. 401 after logout); EventSource retries on its own otherwise.
			if (source.readyState === EventSource.CLOSED) {
				source.close();
				this.source = null;
				this.scheduleRetry();
			}
		};
	}

	private scheduleRetry(): void {
		if (this.retryTimer || this.subs.size === 0) return;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			if (this.subs.size > 0) this.open();
		}, this.retryMs);
		this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
	}

	private close(): void {
		this.source?.close();
		this.source = null;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = null;
		this.connected.set(false);
	}

	private dispatch(event: RealtimeEvent): void {
		for (const sub of this.subs) {
			if (event.type !== 'resync' && !sub.types.has(event.type)) continue;
			sub.pending.push(event);
			if (sub.timer) continue;
			sub.timer = setTimeout(() => {
				sub.timer = null;
				const batch = sub.pending;
				sub.pending = [];
				sub.handler(batch);
			}, COALESCE_MS);
		}
	}
}
