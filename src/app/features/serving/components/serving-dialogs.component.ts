import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Loader2, LucideAngularModule } from 'lucide-angular';
import { HOLD_REASONS } from '../hold-reasons';
import { UiButton } from '../../../shared/ui/ui';
import type { QueueItem, ServingActionPending, Ticket, TransactionSelection } from '../types';
import { CounterAvailabilityHintComponent } from './counter-availability-hint.component';

@Component({
  selector: 'app-hold-ticket-dialog',
  imports: [FormsModule, LucideAngularModule, UiButton],
  template: `
    @if (open) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
        <div
          class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-lg font-semibold">Hold Ticket</h3>
          <p class="mt-1 text-sm text-muted-foreground">Select or enter a reason</p>
          <div class="mt-4 flex flex-wrap gap-2">
            @for (reason of reasons; track reason) {
              <button
                type="button"
                class="rounded-full border px-3 py-1 text-xs"
                [class.border-primary]="holdReason === reason"
                [class.bg-primary/10]="holdReason === reason"
                (click)="holdReasonChange.emit(reason)"
              >
                {{ reason }}
              </button>
            }
          </div>
          <textarea
            class="mt-4 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            [ngModel]="holdReason"
            (ngModelChange)="holdReasonChange.emit($event)"
            placeholder="Hold reason"
          ></textarea>
          <div class="mt-4 flex justify-end gap-2">
            <button uiBtn variant="outline" type="button" (click)="close.emit()">Cancel</button>
            <button
              uiBtn
              type="button"
              [disabled]="!!actionPending || !holdReason.trim()"
              (click)="confirm.emit()"
            >
              @if (actionPending === 'holding') {
                <lucide-angular [img]="icons.Loader2" class="size-4 animate-spin"></lucide-angular>
              }
              Hold
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class HoldTicketDialogComponent {
  @Input() open = false;
  @Input() holdReason = '';
  @Input() actionPending: ServingActionPending = null;
  @Output() holdReasonChange = new EventEmitter<string>();
  @Output() confirm = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  readonly reasons = HOLD_REASONS;
  readonly icons = { Loader2 };
}

@Component({
  selector: 'app-actions-dialog',
  imports: [LucideAngularModule, UiButton],
  template: `
    @if (open) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
        <div
          class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-lg font-semibold">Next Action</h3>
          <div class="mt-4 grid gap-2">
            <button uiBtn [disabled]="!!actionPending" (click)="getNext.emit()">Get Next Ticket</button>
            <button uiBtn variant="outline" [disabled]="!!actionPending" (click)="editCounter.emit()">
              Edit Counter
            </button>
            <button
              uiBtn
              variant="secondary"
              [disabled]="!!actionPending"
              (click)="goUnavailable.emit()"
            >
              Go Unavailable
            </button>
          </div>

          @if (redirectedTickets.length) {
            <h4 class="mt-6 text-sm font-semibold">Redirected to me</h4>
            <div class="mt-2 space-y-2">
              @for (t of redirectedTickets; track t.id) {
                <div class="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{{ t.ticketNo }}</span>
                  <button uiBtn size="sm" [disabled]="!!actionPending" (click)="claimRedirect.emit(t)">
                    Claim
                  </button>
                </div>
              }
            </div>
          }

          @if (heldTickets.length) {
            <h4 class="mt-6 text-sm font-semibold">Held</h4>
            <div class="mt-2 space-y-2">
              @for (t of heldTickets; track t.id) {
                <div class="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{{ t.ticketNo }}</span>
                  <button uiBtn size="sm" [disabled]="!!actionPending" (click)="unhold.emit(t)">
                    Resume
                  </button>
                </div>
              }
            </div>
          }

          <div class="mt-6 flex justify-end">
            <button uiBtn variant="ghost" (click)="close.emit()">Close</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ActionsDialogComponent {
  @Input() open = false;
  @Input() actionPending: ServingActionPending = null;
  @Input() heldTickets: Ticket[] = [];
  @Input() redirectedTickets: Ticket[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() getNext = new EventEmitter<void>();
  @Output() editCounter = new EventEmitter<void>();
  @Output() goUnavailable = new EventEmitter<void>();
  @Output() unhold = new EventEmitter<Ticket>();
  @Output() claimRedirect = new EventEmitter<Ticket>();
}

@Component({
  selector: 'app-change-category-dialog',
  imports: [FormsModule, LucideAngularModule, UiButton, CounterAvailabilityHintComponent],
  template: `
    @if (open) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="close.emit()">
        <div
          class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-lg font-semibold">Change Category</h3>
          <div class="mt-4 space-y-3">
            <label class="grid gap-1 text-sm font-medium">
              Counter number
              <input
                class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                [ngModel]="counterNumber"
                (ngModelChange)="counterNumberChange.emit($event)"
                [disabled]="!!actionPending || loading"
              />
              <app-counter-availability-hint
                [counterNumber]="counterNumber"
                [branchId]="branchId"
                [excludeCounterId]="excludeCounterId"
                [enabled]="open && !loading"
                (statusChange)="numberAvailableChange.emit($event)"
              />
            </label>
            <label class="grid gap-1 text-sm font-medium">
              Queue
              <select
                class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                [ngModel]="queueId"
                (ngModelChange)="queueIdChange.emit($event)"
                [disabled]="!!actionPending || loading"
              >
                @for (q of queueItems; track q.id) {
                  <option [value]="q.id">{{ q.menuItem.name }}</option>
                }
              </select>
            </label>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button uiBtn variant="outline" (click)="close.emit()">Cancel</button>
            <button
              uiBtn
              [disabled]="!!actionPending || loading || numberAvailable === false"
              (click)="save.emit()"
            >
              @if (actionPending === 'changingCategory' || loading) {
                <lucide-angular [img]="icons.Loader2" class="size-4 animate-spin"></lucide-angular>
              }
              Save
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ChangeCategoryDialogComponent {
  @Input() open = false;
  @Input() queueItems: QueueItem[] = [];
  @Input() queueId = '';
  @Input() counterNumber = '';
  @Input() branchId = '';
  @Input() excludeCounterId: string | null = null;
  @Input() numberAvailable: boolean | null = null;
  @Input() actionPending: ServingActionPending = null;
  @Input() loading = false;
  @Output() queueIdChange = new EventEmitter<string>();
  @Output() counterNumberChange = new EventEmitter<string>();
  @Output() numberAvailableChange = new EventEmitter<boolean | null>();
  @Output() save = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  readonly icons = { Loader2 };
}

@Component({
  selector: 'app-multiple-transactions-dialog',
  imports: [FormsModule, LucideAngularModule, UiButton],
  template: `
    @if (open) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        (click)="close.emit()"
      >
        <div
          class="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border bg-card p-6 shadow-xl"
          (click)="$event.stopPropagation()"
        >
          <h3 class="text-lg font-semibold">Select Multiple Transactions</h3>
          <p class="mt-1 text-sm text-muted-foreground">
            Choose categories and set how many times each was done
          </p>
          <div class="mt-4 max-h-96 space-y-3 overflow-y-auto">
            @for (queue of queueItems; track queue.id) {
              <div class="rounded-lg border p-4">
                @if (!hasSubItems(queue)) {
                  <div class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      class="size-4"
                      [checked]="isSelected(queue.id)"
                      [disabled]="isSaving"
                      (change)="toggle(queue.id, undefined, undefined, $event)"
                    />
                    <span class="flex-1 font-medium">{{ queue.menuItem.name }}</span>
                    @if (isSelected(queue.id)) {
                      <label class="flex items-center gap-2 text-sm">
                        Count:
                        <input
                          type="number"
                          min="1"
                          class="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
                          [ngModel]="getCount(queue.id)"
                          [disabled]="isSaving"
                          (ngModelChange)="setCount(queue.id, undefined, undefined, $event)"
                          (click)="$event.stopPropagation()"
                        />
                      </label>
                    }
                  </div>
                } @else {
                  <p class="mb-2 font-medium">{{ queue.menuItem.name }}</p>
                  <div class="ml-4 space-y-2">
                    @for (sub of queue.menuItem.subMenuItems; track sub.id || $index) {
                      @if (!hasSubSubItems(sub)) {
                        <div class="flex items-center gap-2">
                          <input
                            type="checkbox"
                            class="size-4"
                            [checked]="isSelected(queue.id, sub.id)"
                            [disabled]="isSaving"
                            (change)="toggle(queue.id, sub.id, undefined, $event)"
                          />
                          <span class="flex-1 text-sm font-medium">{{ sub.name }}</span>
                          @if (isSelected(queue.id, sub.id)) {
                            <label class="flex items-center gap-2 text-xs">
                              Count:
                              <input
                                type="number"
                                min="1"
                                class="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm"
                                [ngModel]="getCount(queue.id, sub.id)"
                                [disabled]="isSaving"
                                (ngModelChange)="setCount(queue.id, sub.id, undefined, $event)"
                                (click)="$event.stopPropagation()"
                              />
                            </label>
                          }
                        </div>
                      } @else {
                        <p class="text-sm font-medium text-muted-foreground">{{ sub.name }}</p>
                        <div class="ml-4 space-y-1">
                          @for (subSub of sub.subSubMenuItems!; track subSub.id || $index) {
                            <div class="flex items-center gap-2">
                              <input
                                type="checkbox"
                                class="size-4"
                                [checked]="isSelected(queue.id, sub.id, subSub.id)"
                                [disabled]="isSaving"
                                (change)="toggle(queue.id, sub.id, subSub.id, $event)"
                              />
                              <span class="flex-1 text-xs text-muted-foreground">{{
                                subSub.name
                              }}</span>
                              @if (isSelected(queue.id, sub.id, subSub.id)) {
                                <label class="flex items-center gap-2 text-xs">
                                  Count:
                                  <input
                                    type="number"
                                    min="1"
                                    class="h-7 w-20 rounded-md border border-input bg-background px-2 text-xs"
                                    [ngModel]="getCount(queue.id, sub.id, subSub.id)"
                                    [disabled]="isSaving"
                                    (ngModelChange)="
                                      setCount(queue.id, sub.id, subSub.id, $event)
                                    "
                                    (click)="$event.stopPropagation()"
                                  />
                                </label>
                              }
                            </div>
                          }
                        </div>
                      }
                    }
                  </div>
                }
              </div>
            }
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button uiBtn variant="outline" [disabled]="isSaving" (click)="close.emit()">
              Cancel
            </button>
            <button
              uiBtn
              [disabled]="isSaving || selected.length === 0"
              (click)="save.emit()"
            >
              @if (isSaving) {
                <lucide-angular [img]="icons.Loader2" class="size-4 animate-spin"></lucide-angular>
                Saving…
              } @else {
                Save Transactions ({{ selected.length }})
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MultipleTransactionsDialogComponent {
  @Input() open = false;
  @Input() queueItems: QueueItem[] = [];
  @Input() selected: TransactionSelection[] = [];
  @Input() actionPending: ServingActionPending = null;
  @Output() selectedChange = new EventEmitter<TransactionSelection[]>();
  @Output() save = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  readonly icons = { Loader2 };

  get isSaving() {
    return this.actionPending === 'savingTransactions';
  }

  hasSubItems(queue: QueueItem) {
    return (queue.menuItem.subMenuItems?.length ?? 0) > 0;
  }

  hasSubSubItems(sub: QueueItem['menuItem']['subMenuItems'][number]) {
    return (sub.subSubMenuItems?.length ?? 0) > 0;
  }

  private matches(
    t: TransactionSelection,
    queueId: string,
    subItemId?: string,
    subSubItemId?: string,
  ) {
    if (t.queueId !== queueId) return false;
    if (subSubItemId) {
      return t.subItemId === subItemId && t.subSubItemId === subSubItemId;
    }
    if (subItemId) {
      return t.subItemId === subItemId && (!t.subSubItemId || t.subSubItemId === '');
    }
    return !t.subItemId && !t.subSubItemId;
  }

  isSelected(queueId: string, subItemId?: string, subSubItemId?: string) {
    return this.selected.some((t) => this.matches(t, queueId, subItemId, subSubItemId));
  }

  getCount(queueId: string, subItemId?: string, subSubItemId?: string) {
    const found = this.selected.find((t) => this.matches(t, queueId, subItemId, subSubItemId));
    return found?.count || 1;
  }

  toggle(queueId: string, subItemId: string | undefined, subSubItemId: string | undefined, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    let next = [...this.selected];
    if (checked) {
      const entry: TransactionSelection = { queueId, count: 1 };
      if (subItemId) entry.subItemId = subItemId;
      if (subSubItemId) entry.subSubItemId = subSubItemId;
      next.push(entry);
    } else {
      next = next.filter((t) => !this.matches(t, queueId, subItemId, subSubItemId));
    }
    this.selectedChange.emit(next);
  }

  setCount(
    queueId: string,
    subItemId: string | undefined,
    subSubItemId: string | undefined,
    value: number | string,
  ) {
    const n = typeof value === 'string' ? parseInt(value, 10) : value;
    if (Number.isNaN(n)) return;
    const count = Math.max(1, n);
    this.selectedChange.emit(
      this.selected.map((t) =>
        this.matches(t, queueId, subItemId, subSubItemId) ? { ...t, count } : t,
      ),
    );
  }
}

