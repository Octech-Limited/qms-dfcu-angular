import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Edit, LucideAngularModule, Search, X } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { formatInEat } from '../../core/timezone';
import { UiButton, UiCard, UiCardContent, UiCardHeader, UiCardTitle, UiQueueSpinner } from '../../shared/ui/ui';

type CounterUser = {
  id: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
};

type CounterRow = {
  id: string;
  counterNumber: number;
  available: boolean;
  createdAt: string;
  ticketCount: number;
  user?: CounterUser | null;
  queue?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
};

function formatTeller(user?: CounterUser | null): string {
  if (!user) return '—';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.username;
}

/** EAT-as-UTC storage → YYYY-MM-DD for date input filtering. */
function toDateFilterValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-counters',
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
      <h1 class="text-3xl font-bold tracking-tight">Counters</h1>

      <ui-card class="gap-0 py-0">
        <ui-card-content class="py-6">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-6">
            <div class="relative">
              <lucide-angular
                [img]="icons.Search"
                class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              ></lucide-angular>
              <input
                class="h-9 w-full rounded-md border border-input bg-background pl-10 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="Search counter or teller..."
                [(ngModel)]="searchQuery"
                (ngModelChange)="currentPage.set(1)"
              />
              @if (searchQuery) {
                <button
                  type="button"
                  class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted"
                  (click)="searchQuery = ''; currentPage.set(1)"
                >
                  <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
                </button>
              }
            </div>
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              [(ngModel)]="statusFilter"
              (ngModelChange)="currentPage.set(1)"
            >
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              [(ngModel)]="branchFilter"
              (ngModelChange)="currentPage.set(1)"
            >
              <option value="all">All branches</option>
              @for (branch of branchOptions(); track branch.id) {
                <option [value]="branch.id">{{ branch.name }}</option>
              }
            </select>
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              [(ngModel)]="queueFilter"
              (ngModelChange)="currentPage.set(1)"
            >
              <option value="all">All queues</option>
              @for (queue of queueOptions(); track queue.id) {
                <option [value]="queue.id">{{ queue.name }}</option>
              }
            </select>
            <input
              type="date"
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              [(ngModel)]="dateFilter"
              (ngModelChange)="currentPage.set(1)"
            />
            <div class="flex items-center text-sm text-muted-foreground">
              Showing {{ filtered().length }} of {{ counters().length }} counters
            </div>
          </div>
        </ui-card-content>
      </ui-card>

      <ui-card class="gap-0 py-0">
        <ui-card-header class="border-b px-6 py-4">
          <ui-card-title>Created counters</ui-card-title>
        </ui-card-header>
        <ui-card-content class="p-0">
          @if (loading()) {
            <div class="flex justify-center py-10">
              <ui-queue-spinner></ui-queue-spinner>
            </div>
          } @else {
            <div class="overflow-auto">
              <table class="w-full text-left text-sm">
                <thead class="bg-muted/70">
                  <tr>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Counter</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Status</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Teller</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Queue</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Branch</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Tickets</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Created</th>
                    <th class="h-11 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (counter of paginated(); track counter.id) {
                    <tr class="border-t transition-colors hover:bg-muted/40">
                      <td class="whitespace-nowrap px-4 py-3 font-medium">
                        {{ counter.counterNumber }}
                      </td>
                      <td class="whitespace-nowrap px-4 py-3">
                        <span
                          class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                          [class.bg-primary]="counter.available"
                          [class.text-primary-foreground]="counter.available"
                          [class.bg-secondary]="!counter.available"
                          [class.text-secondary-foreground]="!counter.available"
                        >
                          {{ counter.available ? 'Available' : 'Unavailable' }}
                        </span>
                      </td>
                      <td class="whitespace-nowrap px-4 py-3">{{ tellerName(counter) }}</td>
                      <td class="whitespace-nowrap px-4 py-3">{{ counter.queue?.name || '—' }}</td>
                      <td class="whitespace-nowrap px-4 py-3">{{ counter.branch?.name || '—' }}</td>
                      <td class="whitespace-nowrap px-4 py-3">{{ counter.ticketCount }}</td>
                      <td class="whitespace-nowrap px-4 py-3">
                        {{ formatCreated(counter.createdAt) }}
                      </td>
                      <td class="whitespace-nowrap px-4 py-3 text-right">
                        <button uiBtn variant="outline" size="sm" (click)="openEdit(counter)">
                          <lucide-angular [img]="icons.Edit" class="size-4"></lucide-angular>
                          Edit
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="8" class="h-32 text-center text-muted-foreground">
                        No counters match the selected filters.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span class="text-muted-foreground"
                >Page {{ currentPage() }} of {{ totalPages() }}</span
              >
              <div class="flex gap-2">
                <button
                  uiBtn
                  variant="outline"
                  size="sm"
                  [disabled]="currentPage() <= 1"
                  (click)="currentPage.update((p) => p - 1)"
                >
                  Previous
                </button>
                <button
                  uiBtn
                  variant="outline"
                  size="sm"
                  [disabled]="currentPage() >= totalPages()"
                  (click)="currentPage.update((p) => p + 1)"
                >
                  Next
                </button>
              </div>
            </div>
          }
        </ui-card-content>
      </ui-card>

      @if (editing()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeEdit()"
        >
          <div
            class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <h3 class="mb-4 text-lg font-semibold">Edit counter</h3>
            <div class="grid gap-4">
              <label class="grid gap-2 text-sm font-medium">
                Counter number
                <input
                  type="number"
                  min="1"
                  class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  [(ngModel)]="editCounterNumber"
                  [disabled]="saving()"
                />
              </label>
              <label class="grid gap-2 text-sm font-medium">
                Status
                <select
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  [(ngModel)]="editAvailable"
                  [disabled]="saving()"
                >
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </label>
            </div>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn type="button" variant="outline" [disabled]="saving()" (click)="closeEdit()">
                Cancel
              </button>
              <button uiBtn type="button" [disabled]="saving()" (click)="saveCounter()">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class CountersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Edit, Search, X };
  readonly itemsPerPage = 10;

  counters = signal<CounterRow[]>([]);
  loading = signal(true);
  saving = signal(false);
  editing = signal<CounterRow | null>(null);
  editCounterNumber = '';
  editAvailable: 'available' | 'unavailable' = 'unavailable';

  searchQuery = '';
  statusFilter = 'all';
  branchFilter = 'all';
  queueFilter = 'all';
  dateFilter = '';
  currentPage = signal(1);

  branchOptions(): { id: string; name: string }[] {
    const unique = new Map<string, string>();
    for (const counter of this.counters()) {
      if (counter.branch?.id) unique.set(counter.branch.id, counter.branch.name);
    }
    return Array.from(unique, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  queueOptions(): { id: string; name: string }[] {
    const unique = new Map<string, string>();
    for (const counter of this.counters()) {
      if (counter.queue?.id) unique.set(counter.queue.id, counter.queue.name);
    }
    return Array.from(unique, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  filtered(): CounterRow[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.counters().filter((counter) => {
      const teller = formatTeller(counter.user).toLowerCase();
      const matchesSearch =
        !query ||
        String(counter.counterNumber).includes(query) ||
        teller.includes(query) ||
        (counter.user?.username || '').toLowerCase().includes(query);
      const matchesStatus =
        this.statusFilter === 'all' ||
        (this.statusFilter === 'available' && counter.available) ||
        (this.statusFilter === 'unavailable' && !counter.available);
      const matchesBranch =
        this.branchFilter === 'all' || counter.branch?.id === this.branchFilter;
      const matchesQueue = this.queueFilter === 'all' || counter.queue?.id === this.queueFilter;
      const matchesDate =
        !this.dateFilter || toDateFilterValue(counter.createdAt) === this.dateFilter;
      return matchesSearch && matchesStatus && matchesBranch && matchesQueue && matchesDate;
    });
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.filtered().length / this.itemsPerPage));
  }

  paginated(): CounterRow[] {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.filtered().slice(start, start + this.itemsPerPage);
  }

  async ngOnInit() {
    await this.fetchCounters();
  }

  tellerName(counter: CounterRow) {
    return formatTeller(counter.user);
  }

  formatCreated(value: string) {
    return formatInEat(value, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async fetchCounters() {
    this.loading.set(true);
    try {
      const data = await this.api.get<{ counters?: CounterRow[]; error?: string }>(
        '/api/bank/counters',
      );
      this.counters.set(data.counters || []);
    } catch (error: unknown) {
      const err = error as { error?: { error?: string } };
      this.toast.error(err.error?.error || 'Failed to load counters');
      this.counters.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  openEdit(counter: CounterRow) {
    this.editing.set(counter);
    this.editCounterNumber = String(counter.counterNumber);
    this.editAvailable = counter.available ? 'available' : 'unavailable';
  }

  closeEdit() {
    if (this.saving()) return;
    this.editing.set(null);
  }

  async saveCounter() {
    const counter = this.editing();
    if (!counter) return;
    const parsedNumber = Number.parseInt(this.editCounterNumber, 10);
    if (!Number.isFinite(parsedNumber) || parsedNumber < 1) {
      this.toast.error('Enter a valid counter number');
      return;
    }
    this.saving.set(true);
    try {
      const data = await this.api.put<{ success?: boolean; message?: string; error?: string }>(
        `/api/bank/counter/${counter.id}`,
        {
          counterNumber: parsedNumber,
          available: this.editAvailable === 'available',
        },
      );
      this.toast.success(data.message || 'Counter updated successfully');
      this.editing.set(null);
      await this.fetchCounters();
    } catch (error: unknown) {
      const err = error as { error?: { error?: string } };
      this.toast.error(err.error?.error || 'Failed to update counter');
    } finally {
      this.saving.set(false);
    }
  }
}
