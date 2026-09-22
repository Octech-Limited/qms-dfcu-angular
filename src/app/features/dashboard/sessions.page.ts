import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Clock, LucideAngularModule, RefreshCw, Search, Trash2 } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { formatInEat, relativeTimeFromEat } from '../../core/timezone';
import { ToastService } from '../../core/toast.service';
import { UiButton, UiCard, UiCardContent, UiCardHeader, UiCardTitle, UiQueueSpinner } from '../../shared/ui/ui';

type Session = {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  branch: { id: string; name: string } | null;
  lastSessionAt: string | null;
  isActive: boolean;
};

@Component({
  selector: 'app-sessions',
  imports: [
    FormsModule,
    LucideAngularModule,
    UiButton,
    UiCard,
    UiCardHeader,
    UiCardTitle,
    UiCardContent,
    UiQueueSpinner,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-3xl font-bold tracking-tight">Active Sessions</h2>
          <p class="text-muted-foreground">Monitor and manage active user sessions</p>
        </div>
        <button uiBtn variant="outline" size="sm" (click)="reload()">
          <lucide-angular [img]="icons.RefreshCw" class="size-4"></lucide-angular>
          Refresh
        </button>
      </div>

      <ui-card>
        <ui-card-header>
          <ui-card-title>Sessions</ui-card-title>
        </ui-card-header>
        <ui-card-content>
          <div class="relative mb-4">
            <lucide-angular
              [img]="icons.Search"
              class="absolute left-2 top-2.5 size-4 text-muted-foreground"
            ></lucide-angular>
            <input
              class="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Search by username, email, name, role, or branch..."
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
            />
          </div>

          @if (loading()) {
            <div class="flex items-center justify-center py-8">
              <ui-queue-spinner />
            </div>
          } @else if (filtered().length === 0) {
            <div class="py-8 text-center text-muted-foreground">
              {{
                sessions().length === 0
                  ? 'No active sessions found'
                  : 'No sessions match your search'
              }}
            </div>
          } @else {
            <div class="overflow-auto rounded-md border">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b">
                    <th class="h-11 px-4 font-medium text-muted-foreground">User</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Email</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Role</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Branch</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Last Activity</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Status</th>
                    <th class="h-11 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (session of filtered(); track session.userId) {
                    <tr class="border-t hover:bg-muted/40">
                      <td class="px-4 py-3 font-medium">{{ session.username }}</td>
                      <td class="px-4 py-3">{{ session.email }}</td>
                      <td class="px-4 py-3">
                        <span
                          class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                          >{{ session.role }}</span
                        >
                      </td>
                      <td class="px-4 py-3">{{ session.branch?.name || 'N/A' }}</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <lucide-angular
                            [img]="icons.Clock"
                            class="size-4 text-muted-foreground"
                          ></lucide-angular>
                          <div>
                            <div class="text-sm">{{ formatLastActivity(session.lastSessionAt) }}</div>
                            <div class="text-xs text-muted-foreground">
                              {{ relativeLastActivity(session.lastSessionAt) }}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3">
                        @if (session.isActive) {
                          <span
                            class="inline-flex items-center rounded-md bg-green-600 px-2 py-0.5 text-xs font-medium text-white"
                            >Active</span
                          >
                        } @else {
                          <span
                            class="inline-flex items-center rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground"
                            >Inactive</span
                          >
                        }
                      </td>
                      <td class="px-4 py-3 text-right">
                        <button
                          uiBtn
                          variant="destructive"
                          size="sm"
                          (click)="confirmTerminate.set(session)"
                        >
                          <lucide-angular [img]="icons.Trash2" class="size-4"></lucide-angular>
                          Terminate
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </ui-card-content>
      </ui-card>

      @if (confirmTerminate(); as session) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="confirmTerminate.set(null)"
        >
          <div
            class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <h3 class="text-lg font-semibold">Terminate Session?</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              Are you sure you want to terminate this user's session? They will be logged out
              immediately and will need to log in again.
            </p>
            <p class="mt-2 text-sm">
              <strong>User:</strong> {{ session.fullName }} ({{ session.username }})
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn variant="outline" (click)="confirmTerminate.set(null)">Cancel</button>
              <button uiBtn variant="destructive" (click)="terminate(session)">
                Terminate Session
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class SessionsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Search, RefreshCw, Clock, Trash2 };
  readonly sessions = signal<Session[]>([]);
  readonly loading = signal(true);
  readonly confirmTerminate = signal<Session | null>(null);

  readonly searchQuery = signal('');

  readonly filtered = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const rows = this.sessions();
    if (!q) return rows;
    return rows.filter(
      (session) =>
        session.username.toLowerCase().includes(q) ||
        session.email.toLowerCase().includes(q) ||
        session.fullName.toLowerCase().includes(q) ||
        session.role.toLowerCase().includes(q) ||
        (session.branch?.name.toLowerCase().includes(q) ?? false),
    );
  });

  async ngOnInit() {
    await this.reload();
  }

  formatLastActivity(value: string | null): string {
    if (!value) return 'N/A';
    const formatted = formatInEat(value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return formatted || 'Invalid Date';
  }

  relativeLastActivity(value: string | null): string {
    if (!value) return 'N/A';
    return relativeTimeFromEat(value) || 'N/A';
  }

  async reload() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Session[]>('/api/bank/sessions');
      this.sessions.set(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error || 'Failed to load sessions';
      this.toast.error(message);
    } finally {
      this.loading.set(false);
    }
  }

  async terminate(session: Session) {
    try {
      const result = await this.api.delete<{ message?: string }>(
        `/api/bank/sessions/${session.userId}`,
      );
      this.toast.success(result?.message || 'Session terminated successfully');
      this.confirmTerminate.set(null);
      this.sessions.update((rows) => rows.filter((s) => s.userId !== session.userId));
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error || 'Failed to terminate session';
      this.toast.error(message);
    }
  }
}
