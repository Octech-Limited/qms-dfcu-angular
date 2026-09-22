import { Component, Input } from '@angular/core';
import { UiCard, UiCardContent, UiCardHeader, UiCardTitle } from '../../../shared/ui/ui';
import type { Ticket } from '../types';

@Component({
  selector: 'app-stats-cards',
  imports: [UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <div class="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <ui-card>
        <ui-card-header><ui-card-title>Current Token</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold text-primary">
            {{ currentTicket ? currentTicket.ticketNo : 'N/A' }}
          </div>
          <p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {{ currentTicket ? currentTicket.issueDescription : 'No active ticket' }}
          </p>
        </ui-card-content>
      </ui-card>

      <ui-card>
        <ui-card-header><ui-card-title>Queue Status</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold">{{ queueStatus }}</div>
          <p class="text-sm text-muted-foreground">People waiting</p>
        </ui-card-content>
      </ui-card>

      <ui-card>
        <ui-card-header><ui-card-title>Tickets Served</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold">
            {{ ticketsServed }}
            <span class="text-sm text-muted-foreground">of {{ totalDailyTickets }}</span>
          </div>
          <p class="text-sm text-muted-foreground">My total / Daily total</p>
        </ui-card-content>
      </ui-card>

      <ui-card>
        <ui-card-header><ui-card-title>Average Serving Time</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold">{{ averageServingTime }}</div>
          <p class="text-sm text-muted-foreground">Minutes per customer</p>
        </ui-card-content>
      </ui-card>

      <ui-card
        [class]="
          'border-2 ' +
          (slaTimeRemaining === null
            ? ''
            : slaExceeded
              ? 'border-red-500 bg-red-50'
              : slaInGracePeriod
                ? 'border-primary bg-primary/5'
                : 'border-green-500 bg-green-50')
        "
      >
        <ui-card-header>
          <ui-card-title>
            {{
              slaTimeRemaining === null
                ? 'SLA Timer'
                : slaExceeded
                  ? 'SLA Exceeded'
                  : slaInGracePeriod
                    ? 'Grace Period'
                    : 'SLA Timer'
            }}
          </ui-card-title>
        </ui-card-header>
        <ui-card-content>
          @if (slaTimeRemaining !== null) {
            <div
              class="text-2xl font-bold"
              [class.text-red-600]="slaExceeded"
              [class.text-primary]="slaInGracePeriod && !slaExceeded"
              [class.text-green-600]="!slaExceeded && !slaInGracePeriod"
            >
              {{ displaySlaTime }}
            </div>
            <p class="text-sm text-muted-foreground">
              {{
                slaExceeded
                  ? 'Over SLA limit'
                  : slaInGracePeriod
                    ? 'Before SLA starts'
                    : 'Time remaining'
              }}
            </p>
          } @else {
            <div class="text-2xl font-bold text-muted-foreground">—</div>
            <p class="text-sm text-muted-foreground">No active ticket</p>
          }
        </ui-card-content>
      </ui-card>
    </div>
  `,
})
export class StatsCardsComponent {
  @Input() currentTicket: Ticket | null = null;
  @Input() queueStatus = 0;
  @Input() ticketsServed = 0;
  @Input() totalDailyTickets = 0;
  @Input() averageServingTime = '0:00';
  @Input() slaTimeRemaining: number | null = null;
  @Input() slaExceeded = false;
  @Input() slaInGracePeriod = false;

  get displaySlaTime() {
    if (this.slaTimeRemaining === null) return '';
    const minutes = Math.floor(this.slaTimeRemaining / 60);
    const seconds = this.slaTimeRemaining % 60;
    const clock = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return this.slaExceeded ? `+${clock}` : clock;
  }
}
