import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const ACTIVITY_EVENTS = [
	'mousedown',
	'mousemove',
	'keypress',
	'scroll',
	'touchstart',
	'click',
	'keydown',
] as const;

/**
 * Client-side idle session killer for dashboard and serving only.
 * Kiosk / hall must not use this — their sessions stay for ~1 month.
 */
@Injectable({ providedIn: 'root' })
export class InactivityTimeoutService {
	private readonly platform = inject(PLATFORM_ID);

	private timeoutId: ReturnType<typeof setTimeout> | null = null;
	private throttleId: ReturnType<typeof setTimeout> | null = null;
	private lastActivity = Date.now();
	private terminating = false;
	private timeoutMs = 5 * 60 * 1000;
	private onExpire: (() => void | Promise<void>) | null = null;
	private boundReset: (() => void) | null = null;

	/** Start (or restart) watching. Default: 5 minutes. */
	start(options: { timeoutMinutes?: number; onExpire: () => void | Promise<void> }): void {
		if (!isPlatformBrowser(this.platform)) return;
		this.stop();
		this.terminating = false;
		this.timeoutMs = (options.timeoutMinutes ?? 5) * 60 * 1000;
		this.onExpire = options.onExpire;
		this.lastActivity = Date.now();
		this.boundReset = () => this.throttledReset();
		for (const event of ACTIVITY_EVENTS) {
			document.addEventListener(event, this.boundReset, { passive: true });
		}
		this.schedule();
	}

	stop(): void {
		if (!isPlatformBrowser(this.platform)) return;
		if (this.boundReset) {
			for (const event of ACTIVITY_EVENTS) {
				document.removeEventListener(event, this.boundReset);
			}
			this.boundReset = null;
		}
		if (this.timeoutId) clearTimeout(this.timeoutId);
		if (this.throttleId) clearTimeout(this.throttleId);
		this.timeoutId = null;
		this.throttleId = null;
		this.onExpire = null;
	}

	private throttledReset(): void {
		if (this.terminating) return;
		if (this.throttleId) return;
		this.throttleId = setTimeout(() => {
			this.throttleId = null;
			this.lastActivity = Date.now();
			this.schedule();
		}, 1000);
	}

	private schedule(): void {
		if (this.timeoutId) clearTimeout(this.timeoutId);
		this.timeoutId = setTimeout(() => void this.fire(), this.timeoutMs);
	}

	private async fire(): Promise<void> {
		if (this.terminating || !this.onExpire) return;
		const idle = Date.now() - this.lastActivity;
		if (idle < this.timeoutMs) {
			this.schedule();
			return;
		}
		this.terminating = true;
		const cb = this.onExpire;
		this.stop();
		await cb();
	}
}
