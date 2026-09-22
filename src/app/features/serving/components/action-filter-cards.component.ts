import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { CounterWorkAction, ServingReportsActionCounts } from '../types';

const ACTION_CARDS: Array<{ action: CounterWorkAction; label: string }> = [
  { action: 'served', label: 'Served' },
  { action: 'held', label: 'Held' },
  { action: 'redirected', label: 'Redirected' },
  { action: 'no_show', label: 'No show' },
];

@Component({
  selector: 'app-action-filter-cards',
  template: `
    <div class="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      @for (card of cards; track card.action) {
        <button
          type="button"
          class="rounded-xl border px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          [class.border-primary]="selected === card.action"
          [class.bg-primary/10]="selected === card.action"
          [class.ring-2]="selected === card.action"
          [class.ring-primary]="selected === card.action"
          [class.glass]="selected !== card.action"
          [class.bg-card]="selected !== card.action"
          [attr.aria-pressed]="selected === card.action"
          (click)="toggle(card.action)"
        >
          <div class="text-2xl font-bold">{{ counts[card.action] }}</div>
          <p class="text-sm text-muted-foreground">{{ card.label }}</p>
        </button>
      }
    </div>
  `,
})
export class ActionFilterCardsComponent {
  @Input() counts: ServingReportsActionCounts = {
    served: 0,
    held: 0,
    redirected: 0,
    no_show: 0,
  };
  @Input() selected: CounterWorkAction | null = null;
  @Output() selectedChange = new EventEmitter<CounterWorkAction | null>();

  readonly cards = ACTION_CARDS;

  toggle(action: CounterWorkAction) {
    this.selectedChange.emit(this.selected === action ? null : action);
  }
}
