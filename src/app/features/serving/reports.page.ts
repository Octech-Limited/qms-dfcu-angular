import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowLeft, LucideAngularModule, LogOut } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';
import { eatCalendarDate } from '../../core/timezone';
import { UiButton, UiQueueSpinner } from '../../shared/ui/ui';
import { ActionFilterCardsComponent } from './components/action-filter-cards.component';
import { ReportsHistoryTableComponent } from './components/reports-history-table.component';
import { ReportsStatCardsComponent } from './components/reports-stat-cards.component';
import type { CounterWorkAction, ServingReportsResponse } from './types';

function emptyReports(date: string): ServingReportsResponse {
  return {
    date,
    counterNumber: null,
    stats: {
      totalTickets: 0,
      averageWaitingTime: 0,
      averageServingTime: 0,
      averageHoldTime: 0,
    },
    actionCounts: {
      served: 0,
      held: 0,
      redirected: 0,
      no_show: 0,
    },
    tickets: [],
  };
}

@Component({
  selector: 'app-serving-reports',
  imports: [
    FormsModule,
    RouterLink,
    LucideAngularModule,
    UiButton,
    UiQueueSpinner,
    ReportsStatCardsComponent,
    ActionFilterCardsComponent,
    ReportsHistoryTableComponent,
  ],
  template: `
    <div class="app-backdrop min-h-screen">
      <header
        class="flex h-16 items-center justify-between bg-primary px-4 text-primary-foreground shadow-sm md:px-6"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex size-9 items-center justify-center rounded-lg bg-white font-black text-primary"
          >
            Q
          </div>
          <h1 class="text-xl font-semibold">Reports</h1>
        </div>
        <button
          uiBtn
          variant="ghost"
          extraClass="text-white hover:bg-white/10 hover:text-white"
          (click)="logout()"
        >
          <lucide-angular [img]="icons.LogOut" class="size-4"></lucide-angular>
          Logout
        </button>
      </header>

      @if (loading()) {
        <div class="flex h-[70vh] items-center justify-center">
          <ui-queue-spinner size="lg" />
        </div>
      } @else if (error() && !reports()) {
        <div class="flex h-[70vh] items-center justify-center">
          <p class="text-red-500">{{ error() }}</p>
        </div>
      } @else {
        <div class="container mx-auto space-y-6 px-4 py-5 md:px-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div class="space-y-3">
              <a uiBtn variant="outline" size="sm" routerLink="/serving">
                <lucide-angular [img]="icons.ArrowLeft" class="size-4"></lucide-angular>
                Back to serving
              </a>
              <div>
                <h1 class="text-2xl font-semibold">Reports</h1>
                <p class="text-sm text-muted-foreground">
                  Tickets you handled on the selected day
                </p>
              </div>
            </div>
            <label class="grid w-full gap-2 text-sm font-medium sm:w-auto">
              Date
              <input
                class="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-52"
                type="date"
                [ngModel]="date()"
                [attr.max]="today"
                (ngModelChange)="onDateChange($event)"
              />
            </label>
          </div>

          <div [class.opacity-70]="refreshing()" [class.pointer-events-none]="refreshing()">
            <app-reports-stat-cards
              [totalTickets]="reports()!.stats.totalTickets"
              [counterNumber]="reports()!.counterNumber"
              [stats]="reports()!.stats"
            />
          </div>

          <app-action-filter-cards
            [counts]="reports()!.actionCounts"
            [selected]="actionFilter()"
            (selectedChange)="actionFilter.set($event)"
          />

          <app-reports-history-table
            [tickets]="reports()!.tickets"
            [actionFilter]="actionFilter()"
          />
        </div>
      }
    </div>
  `,
})
export class ServingReportsPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly platform = inject(PLATFORM_ID);

  readonly icons = { ArrowLeft, LogOut };
  readonly today = eatCalendarDate();

  date = signal(eatCalendarDate());
  reports = signal<ServingReportsResponse | null>(null);
  loading = signal(true);
  refreshing = signal(false);
  error = signal<string | null>(null);
  actionFilter = signal<CounterWorkAction | null>(null);

  async ngOnInit() {
    if (!isPlatformBrowser(this.platform)) return;
    await this.loadReports(this.date());
  }

  ngOnDestroy() {
  }

  async onDateChange(next: string) {
    if (!next || next === this.date()) return;
    this.date.set(next);
    this.actionFilter.set(null);
    await this.loadReports(next);
  }

  private async loadReports(selectedDate: string) {
    const firstLoad = !this.reports();
    if (firstLoad) this.loading.set(true);
    else this.refreshing.set(true);
    try {
      const data = await this.api.get<ServingReportsResponse>('/api/bank/serving/reports', {
        date: selectedDate,
      });
      this.reports.set(data ?? emptyReports(selectedDate));
      this.error.set(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load reports';
      this.error.set(message);
      this.toast.error(message);
      if (!this.reports()) this.reports.set(emptyReports(selectedDate));
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  async logout() {
    await this.session.logout();
    location.href = '/tellerLogin';
  }
}
