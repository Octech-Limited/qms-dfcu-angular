import { Component, Input } from '@angular/core';
import { formatInEat } from '../../../core/timezone';
import { formatDurationLabel } from '../duration';
import { UiCard, UiCardContent, UiCardHeader, UiCardTitle } from '../../../shared/ui/ui';
import type { TicketServiceHistoryItem } from '../types';

@Component({
  selector: 'app-ticket-history-card',
  imports: [UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <ui-card class="h-full">
      <ui-card-header class="pb-2"><ui-card-title>Ticket History</ui-card-title></ui-card-header>
      <ui-card-content class="max-h-64 overflow-y-auto">
        @if (!services.length) {
          <p class="text-sm text-muted-foreground">No movement history yet.</p>
        } @else {
          <ol class="space-y-3">
            @for (service of services; track service.id) {
              <li class="border-l-2 border-muted py-1 pl-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-md px-2 py-0.5 text-xs font-medium"
                    [class]="statusClass(service.ticketStatus)"
                    >{{ service.ticketStatus }}</span
                  >
                  <span class="text-xs text-muted-foreground">{{
                    formatClock(service.startedAt)
                  }}</span>
                  @if (service.endedAt) {
                    <span class="text-xs text-muted-foreground"
                      >→ {{ formatClock(service.endedAt) }}</span
                    >
                  }
                  <span class="text-xs text-muted-foreground">{{
                    formatDurationLabel(service.duration)
                  }}</span>
                </div>
                @if (service.counter) {
                  <p class="mt-1 text-xs text-muted-foreground">
                    Counter {{ service.counter.counterNumber }}
                    @if (agentName(service); as agent) {
                      · {{ agent }}
                    }
                  </p>
                }
                @if (service.holdComment) {
                  <p class="mt-1 text-xs italic text-muted-foreground">{{ service.holdComment }}</p>
                }
              </li>
            }
          </ol>
        }
      </ui-card-content>
    </ui-card>
  `,
})
export class TicketHistoryCardComponent {
  @Input() services: TicketServiceHistoryItem[] = [];
  formatDurationLabel = formatDurationLabel;

  formatClock(value: string) {
    return formatInEat(value, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  agentName(service: TicketServiceHistoryItem) {
    const user = service.user;
    if (!user) return null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name || user.username;
  }

  statusClass(status: string) {
    if (status === 'Serving') return 'bg-primary text-primary-foreground';
    if (status === 'Hold') return 'bg-yellow-100 text-yellow-800';
    if (status === 'Redirected') return 'bg-muted text-foreground';
    return 'bg-secondary text-secondary-foreground';
  }
}
