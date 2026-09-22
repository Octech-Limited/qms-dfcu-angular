import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';
import { ApiService } from './api.service';

export const dashboardGuard: CanActivateFn = async () => {
	const session = inject(SessionService);
	const router = inject(Router);
	const current = await session.refresh();
	if (!current.isLoggedIn) {
		await router.navigateByUrl('/login');
		return false;
	}
	return true;
};

export const kioskGuard: CanActivateFn = async () => {
	const api = inject(ApiService);
	const router = inject(Router);
	const s = await api.get<{ isLoggedIn: boolean }>('/api/kiosk-session');
	if (!s.isLoggedIn) {
		await router.navigateByUrl('/kioskLogin');
		return false;
	}
	return true;
};

export const displayGuard: CanActivateFn = async () => {
	const api = inject(ApiService);
	const router = inject(Router);
	const s = await api.get<{ isLoggedIn: boolean }>('/api/displaySession');
	if (!s.isLoggedIn) {
		await router.navigateByUrl('/displayLogin');
		return false;
	}
	return true;
};

export const servingGuard: CanActivateFn = async () => {
	const session = inject(SessionService);
	const router = inject(Router);
	const current = await session.refresh();
	if (!current.isLoggedIn || (current.role !== 'admin' && current.permissions?.['Serving'] !== true)) {
		await router.navigateByUrl('/tellerLogin');
		return false;
	}
	return true;
};
