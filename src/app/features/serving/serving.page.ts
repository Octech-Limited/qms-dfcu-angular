import { Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogOut, LucideAngularModule, Settings2 } from 'lucide-angular';
import { InactivityTimeoutService } from '../../core/inactivity-timeout.service';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
  UiQueueSpinner,
} from '../../shared/ui/ui';
import { ServingHeaderComponent } from './components/serving-header.component';
import { StatsCardsComponent } from './components/stats-cards.component';
import { ServingActionsCardComponent } from './components/serving-actions-card.component';
import { TicketHistoryCardComponent } from './components/ticket-history-card.component';
import {
  HeldTicketsCardComponent,
  RedirectedTicketsCardComponent,
  TicketStatsCardComponent,
} from './components/side-cards.component';
import {
  ActionsDialogComponent,
  ChangeCategoryDialogComponent,
  HoldTicketDialogComponent,
  MultipleTransactionsDialogComponent,
  UnavailableReasonDialogComponent,
} from './components/serving-dialogs.component';
import { CounterAvailabilityHintComponent } from './components/counter-availability-hint.component';
import { ServingDeskService } from './serving.service';

@Component({
  selector: 'app-serving',
  providers: [ServingDeskService],
  imports: [
    FormsModule,
    LucideAngularModule,
    UiButton,
    UiCard,
    UiCardHeader,
    UiCardTitle,
    UiCardContent,
    UiQueueSpinner,
    ServingHeaderComponent,
    StatsCardsComponent,
    ServingActionsCardComponent,
    TicketHistoryCardComponent,
    TicketStatsCardComponent,
    HeldTicketsCardComponent,
    RedirectedTicketsCardComponent,
    HoldTicketDialogComponent,
    UnavailableReasonDialogComponent,
    ActionsDialogComponent,
    ChangeCategoryDialogComponent,
    MultipleTransactionsDialogComponent,
    CounterAvailabilityHintComponent,
  ],
  template: `
    <div class="app-backdrop min-h-screen">
      <header
        class="flex h-16 items-center justify-between bg-primary px-4 text-primary-foreground shadow-sm md:px-6"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex size-9 items-center justify-center rounded-lg bg-white font-black text-primary"
          >
            Q
          </div>
          <h1 class="text-xl font-semibold">Serving</h1>
        </div>
        <button
          uiBtn
          variant="ghost"
          extraClass="text-white hover:bg-white/10 hover:text-white"
          (click)="logout()"
        >
          <lucide-angular [img]="icons.LogOut" class="size-4"></lucide-angular>
          Logout
        </button>
      </header>

      @if (desk.loading()) {
        <div class="flex h-[70vh] items-center justify-center">
          <ui-queue-spinner size="lg" />
        </div>
      } @else if (desk.bootstrapError()) {
        <div class="flex h-[70vh] items-center justify-center">
          <p class="text-red-500">{{ desk.bootstrapError() }}</p>
        </div>
      } @else {
        <div class="container mx-auto space-y-6 px-4 py-5 md:px-6">
          @if (!desk.activeCounter()) {
            <ui-card class="mx-auto max-w-md">
              <ui-card-header>
                <div
                  class="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <lucide-angular [img]="icons.Settings2" class="size-5"></lucide-angular>
                </div>
                <ui-card-title>Open counter for today</ui-card-title>
              </ui-card-header>
              <ui-card-content>
                <form class="space-y-4" (ngSubmit)="openCounter()">
                  <label class="grid gap-2 text-sm font-medium"
                    >Counter number
                    <input
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      type="number"
                      [(ngModel)]="openCounterNumber"
                      name="counterNumber"
                      required
                    />
                    <app-counter-availability-hint
                      [counterNumber]="openCounterNumberAsString"
                      [branchId]="branchId"
                      [enabled]="true"
                      (statusChange)="openNumberAvailable = $event"
                    />
                  </label>
                  <label class="grid gap-2 text-sm font-medium"
                    >Queue
                    <select
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      [(ngModel)]="openQueueId"
                      name="queueId"
                      required
                    >
                      <option value="" disabled>Select queue</option>
                      @for (q of desk.queueItems(); track q.id) {
                        <option [value]="q.id">{{ q.menuItem.name }}</option>
                      }
                    </select>
                  </label>
                  <button
                    uiBtn
                    type="submit"
                    class="w-full"
                    [disabled]="opening || openNumberAvailable === false"
                  >
                    Open Counter
                  </button>
                </form>
              </ui-card-content>
            </ui-card>
          } @else {
            <app-serving-header [activeCounter]="desk.activeCounter()" />

            <app-stats-cards
              [currentTicket]="desk.currentTicket()"
              [queueStatus]="desk.queueStatus()"
              [ticketsServed]="desk.ticketsServed()"
              [totalDailyTickets]="desk.totalDailyTickets()"
              [averageServingTime]="desk.averageServingTime()"
              [slaTimeRemaining]="desk.slaTimeRemaining()"
              [slaExceeded]="desk.slaExceeded()"
              [slaInGracePeriod]="desk.slaInGracePeriod()"
            />

            <div class="grid gap-4 md:grid-cols-3">
              <div class="min-w-0 md:col-span-2">
                <app-serving-actions-card
                  [currentTicket]="desk.currentTicket()"
                  [activeCounter]="desk.activeCounter()"
                  [queueItems]="desk.queueItems()"
                  [availableCounters]="desk.availableCounters()"
                  [actionPending]="desk.actionPending()"
                  [waitingForTicket]="desk.waitingForTicket()"
                  [isFetchingNext]="desk.isFetchingNext()"
                  (clearTicket)="desk.clearTicket()"
                  (callAgain)="desk.callAgain()"
                  (openHold)="desk.holdDialogOpen.set(true)"
                  (openMultiTx)="desk.openMultiTx()"
                  (markNoShow)="desk.markNoShow()"
                  (redirect)="desk.redirect($event)"
                  (updateJustify)="desk.updateJustifyReason($event.queueId, $event.subItemId)"
                  (openActions)="desk.openActionsDialog()"
                  (toggleAvailability)="desk.toggleAvailability()"
                  (editCounter)="desk.openChangeCategory()"
                />
              </div>
              <div class="min-w-0">
                <app-ticket-history-card [services]="desk.ticketHistory()" />
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <app-ticket-stats-card
                [queueItems]="desk.queueItems()"
                [getCount]="desk.getQueueTicketCount"
              />
              <app-held-tickets-card [heldTickets]="desk.heldTickets()" />
              <app-redirected-tickets-card [redirectedTickets]="desk.redirectedTickets()" />
            </div>
          }
        </div>
      }

      <app-hold-ticket-dialog
        [open]="desk.holdDialogOpen()"
        [holdReason]="desk.holdReason()"
        [actionPending]="desk.actionPending()"
        (holdReasonChange)="desk.holdReason.set($event)"
        (confirm)="desk.holdTicket()"
        (close)="desk.holdDialogOpen.set(false)"
      />
      <app-unavailable-reason-dialog
        [open]="desk.unavailableDialogOpen()"
        [actionPending]="desk.actionPending()"
        (confirm)="desk.confirmUnavailable($event)"
        (close)="desk.closeUnavailableDialog()"
      />
      <app-actions-dialog
        [open]="desk.actionsDialogOpen()"
        [actionPending]="desk.actionPending()"
        [heldTickets]="desk.heldTickets()"
        [redirectedTickets]="desk.redirectedTickets()"
        (close)="desk.closeActionsDialog()"
        (getNext)="desk.fetchNextTicket()"
        (editCounter)="desk.openChangeCategory()"
        (goUnavailable)="desk.goUnavailableFromActions()"
        (unhold)="desk.unholdTicket($event)"
        (claimRedirect)="desk.claimRedirected($event)"
      />
      <app-change-category-dialog
        [open]="desk.changeCategoryOpen()"
        [queueItems]="desk.queueItems()"
        [queueId]="desk.categoryQueueId()"
        [counterNumber]="desk.categoryCounterNumber()"
        [branchId]="branchId"
        [excludeCounterId]="desk.activeCounter()?.id ?? null"
        [numberAvailable]="categoryNumberAvailable"
        [actionPending]="desk.actionPending()"
        [loading]="desk.categoryLoading()"
        (queueIdChange)="desk.categoryQueueId.set($event)"
        (counterNumberChange)="desk.categoryCounterNumber.set($event)"
        (numberAvailableChange)="categoryNumberAvailable = $event"
        (save)="desk.saveChangeCategory()"
        (close)="desk.changeCategoryOpen.set(false)"
      />
      <app-multiple-transactions-dialog
        [open]="desk.multiTxOpen()"
        [queueItems]="desk.queueItems()"
        [selected]="desk.selectedTransactions()"
        [actionPending]="desk.actionPending()"
        (selectedChange)="desk.selectedTransactions.set($event)"
        (save)="desk.saveMultiTx()"
        (close)="desk.multiTxOpen.set(false)"
      />
    </div>
  `,
})
export class ServingPage implements OnInit, OnDestroy {
  readonly desk = inject(ServingDeskService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly inactivity = inject(InactivityTimeoutService);
  private readonly platform = inject(PLATFORM_ID);

  readonly icons = { LogOut, Settings2 };
  openCounterNumber = 1;
  openQueueId = '';
  opening = false;
  openNumberAvailable: boolean | null = null;
  categoryNumberAvailable: boolean | null = null;

  get branchId() {
    return this.session.session().branchId || this.desk.activeCounter()?.branchId || '';
  }

  get openCounterNumberAsString() {
    return String(this.openCounterNumber ?? '');
  }

  async ngOnInit() {
    if (!isPlatformBrowser(this.platform)) return;
    this.inactivity.start({
      timeoutMinutes: 5,
      onExpire: () => this.logoutDueToInactivity(),
    });
    await this.desk.bootstrap();
    if (!this.openQueueId && this.desk.queueItems().length) {
      this.openQueueId = this.desk.queueItems()[0].id;
    }
  }

  ngOnDestroy() {
    this.inactivity.stop();
    this.desk.ngOnDestroy();
  }

  async openCounter() {
    if (!this.openQueueId || !this.openCounterNumber) {
      this.toast.error('Counter number and queue are required');
      return;
    }
    if (this.openNumberAvailable === false) {
      this.toast.error('That counter number is already taken today');
      return;
    }
    this.opening = true;
    try {
      await this.desk.openCounter(Number(this.openCounterNumber), this.openQueueId);
      this.toast.success('Counter opened');
    } catch (error: unknown) {
      const err = error as { error?: { error?: string } };
      this.toast.error(err.error?.error || 'Failed to open counter');
    } finally {
      this.opening = false;
    }
  }

  async logoutDueToInactivity() {
    this.toast.error('Session expired due to inactivity. Redirecting to login...');
    try {
      await this.session.logout();
    } catch {
      /* still redirect */
    }
    location.href = '/tellerLogin';
  }

  async logout() {
    this.inactivity.stop();
    await this.session.logout();
    location.href = '/tellerLogin';
  }
}
