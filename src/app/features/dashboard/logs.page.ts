import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Filter, LucideAngularModule, X } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { formatInEat } from '../../core/timezone';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
  UiQueueSpinner,
} from '../../shared/ui/ui';

type LogUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  username?: string;
};

type Log = {
  id: string;
  userId: string | null;
  action: string;
  details: string;
  createdAt: string;
  user: LogUser | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

@Component({
  selector: 'app-logs',
  imports: [
    FormsModule,
    LucideAngularModule,
    UiButton,
    UiCard,
    UiCardContent,
    UiCardHeader,
    UiCardTitle,
    UiQueueSpinner,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <ui-card class="gap-0 py-0">
        <ui-card-header class="pt-6">
          <ui-card-title class="flex items-center gap-2">
            <lucide-angular [img]="icons.Filter" class="size-5"></lucide-angular>
            Filters
          </ui-card-title>
        </ui-card-header>
        <ui-card-content class="pb-6">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label class="grid gap-2 text-sm font-medium">
              User
              <select
                class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                [(ngModel)]="selectedUserId"
                (ngModelChange)="onFilterChange()"
              >
                <option value="">All users</option>
                @for (user of users(); track user.id) {
                  <option [value]="user.id">
                    {{ user.firstName }} {{ user.lastName }}
                  </option>
                }
              </select>
            </label>
            <label class="grid gap-2 text-sm font-medium">
              Action
              <input
                class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="Filter by action..."
                [(ngModel)]="actionFilter"
                (ngModelChange)="onFilterChange()"
              />
            </label>
            <label class="grid gap-2 text-sm font-medium">
              Start Date
              <input
                type="date"
                class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                [(ngModel)]="startDate"
                (ngModelChange)="onFilterChange()"
              />
            </label>
            <label class="grid gap-2 text-sm font-medium">
              End Date
              <input
                type="date"
                class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                [(ngModel)]="endDate"
                (ngModelChange)="onFilterChange()"
              />
            </label>
          </div>
          <div class="mt-4 flex justify-end">
            <button uiBtn variant="outline" type="button" (click)="clearFilters()">
              <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              Clear Filters
            </button>
          </div>
        </ui-card-content>
      </ui-card>

      <ui-card class="gap-0 py-0">
        <ui-card-header class="pt-6">
          <ui-card-title>Activity Logs ({{ total() }} total)</ui-card-title>
        </ui-card-header>
        <ui-card-content class="pb-6">
          @if (loading()) {
            <div class="flex h-64 items-center justify-center">
              <ui-queue-spinner size="lg" [dotCount]="12" />
            </div>
          } @else if (logs().length === 0) {
            <div class="py-8 text-center text-muted-foreground">No logs found</div>
          } @else {
            <div class="overflow-auto rounded-md border">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b bg-muted/40">
                    <th class="h-11 px-4 font-medium text-muted-foreground">Date & Time</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">User</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Action</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  @for (log of logs(); track log.id) {
                    <tr class="border-t hover:bg-muted/40">
                      <td class="px-4 py-3 font-mono text-sm">
                        {{ formatDate(log.createdAt) }}
                      </td>
                      <td class="px-4 py-3">{{ getUserName(log) }}</td>
                      <td class="px-4 py-3">
                        <span
                          class="inline-flex items-center rounded-full bg-primary-100 px-2 py-1 text-xs font-medium text-primary-800"
                        >
                          {{ log.action }}
                        </span>
                      </td>
                      <td class="max-w-md truncate px-4 py-3">{{ log.details }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (totalPages() > 1) {
              <div class="mt-4 flex items-center justify-between text-sm">
                <div class="text-muted-foreground">
                  Page {{ page() }} of {{ totalPages() }}
                </div>
                <div class="flex gap-2">
                  <button
                    uiBtn
                    variant="outline"
                    size="sm"
                    type="button"
                    [disabled]="page() === 1"
                    (click)="goPage(page() - 1)"
                  >
                    Previous
                  </button>
                  <button
                    uiBtn
                    variant="outline"
                    size="sm"
                    type="button"
                    [disabled]="page() === totalPages()"
                    (click)="goPage(page() + 1)"
                  >
                    Next
                  </button>
                </div>
              </div>
            }
          }
        </ui-card-content>
      </ui-card>
    </div>
  `,
})
export class LogsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Filter, X };
  readonly logs = signal<Log[]>([]);
  readonly users = signal<LogUser[]>([]);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly total = signal(0);

  selectedUserId = '';
  actionFilter = '';
  startDate = '';
  endDate = '';

  async ngOnInit() {
    await Promise.all([this.fetchUsers(), this.fetchLogs()]);
  }

  formatDate(dateString: string) {
    return formatInEat(dateString);
  }

  getUserName(log: Log) {
    if (log.user) {
      return `${log.user.firstName ?? ''} ${log.user.lastName ?? ''} (${log.user.email})`.trim();
    }
    return 'System';
  }

  onFilterChange() {
    this.page.set(1);
    void this.fetchLogs();
  }

  clearFilters() {
    this.selectedUserId = '';
    this.actionFilter = '';
    this.startDate = '';
    this.endDate = '';
    this.page.set(1);
    void this.fetchLogs();
  }

  goPage(next: number) {
    const clamped = Math.max(1, Math.min(this.totalPages(), next));
    if (clamped === this.page()) return;
    this.page.set(clamped);
    void this.fetchLogs();
  }

  private async fetchUsers() {
    try {
      const data = await this.api.get<LogUser[]>('/api/bank/users');
      this.users.set(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }

  private async fetchLogs() {
    this.loading.set(true);
    try {
      const data = await this.api.get<{ logs: Log[]; pagination: Pagination }>('/api/bank/logs', {
        page: this.page(),
        limit: 50,
        userId: this.selectedUserId || undefined,
        action: this.actionFilter || undefined,
        startDate: this.startDate || undefined,
        endDate: this.endDate || undefined,
      });
      this.logs.set(data.logs ?? []);
      this.totalPages.set(data.pagination?.totalPages ?? 1);
      this.total.set(data.pagination?.total ?? 0);
      if (data.pagination?.page) this.page.set(data.pagination.page);
    } catch {
      this.toast.error('Failed to fetch logs');
    } finally {
      this.loading.set(false);
    }
  }
}
