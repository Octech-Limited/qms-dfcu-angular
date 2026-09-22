import { Component, Input } from '@angular/core';
import { UiCard, UiCardContent, UiCardHeader, UiCardTitle } from '../../../shared/ui/ui';
import type { QueueItem, Ticket } from '../types';

@Component({
  selector: 'app-ticket-stats-card',
  imports: [UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <ui-card class="h-full">
      <ui-card-header class="pb-2"><ui-card-title>Waiting by Queue</ui-card-title></ui-card-header>
      <ui-card-content class="space-y-2">
        @for (queue of queueItems; track queue.id) {
          <div class="flex items-center justify-between text-sm">
            <span>{{ queue.menuItem.name }}</span>
            <span class="font-bold">{{ getCount(queue.id) }}</span>
          </div>
        } @empty {
          <p class="text-sm text-muted-foreground">No queues</p>
        }
      </ui-card-content>
    </ui-card>
  `,
})
export class TicketStatsCardComponent {
  @Input() queueItems: QueueItem[] = [];
  @Input() getCount: (queueId: string) => number = () => 0;
}

@Component({
  selector: 'app-held-tickets-card',
  imports: [UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <ui-card class="h-full">
      <ui-card-header class="pb-2"><ui-card-title>Held Tickets</ui-card-title></ui-card-header>
      <ui-card-content class="max-h-64 space-y-2 overflow-y-auto">
        @for (ticket of heldTickets; track ticket.id) {
          <div class="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm">
            <p class="font-semibold">{{ ticket.ticketNo }}</p>
            <p class="text-muted-foreground">{{ ticket.issueDescription }}</p>
            @if (ticket.holdComment) {
              <p class="mt-1 text-xs italic">{{ ticket.holdComment }}</p>
            }
          </div>
        } @empty {
          <p class="text-sm text-muted-foreground">No held tickets</p>
        }
      </ui-card-content>
    </ui-card>
  `,
})
export class HeldTicketsCardComponent {
  @Input() heldTickets: Ticket[] = [];
}

@Component({
  selector: 'app-redirected-tickets-card',
  imports: [UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <ui-card class="h-full">
      <ui-card-header class="pb-2"
        ><ui-card-title>Redirected to Me</ui-card-title></ui-card-header
      >
      <ui-card-content class="max-h-64 space-y-2 overflow-y-auto">
        @for (ticket of redirectedTickets; track ticket.id) {
          <div class="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <p class="font-semibold">{{ ticket.ticketNo }}</p>
            <p class="text-muted-foreground">{{ ticket.issueDescription }}</p>
          </div>
        } @empty {
          <p class="text-sm text-muted-foreground">No redirected tickets</p>
        }
      </ui-card-content>
    </ui-card>
  `,
})
export class RedirectedTicketsCardComponent {
  @Input() redirectedTickets: Ticket[] = [];
}
