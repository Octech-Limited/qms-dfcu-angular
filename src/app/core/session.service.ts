import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export type PublicSession = {
	isLoggedIn: boolean;
	userId?: string;
	username?: string;
	role?: string;
	actorType?: string;
	branchId?: string;
	counterId?: string;
	permissions?: Record<string, boolean>;
};

@Injectable({ providedIn: 'root' })
export class SessionService {
	private readonly api = inject(ApiService);
	readonly session = signal<PublicSession>({ isLoggedIn: false });

	async refresh() {
		const session = await this.api.get<PublicSession>('/api/session');
		this.session.set(session);
		return session;
	}

	async logout() {
		await this.api.post('/api/logout');
		this.session.set({ isLoggedIn: false });
	}

	has(permission: string) {
		const s = this.session();
		return s.role === 'admin' || s.permissions?.[permission] === true;
	}
}
