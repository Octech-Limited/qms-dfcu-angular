import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Loader2, LucideAngularModule, PhoneCall } from 'lucide-angular';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
  UiQueueSpinner,
} from '../../../shared/ui/ui';
import type {
  ActiveCounter,
  AvailableCounter,
  QueueItem,
  ServingActionPending,
  Ticket,
} from '../types';

@Component({
  selector: 'app-serving-actions-card',
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
    <ui-card>
      <ui-card-header class="pb-2"><ui-card-title>Actions</ui-card-title></ui-card-header>
      <ui-card-content>
        @if (currentTicket) {
          <div class="space-y-4">
            <div class="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2">
              <span class="px-2 font-medium text-muted-foreground">
                Current Ticket:
                <span class="text-foreground">{{ currentTicket.ticketNo }}</span>
              </span>
              <div class="ml-auto flex flex-wrap gap-2">
                <button uiBtn size="sm" [disabled]="!!actionPending" (click)="clearTicket.emit()">
                  @if (actionPending === 'clearing') {
                    <lucide-angular [img]="icons.Loader2" class="size-4 animate-spin"></lucide-angular>
                  }
                  End
                </button>
                <button
                  uiBtn
                  size="sm"
                  extraClass="bg-green-800 text-white hover:bg-green-900 hover:text-white"
                  [disabled]="!!actionPending"
                  (click)="callAgain.emit()"
                >
                  @if (actionPending === 'callingAgain') {
                    <lucide-angular [img]="icons.Loader2" class="size-4 animate-spin"></lucide-angular>
                  } @else {
                    <lucide-angular [img]="icons.PhoneCall" class="size-4"></lucide-angular>
                  }
                  Call Again
                </button>
                <button
                  uiBtn
                  size="sm"
                  extraClass="bg-amber-600 text-amber-50 hover:bg-amber-700 hover:text-amber-50"
                  [disabled]="!!actionPending"
                  (click)="openHold.emit()"
                >
                  Hold
                </button>
                <button
                  uiBtn
                  size="sm"
                  extraClass="relative bg-fuchsia-800 text-white hover:bg-fuchsia-900 hover:text-white"
                  [disabled]="!!actionPending"
                  (click)="openMultiTx.emit()"
                >
                  Multiple Transactions
                  @if (multiTxCount > 0) {
                    <span
                      class="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-fuchsia-950/50 px-1.5 text-xs font-semibold"
                    >
                      {{ multiTxCount }}
                    </span>
                  }
                </button>
                <button
                  uiBtn
                  size="sm"
                  variant="destructive"
                  [disabled]="!!actionPending"
                  (click)="markNoShow.emit()"
                >
                  No show
                </button>
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <label class="grid gap-1 text-sm font-medium">
                Confirm / Justify
                <select
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  [disabled]="!!actionPending"
                  (change)="onJustify($event)"
                >
                  <option value="">Select service confirmation</option>
                  @for (queue of queueItems; track queue.id) {
                    <optgroup [label]="queue.menuItem.name">
                      @for (sub of queue.menuItem.subMenuItems; track sub.id) {
                        <option [value]="queue.id + '|' + sub.id">{{ sub.name }}</option>
                      }
                    </optgroup>
                  }
                </select>
              </label>
              <label class="grid gap-1 text-sm font-medium">
                Redirect to counter
                <select
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  [disabled]="!!actionPending"
                  (change)="onRedirect($event)"
                >
                  <option value="">Select counter</option>
                  @for (c of availableCounters; track c.id) {
                    <option [value]="c.id">#{{ c.number }} — {{ c.queueName }}</option>
                  }
                </select>
              </label>
            </div>
          </div>
        } @else {
          <div class="flex flex-col items-center justify-center gap-4 py-8">
            @if (waitingForTicket || isFetchingNext) {
              <ui-queue-spinner size="md" />
              <p class="text-muted-foreground">Waiting for next ticket…</p>
            } @else {
              <p class="text-muted-foreground">No active ticket</p>
            }
            <div class="flex flex-wrap justify-center gap-2">
              <button uiBtn [disabled]="!!actionPending" (click)="openActions.emit()">
                Open Actions
              </button>
              <button
                uiBtn
                variant="outline"
                [disabled]="!!actionPending"
                (click)="editCounter.emit()"
              >
                Edit Counter
              </button>
              <button
                uiBtn
                variant="secondary"
                [disabled]="!!actionPending"
                (click)="toggleAvailability.emit()"
              >
                {{ activeCounter?.available ? 'Go Unavailable' : 'Go Available' }}
              </button>
            </div>
          </div>
        }
      </ui-card-content>
    </ui-card>
  `,
})
export class ServingActionsCardComponent {
  @Input() currentTicket: Ticket | null = null;
  @Input() activeCounter: ActiveCounter | null = null;
  @Input() queueItems: QueueItem[] = [];
  @Input() availableCounters: AvailableCounter[] = [];
  @Input() actionPending: ServingActionPending = null;
  @Input() waitingForTicket = false;
  @Input() isFetchingNext = false;

  @Output() clearTicket = new EventEmitter<void>();
  @Output() callAgain = new EventEmitter<void>();
  @Output() openHold = new EventEmitter<void>();
  @Output() openMultiTx = new EventEmitter<void>();
  @Output() markNoShow = new EventEmitter<void>();
  @Output() redirect = new EventEmitter<string>();
  @Output() updateJustify = new EventEmitter<{ queueId: string; subItemId: string }>();
  @Output() openActions = new EventEmitter<void>();
  @Output() toggleAvailability = new EventEmitter<void>();
  @Output() editCounter = new EventEmitter<void>();

  readonly icons = { Loader2, PhoneCall };

  get multiTxCount() {
    const raw = this.currentTicket?.multipleTransactions;
    if (Array.isArray(raw)) return raw.length;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  onJustify(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) return;
    const [queueId, subItemId] = value.split('|');
    this.updateJustify.emit({ queueId, subItemId });
    (event.target as HTMLSelectElement).value = '';
  }

  onRedirect(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) return;
    this.redirect.emit(value);
    (event.target as HTMLSelectElement).value = '';
  }
}
