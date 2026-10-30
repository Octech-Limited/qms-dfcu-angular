import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeService, type RealtimeEvent } from './realtime.service';

class FakeEventSource {
	static CLOSED = 2;
	static instances: FakeEventSource[] = [];
	readyState = 1;
	onerror: (() => void) | null = null;
	private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
	constructor(public url: string) {
		FakeEventSource.instances.push(this);
	}
	addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
	}
	close() {
		this.readyState = 2;
	}
	emit(type: string, data: object = {}) {
		for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) } as MessageEvent<string>);
	}
}

describe('RealtimeService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		FakeEventSource.instances = [];
		vi.stubGlobal('EventSource', FakeEventSource);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('coalesces bursts and filters by branch', () => {
		const service = TestBed.inject(RealtimeService);
		const batches: RealtimeEvent[][] = [];
		service.subscribe(['tickets'], (e) => batches.push(e), 'b1');
		const es = FakeEventSource.instances[0];
		es.emit('ready');
		vi.advanceTimersByTime(200);
		batches.length = 0; // the resync that every open produces
		es.emit('tickets', { type: 'tickets', branchId: 'b1' });
		es.emit('tickets', { type: 'tickets', branchId: 'b1' });
		es.emit('tickets', { type: 'tickets', branchId: 'other' });
		vi.advanceTimersByTime(200);
		expect(batches.length).toBe(1);
		expect(batches[0].length).toBe(2);
	});

	it('sends resync whenever the stream opens and closes with the last subscriber', () => {
		const service = TestBed.inject(RealtimeService);
		const seen: string[] = [];
		const off = service.subscribe(['tickets', 'resync'], (e) => seen.push(...e.map((x) => x.type)));
		const es = FakeEventSource.instances[0];
		es.emit('ready');
		vi.advanceTimersByTime(200);
		es.emit('ready');
		vi.advanceTimersByTime(200);
		expect(seen).toEqual(['resync', 'resync']);
		off();
		expect(es.readyState).toBe(2);
	});
});
