import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  Bell,
  Building2,
  ClipboardList,
  DollarSign,
  Facebook,
  FileSearch,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  LucideAngularModule,
  Menu,
  Monitor,
  Presentation,
  Settings,
  Shield,
  TowerControl,
  Users,
  X,
} from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { InactivityTimeoutService } from '../../core/inactivity-timeout.service';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';

type SidebarSettings = {
  companyName?: string | null;
  logoImage?: string | null;
};

@Component({
  selector: 'app-dashboard-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <div class="flex h-svh overflow-hidden bg-background">
      @if (mobileOpen()) {
        <button
          class="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-label="Close navigation"
          (click)="mobileOpen.set(false)"
        ></button>
      }
      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:static md:h-full md:translate-x-0"
        [class.translate-x-0]="mobileOpen()"
      >
        <div class="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div class="flex min-w-0 flex-1 items-center">
            @if (settings()?.logoImage) {
              <img
                [src]="settings()!.logoImage!"
                alt="Company Logo"
                class="h-12 w-auto max-w-full object-contain object-left"
              />
            } @else {
              <span class="truncate text-base font-bold">{{
                settings()?.companyName || 'Queue Management'
              }}</span>
            }
          </div>
          <button
            class="rounded-md p-2 hover:bg-white/10 md:hidden"
            (click)="mobileOpen.set(false)"
            aria-label="Close navigation"
          >
            <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
          </button>
        </div>
        <nav class="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
          @for (item of items; track item.href) {
            @if (session.has(item.perm) || item.perm === 'Home') {
              <a
                class="flex items-center gap-3 rounded-md px-3 py-2.5 text-white/85 transition-colors hover:bg-sidebar-accent hover:text-white"
                [routerLink]="item.href"
                routerLinkActive="bg-sidebar-accent text-white shadow-sm"
                (click)="mobileOpen.set(false)"
              >
                <lucide-angular [img]="item.icon" class="size-4"></lucide-angular>
                <span>{{ item.label }}</span>
              </a>
            }
          }
        </nav>
        <div class="border-t border-sidebar-border p-3">
          @if (session.session().username) {
            <p class="truncate px-3 pb-2 text-sm font-medium text-white">
              {{ session.session().username }}
            </p>
          }
          <button
            class="flex w-full items-center gap-3 rounded-md bg-red-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
            (click)="logout()"
          >
            <lucide-angular [img]="icons.LogOut" class="size-4"></lucide-angular>
            Logout
          </button>
        </div>
      </aside>
      <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          class="flex h-16 shrink-0 items-center gap-3 bg-primary px-4 text-primary-foreground shadow-sm"
        >
          <button
            class="rounded-md p-2 hover:bg-white/10 md:hidden"
            (click)="mobileOpen.set(true)"
            aria-label="Open navigation"
          >
            <lucide-angular [img]="icons.Menu" class="size-5"></lucide-angular>
          </button>
          <div class="h-4 w-px bg-white/30"></div>
          <h1 class="text-xl font-semibold">{{ currentTitle() }}</h1>
        </header>
        <main class="app-backdrop min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <router-outlet />
        </main>
      </section>
    </div>
  `,
})
export class DashboardShellPage implements OnInit, OnDestroy {
  readonly session = inject(SessionService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly inactivity = inject(InactivityTimeoutService);
  private readonly toast = inject(ToastService);
  readonly mobileOpen = signal(false);
  readonly settings = signal<SidebarSettings | null>(null);
  readonly icons = { Menu, X, LogOut };
  readonly items = [
    { href: '/dashboard/home', label: 'Dashboard', perm: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/branches', label: 'Branches', perm: 'Branches', icon: Building2 },
    { href: '/dashboard/roles', label: 'Roles', perm: 'Roles', icon: Shield },
    { href: '/dashboard/users', label: 'Users', perm: 'Users', icon: Users },
    { href: '/dashboard/ads', label: 'Ads', perm: 'Ads', icon: Presentation },
    { href: '/dashboard/preview', label: 'Hall Display Preview', perm: 'Preview', icon: Monitor },
    { href: '/dashboard/exchange', label: 'Forex', perm: 'ExchangeRates', icon: DollarSign },
    { href: '/dashboard/queues', label: 'Queues', perm: 'Queues', icon: FileText },
    { href: '/dashboard/counters', label: 'Counters', perm: 'Home', icon: TowerControl },
    { href: '/dashboard/announcements', label: 'Announcements', perm: 'Announcements', icon: Bell },
    { href: '/dashboard/socials', label: 'Social Media', perm: 'Socials', icon: Facebook },
    { href: '/dashboard/settings', label: 'Settings', perm: 'Settings', icon: Settings },
    { href: '/dashboard/ticket-history', label: 'Ticket History', perm: 'Home', icon: History },
    { href: '/dashboard/sessions', label: 'Sessions', perm: 'Sessions', icon: ClipboardList },
    { href: '/dashboard/logs', label: 'Logs', perm: 'Logs', icon: FileSearch },
    { href: '/dashboard/audit-logs', label: 'Audit Logs', perm: 'AuditLogs', icon: FileSearch },
  ];

  async ngOnInit() {
    this.inactivity.start({
      timeoutMinutes: 5,
      onExpire: () => this.logoutDueToInactivity(),
    });
    try {
      this.settings.set(await this.api.get<SidebarSettings>('/api/bank/settings'));
    } catch {
      this.settings.set(null);
    }
  }

  ngOnDestroy() {
    this.inactivity.stop();
  }

  currentTitle() {
    const path = this.router.url.split('?')[0];
    return this.items.find((item) => item.href === path)?.label || 'Dashboard';
  }

  async logoutDueToInactivity() {
    this.toast.error('Session expired due to inactivity. Redirecting to login...');
    try {
      await this.session.logout();
    } catch {
      /* still redirect */
    }
    await this.router.navigateByUrl('/login');
  }

  async logout() {
    this.inactivity.stop();
    await this.session.logout();
    await this.router.navigateByUrl('/login');
  }
}
