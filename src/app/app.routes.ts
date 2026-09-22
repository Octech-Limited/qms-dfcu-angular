import { Routes } from '@angular/router';
import { dashboardGuard, displayGuard, kioskGuard, servingGuard } from './core/guards';

export const routes: Routes = [
	{ path: '', loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage) },
	{ path: 'login', loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage), data: { mode: 'user' } },
	{ path: 'adminLoginLocal', loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage), data: { mode: 'admin' } },
	{ path: 'tellerLogin', loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage), data: { mode: 'teller' } },
	{ path: 'kioskLogin', loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage), data: { mode: 'kiosk' } },
	{ path: 'displayLogin', loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage), data: { mode: 'display' } },
	{ path: 'settingsForm', loadComponent: () => import('./features/settings-form/settings-form.page').then((m) => m.SettingsFormPage) },
	{ path: 'kioskDisplay', canActivate: [kioskGuard], loadComponent: () => import('./features/kiosk/kiosk.page').then((m) => m.KioskPage) },
	{ path: 'hallDisplay', canActivate: [displayGuard], loadComponent: () => import('./features/hall/hall-display.page').then((m) => m.HallDisplayPage) },
	{ path: 'serving', canActivate: [servingGuard], loadComponent: () => import('./features/serving/serving.page').then((m) => m.ServingPage) },
	{ path: 'serving/reports', canActivate: [servingGuard], loadComponent: () => import('./features/serving/reports.page').then((m) => m.ServingReportsPage) },
	{
		path: 'dashboard',
		canActivate: [dashboardGuard],
		loadComponent: () => import('./features/dashboard/dashboard-shell.page').then((m) => m.DashboardShellPage),
		children: [
			{ path: 'home', loadComponent: () => import('./features/dashboard/home.page').then((m) => m.DashboardHomePage) },
			{
				path: 'branches',
				loadComponent: () => import('./features/dashboard/branches.page').then((m) => m.BranchesPage)
			},
			{
				path: 'users',
				loadComponent: () => import('./features/dashboard/users.page').then((m) => m.UsersPage)
			},
			{
				path: 'roles',
				loadComponent: () => import('./features/dashboard/roles.page').then((m) => m.RolesPage)
			},
			{ path: 'queues', loadComponent: () => import('./features/dashboard/queues.page').then((m) => m.QueuesPage) },
			{
				path: 'counters',
				data: { title: 'Counters', endpoint: '/api/bank/counters', columns: ['counterNumber', 'queueId', 'available'] },
				loadComponent: () => import('./features/dashboard/crud.page').then((m) => m.CrudPage)
			},
			{ path: 'exchange', loadComponent: () => import('./features/dashboard/exchange.page').then((m) => m.ExchangePage) },
			{
				path: 'ads',
				loadComponent: () => import('./features/dashboard/ads.page').then((m) => m.AdsPage)
			},
			{
				path: 'announcements',
				loadComponent: () =>
					import('./features/dashboard/announcements.page').then((m) => m.AnnouncementsPage)
			},
			{
				path: 'socials',
				loadComponent: () => import('./features/dashboard/socials.page').then((m) => m.SocialsPage)
			},
			{ path: 'settings', loadComponent: () => import('./features/dashboard/settings.page').then((m) => m.DashboardSettingsPage) },
			{ path: 'preview', loadComponent: () => import('./features/dashboard/preview.page').then((m) => m.PreviewPage) },
			{
				path: 'ticket-history',
				loadComponent: () =>
					import('./features/dashboard/ticket-history.page').then((m) => m.TicketHistoryPage),
			},
			{
				path: 'sessions',
				loadComponent: () => import('./features/dashboard/sessions.page').then((m) => m.SessionsPage),
			},
			{
				path: 'logs',
				loadComponent: () => import('./features/dashboard/logs.page').then((m) => m.LogsPage)
			},
			{
				path: 'audit-logs',
				loadComponent: () =>
					import('./features/dashboard/audit-logs.page').then((m) => m.AuditLogsPage)
			},
			{ path: '', pathMatch: 'full', redirectTo: 'home' }
		]
	},
	{ path: 'feedback/login', loadComponent: () => import('./features/feedback/feedback-login.page').then((m) => m.FeedbackLoginPage) },
	{ path: 'RateService/:id', loadComponent: () => import('./features/feedback/rate-service.page').then((m) => m.RateServicePage) },
	{ path: 'rating/:id', loadComponent: () => import('./features/feedback/rating.page').then((m) => m.RatingPage) },
	{ path: '**', redirectTo: '' }
];
