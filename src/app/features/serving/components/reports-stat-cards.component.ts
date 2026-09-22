import { Component, Input } from '@angular/core';
import { UiCard, UiCardContent, UiCardHeader, UiCardTitle } from '../../../shared/ui/ui';
import { formatDurationLabel } from '../duration';
import type { ServingReportsStats } from '../types';

@Component({
  selector: 'app-reports-stat-cards',
  imports: [UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <ui-card>
        <ui-card-header><ui-card-title>Total tickets</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold">{{ totalTickets }}</div>
          <p class="text-sm text-muted-foreground">Handled this day</p>
        </ui-card-content>
      </ui-card>
      <ui-card>
        <ui-card-header><ui-card-title>Counter</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold">{{ counterNumber != null ? counterNumber : '—' }}</div>
          <p class="text-sm text-muted-foreground">Counter for this day</p>
        </ui-card-content>
      </ui-card>
      <ui-card>
        <ui-card-header><ui-card-title>Avg waiting time</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold">{{ formatDuration(stats.averageWaitingTime) }}</div>
          <p class="text-sm text-muted-foreground">Per ticket</p>
        </ui-card-content>
      </ui-card>
      <ui-card>
        <ui-card-header><ui-card-title>Avg service time</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold">{{ formatDuration(stats.averageServingTime) }}</div>
          <p class="text-sm text-muted-foreground">Per ticket</p>
        </ui-card-content>
      </ui-card>
      <ui-card>
        <ui-card-header><ui-card-title>Avg hold time</ui-card-title></ui-card-header>
        <ui-card-content>
          <div class="text-2xl font-bold">{{ formatDuration(stats.averageHoldTime) }}</div>
          <p class="text-sm text-muted-foreground">Per ticket</p>
        </ui-card-content>
      </ui-card>
    </div>
  `,
})
export class ReportsStatCardsComponent {
  @Input() totalTickets = 0;
  @Input() counterNumber: number | null = null;
  @Input() stats: ServingReportsStats = {
    totalTickets: 0,
    averageWaitingTime: 0,
    averageServingTime: 0,
    averageHoldTime: 0,
  };

  formatDuration(seconds: number) {
    return formatDurationLabel(seconds);
  }
}
