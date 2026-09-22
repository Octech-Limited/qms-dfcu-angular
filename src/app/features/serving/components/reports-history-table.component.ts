import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
} from '../../../shared/ui/ui';
import { formatInEat } from '../../../core/timezone';
import { actionLabel, formatDurationLabel } from '../duration';
import type { CounterWorkAction, CounterWorkHistoryItem } from '../types';

const ITEMS_PER_PAGE = 10;

@Component({
  selector: 'app-reports-history-table',
  imports: [FormsModule, UiButton, UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <ui-card>
      <ui-card-header class="gap-4 space-y-4">
        <ui-card-title>History</ui-card-title>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="grid gap-2 text-sm font-medium">
            Ticket number
            <input
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              placeholder="Search ticket number"
              [(ngModel)]="ticketNoQuery"
              (ngModelChange)="onSearchChange()"
            />
          </label>
          <label class="grid gap-2 text-sm font-medium">
            Phone number
            <input
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              placeholder="Search phone number"
              [(ngModel)]="phoneQuery"
              (ngModelChange)="onSearchChange()"
            />
          </label>
        </div>
      </ui-card-header>
      <ui-card-content class="space-y-4">
        <div class="overflow-x-auto rounded-md border">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b bg-muted/50 text-muted-foreground">
                <th class="px-3 py-2 font-medium">Ticket</th>
                <th class="px-3 py-2 font-medium">Phone</th>
                <th class="px-3 py-2 font-medium">Service</th>
                <th class="px-3 py-2 font-medium">Waiting time</th>
                <th class="px-3 py-2 font-medium">Service time</th>
                <th class="px-3 py-2 font-medium">Held time</th>
                <th class="px-3 py-2 font-medium">Action</th>
                <th class="px-3 py-2 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              @for (ticket of pageTickets; track ticket.ticketId + ticket.actionAt) {
                <tr class="border-b last:border-0 hover:bg-muted/30">
                  <td class="px-3 py-2 font-medium">{{ ticket.ticketNo }}</td>
                  <td class="px-3 py-2">{{ ticket.phoneNumber || '—' }}</td>
                  <td class="px-3 py-2">{{ ticket.issueDescription }}</td>
                  <td class="px-3 py-2">{{ formatDuration(ticket.waitingTime) }}</td>
                  <td class="px-3 py-2">{{ formatDuration(ticket.servingTime) }}</td>
                  <td class="px-3 py-2">{{ formatDuration(ticket.holdTime) }}</td>
                  <td class="px-3 py-2">
                    <span
                      class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                      [class]="badgeClass(ticket.action)"
                    >
                      {{ labelFor(ticket.action) }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2">{{ formatActionAt(ticket.actionAt) }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="px-3 py-8 text-center text-muted-foreground">
                    {{
                      tickets.length === 0
                        ? 'No tickets for this date.'
                        : 'No tickets match your filters.'
                    }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (filteredTickets.length > 0) {
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Showing {{ startIndex + 1 }}–{{ endIndex }} of {{ filteredTickets.length }}
            </span>
            <div class="flex items-center gap-2">
              <button
                uiBtn
                size="sm"
                variant="outline"
                [disabled]="currentPage <= 1"
                (click)="goToPage(currentPage - 1)"
              >
                Previous
              </button>
              <span>Page {{ currentPage }} / {{ totalPages }}</span>
              <button
                uiBtn
                size="sm"
                variant="outline"
                [disabled]="currentPage >= totalPages"
                (click)="goToPage(currentPage + 1)"
              >
                Next
              </button>
            </div>
          </div>
        }
      </ui-card-content>
    </ui-card>
  `,
})
export class ReportsHistoryTableComponent implements OnChanges {
  @Input() tickets: CounterWorkHistoryItem[] = [];
  @Input() actionFilter: CounterWorkAction | null = null;

  ticketNoQuery = '';
  phoneQuery = '';
  currentPage = 1;
  filteredTickets: CounterWorkHistoryItem[] = [];
  pageTickets: CounterWorkHistoryItem[] = [];
  totalPages = 1;
  startIndex = 0;
  endIndex = 0;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['tickets'] || changes['actionFilter']) {
      this.currentPage = 1;
      this.recompute();
    }
  }

  onSearchChange() {
    this.currentPage = 1;
    this.recompute();
  }

  goToPage(page: number) {
    this.currentPage = page;
    this.recompute();
  }

  formatDuration(seconds: number) {
    return formatDurationLabel(seconds);
  }

  labelFor(action: CounterWorkAction) {
    return actionLabel(action);
  }

  formatActionAt(value: string) {
    return formatInEat(value, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  badgeClass(action: CounterWorkAction) {
    if (action === 'served') return 'bg-primary text-primary-foreground';
    if (action === 'held') return 'bg-secondary text-secondary-foreground';
    if (action === 'no_show') return 'bg-destructive text-destructive-foreground';
    return 'border border-input bg-background text-foreground';
  }

  private recompute() {
    const ticketNo = this.ticketNoQuery.trim().toLowerCase();
    const phone = this.phoneQuery.trim().toLowerCase();

    this.filteredTickets = this.tickets.filter((ticket) => {
      if (this.actionFilter && ticket.action !== this.actionFilter) return false;
      if (ticketNo && !ticket.ticketNo.toLowerCase().includes(ticketNo)) return false;
      if (phone) {
        const phoneNumber = (ticket.phoneNumber || '').toLowerCase();
        if (!phoneNumber.includes(phone)) return false;
      }
      return true;
    });

    this.totalPages = Math.max(1, Math.ceil(this.filteredTickets.length / ITEMS_PER_PAGE));
    this.currentPage = Math.min(this.currentPage, this.totalPages);
    this.startIndex = (this.currentPage - 1) * ITEMS_PER_PAGE;
    this.endIndex = Math.min(this.startIndex + ITEMS_PER_PAGE, this.filteredTickets.length);
    this.pageTickets = this.filteredTickets.slice(this.startIndex, this.endIndex);
  }
}
