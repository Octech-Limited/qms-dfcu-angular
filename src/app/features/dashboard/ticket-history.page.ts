import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { eatCalendarDate, formatInEat } from '../../core/timezone';
import { ToastService } from '../../core/toast.service';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
  UiQueueSpinner,
} from '../../shared/ui/ui';

type Branch = { id: string; name: string };

type HistoryTicket = {
  id: string;
  ticketNo: string;
  ticketStatus: string;
  issueDescription: string;
  createdAt: string;
};

type TicketServiceHistoryItem = {
  id: string;
  sequence: number;
  ticketStatus: string;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  holdComment?: string | null;
  endReason?: string | null;
  counter?: { id: string; counterNumber: number } | null;
  user?: {
    id: string;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  redirectedFromCounter?: { id: string; counterNumber: number } | null;
  redirectedToCounter?: { id: string; counterNumber: number } | null;
};

@Component({
  selector: 'app-ticket-history',
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
      <ui-card class="gap-0 py-0">
        <ui-card-header class="pt-6">
          <ui-card-title>Search tickets</ui-card-title>
        </ui-card-header>
        <ui-card-content class="pb-6">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label class="grid gap-2 text-sm font-medium">
              Branch
              <select
                class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                [(ngModel)]="selectedBranch"
              >
                <option value="" disabled>Select branch</option>
                @for (branch of branches(); track branch.id) {
                  <option [value]="branch.id">{{ branch.name }}</option>
                }
              </select>
            </label>
            <label class="grid gap-2 text-sm font-medium">
              Date
              <input
                class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                type="date"
                [(ngModel)]="date"
              />
            </label>
            <label class="grid gap-2 text-sm font-medium">
              Ticket number
              <input
                class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="A01"
                [(ngModel)]="ticketNo"
                (keydown.enter)="searchTickets()"
              />
            </label>
            <div class="flex items-end">
              <button uiBtn extraClass="w-full" [disabled]="searching()" (click)="searchTickets()">
                @if (searching()) {
                  <ui-queue-spinner size="sm" />
                  Searching
                } @else {
                  <lucide-angular [img]="icons.Search" class="size-4"></lucide-angular>
                  Search
                }
              </button>
            </div>
          </div>
        </ui-card-content>
      </ui-card>

      <div class="grid gap-6 lg:grid-cols-2">
        <ui-card class="gap-0 py-0">
          <ui-card-header class="pt-6">
            <ui-card-title>Results</ui-card-title>
          </ui-card-header>
          <ui-card-content class="pb-6">
            <div class="overflow-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b">
                    <th class="h-11 px-4 font-medium text-muted-foreground">Ticket</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Status</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Service</th>
                    <th class="h-11 px-4 font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  @for (ticket of tickets(); track ticket.id) {
                    <tr
                      class="cursor-pointer border-t hover:bg-muted/40"
                      [class.bg-muted]="selectedTicketId() === ticket.id"
                      (click)="loadHistory(ticket.id)"
                    >
                      <td class="px-4 py-3 font-medium">{{ ticket.ticketNo }}</td>
                      <td class="px-4 py-3">
                        <span
                          class="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                          >{{ ticket.ticketStatus }}</span
                        >
                      </td>
                      <td class="px-4 py-3">{{ ticket.issueDescription }}</td>
                      <td class="px-4 py-3">{{ formatTicketTime(ticket.createdAt) }}</td>
                    </tr>
                  } @empty {
                    <tr class="border-t">
                      <td colspan="4" class="px-4 py-6 text-center text-muted-foreground">
                        Search by ticket number to see history.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </ui-card-content>
        </ui-card>

        <ui-card class="gap-0 py-0">
          <ui-card-header class="pt-6">
            <ui-card-title>Movement timeline</ui-card-title>
          </ui-card-header>
          <ui-card-content class="pb-6">
            @if (loadingHistory()) {
              <div class="flex justify-center py-8">
                <ui-queue-spinner />
              </div>
            } @else if (services().length === 0) {
              <p class="text-sm text-muted-foreground">No movement history yet.</p>
            } @else {
              <ol class="space-y-3">
                @for (service of services(); track service.id) {
                  <li class="border-l-2 border-muted py-1 pl-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <span
                        class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                        [class]="statusBadgeClass(service.ticketStatus)"
                        >{{ service.ticketStatus }}</span
                      >
                      @if (service.counter) {
                        <span class="text-sm">Counter #{{ service.counter.counterNumber }}</span>
                      }
                      @if (formatAgent(service); as agent) {
                        <span class="text-sm text-muted-foreground">{{ agent }}</span>
                      }
                      @if (!service.endedAt) {
                        <span
                          class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                          >Open</span
                        >
                      }
                    </div>
                    <p class="mt-1 text-xs text-muted-foreground">
                      {{ formatClock(service.startedAt) }}
                      {{
                        service.endedAt
                          ? ' – ' + formatClock(service.endedAt)
                          : ' – now'
                      }}
                      {{ service.endedAt ? ' · ' + formatDuration(service.duration) : '' }}
                    </p>
                    @if (service.holdComment) {
                      <p class="mt-1 text-xs">Hold: {{ service.holdComment }}</p>
                    }
                    @if (
                      service.ticketStatus === 'Redirected' && service.redirectedToCounter
                    ) {
                      <p class="mt-1 text-xs">
                        To counter #{{ service.redirectedToCounter.counterNumber
                        }}{{
                          service.redirectedFromCounter
                            ? ' from #' + service.redirectedFromCounter.counterNumber
                            : ''
                        }}
                      </p>
                    }
                  </li>
                }
              </ol>
            }
          </ui-card-content>
        </ui-card>
      </div>
    </div>
  `,
})
export class TicketHistoryPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Search };
  readonly branches = signal<Branch[]>([]);
  readonly tickets = signal<HistoryTicket[]>([]);
  readonly services = signal<TicketServiceHistoryItem[]>([]);
  readonly selectedTicketId = signal<string | null>(null);
  readonly searching = signal(false);
  readonly loadingHistory = signal(false);

  selectedBranch = '';
  ticketNo = '';
  date = eatCalendarDate();

  async ngOnInit() {
    try {
      const data = await this.api.get<Branch[]>('/api/bank/branches');
      const list = Array.isArray(data) ? data : [];
      this.branches.set(list);
      if (list.length > 0) this.selectedBranch = list[0].id;
    } catch {
      this.toast.error('Failed to load branches');
    }
  }

  formatTicketTime(value: string): string {
    return formatInEat(value, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  formatClock(value: string): string {
    return formatInEat(value, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }

  formatAgent(service: TicketServiceHistoryItem): string | null {
    const user = service.user;
    if (!user) return null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name || user.username;
  }

  statusBadgeClass(status: string): string {
    if (status === 'Serving') return 'bg-primary text-primary-foreground';
    if (status === 'Hold') return 'bg-secondary text-secondary-foreground';
    if (status === 'Redirected') return 'border bg-background';
    return 'bg-secondary text-secondary-foreground';
  }

  async searchTickets() {
    if (!this.ticketNo.trim()) {
      this.toast.error('Enter a ticket number');
      return;
    }

    this.searching.set(true);
    this.selectedTicketId.set(null);
    this.services.set([]);
    try {
      const data = await this.api.get<{ tickets?: HistoryTicket[]; error?: string }>(
        '/api/bank/ticket/history',
        {
          ticketNo: this.ticketNo.trim(),
          branchId: this.selectedBranch || undefined,
          date: this.date || undefined,
        },
      );
      const rows = data?.tickets || [];
      this.tickets.set(rows);
      if (rows.length === 1) {
        await this.loadHistory(rows[0].id);
      }
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string; message?: string } })?.error?.error ||
        (error as { error?: { error?: string; message?: string } })?.error?.message ||
        'Search failed';
      this.toast.error(message);
    } finally {
      this.searching.set(false);
    }
  }

  async loadHistory(ticketId: string) {
    this.selectedTicketId.set(ticketId);
    this.loadingHistory.set(true);
    try {
      const data = await this.api.get<{ services?: TicketServiceHistoryItem[] }>(
        `/api/bank/ticket/${ticketId}/history`,
      );
      this.services.set(data?.services || []);
    } catch {
      this.toast.error('Failed to load ticket history');
    } finally {
      this.loadingHistory.set(false);
    }
  }
}
