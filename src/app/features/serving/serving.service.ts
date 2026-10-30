import { Injectable, OnDestroy, inject, signal, computed } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast.service';
import { RealtimeService } from '../../core/realtime.service';
import { eatCalendarDate, fromEatStorage } from '../../core/timezone';
import type {
  ActiveCounter,
  AvailableCounter,
  QueueItem,
  ServingActionPending,
  Ticket,
  TicketServiceHistoryItem,
  TransactionSelection,
} from './types';
import type { UnavailableReason } from './unavailable-reasons';

const SLA_GRACE_SECONDS = 30;
const SLA_LIMIT_SECONDS = 5 * 60;

@Injectable()
export class ServingDeskService implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly realtime = inject(RealtimeService);
  private unsubscribeRealtime: (() => void) | null = null;

  readonly loading = signal(true);
  readonly bootstrapError = signal<string | null>(null);
  readonly activeCounter = signal<ActiveCounter | null>(null);
  readonly currentTicket = signal<Ticket | null>(null);
  readonly ticketHistory = signal<TicketServiceHistoryItem[]>([]);
  readonly queueItems = signal<QueueItem[]>([]);
  readonly queueStatus = signal(0);
  readonly averageServingTime = signal('0:00');
  readonly heldTickets = signal<Ticket[]>([]);
  readonly redirectedTickets = signal<Ticket[]>([]);
  readonly ticketsServed = signal(0);
  readonly totalDailyTickets = signal(0);
  readonly availableCounters = signal<AvailableCounter[]>([]);
  readonly queueTicketCounts = signal<Record<string, number>>({});
  readonly actionPending = signal<ServingActionPending>(null);
  readonly waitingForTicket = signal(false);
  readonly isFetchingNext = signal(false);

  readonly slaTimeRemaining = signal<number | null>(null);
  readonly slaExceeded = signal(false);
  readonly slaInGracePeriod = signal(false);

  readonly holdDialogOpen = signal(false);
  readonly holdReason = signal('');
  readonly actionsDialogOpen = signal(false);
  readonly unavailableDialogOpen = signal(false);
  readonly changeCategoryOpen = signal(false);
  readonly multiTxOpen = signal(false);
  readonly selectedTransactions = signal<TransactionSelection[]>([]);
  readonly categoryQueueId = signal('');
  readonly categoryCounterNumber = signal('');
  readonly categoryLoading = signal(false);

  readonly isTicketActionPending = computed(() => !!this.actionPending());

  private servingStartTimes: Record<string, Date> = {};
  private suppressAutoFetch = false;
  private fetchInFlight = false;
  private timers: ReturnType<typeof setInterval>[] = [];

  async bootstrap() {
    this.loading.set(true);
    this.bootstrapError.set(null);
    try {
      await this.session.refresh();
      const [counter, queues] = await Promise.all([
        this.api.get<ActiveCounter | null>('/api/bank/counter'),
        this.api.get<QueueItem[]>('/api/bank/queues'),
      ]);
      this.queueItems.set(Array.isArray(queues) ? queues : []);
      if (counter) {
        this.activeCounter.set(this.normalizeCounter(counter));
        if (counter.averageServingTime) {
          this.averageServingTime.set(counter.averageServingTime);
        }
        await this.refreshDesk();
        this.startPolling();
      } else {
        this.activeCounter.set(null);
      }
    } catch (e) {
      this.bootstrapError.set('Failed to load serving desk.');
      console.error(e);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.stopPolling();
  }

  private startPolling() {
    this.stopPolling();
    const branchId = this.session.session().branchId || this.activeCounter()?.branchId;
    // Server events drive refreshes. refreshDesk also reloads queue counts and available counters.
    this.unsubscribeRealtime = this.realtime.subscribe(
      ['tickets', 'counters', 'resync'],
      () => {
        void this.refreshDesk().then(() => this.maybeAutoClaim());
      },
      branchId,
    );
    // Safety nets for missed events and guard-blocked claims.
    this.timers.push(setInterval(() => void this.refreshDesk(), 30_000));
    this.timers.push(setInterval(() => void this.maybeAutoClaim(), 5000));
    this.timers.push(setInterval(() => this.tickSla(), 1000));
  }

  private stopPolling() {
    if (this.refreshRetryTimer) clearTimeout(this.refreshRetryTimer);
    this.refreshRetryTimer = null;
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = null;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private normalizeCounter(c: ActiveCounter): ActiveCounter {
    return {
      ...c,
      queue: c.queue ?? { id: c.queueId, name: 'Queue' },
    };
  }

  async openCounter(counterNumber: number, queueId: string) {
    const created = await this.api.post<ActiveCounter>('/api/bank/counter', {
      counterNumber,
      queueId,
      branchId: this.session.session().branchId,
    });
    await this.session.refresh();
    this.activeCounter.set(this.normalizeCounter(created));
    this.startPolling();
    await this.refreshDesk();
  }

  async refreshDesk() {
    const counter = this.activeCounter();
    if (!counter) return;
    const today = eatCalendarDate();
    const branchId = this.session.session().branchId || counter.branchId;

    try {
      const [tickets, available, counterFresh] = await Promise.all([
        this.api.get<Ticket[]>('/api/bank/ticket', { branchId, date: today }),
        this.api.get<AvailableCounter[]>('/api/bank/counter/available', { branchId }),
        this.api.get<ActiveCounter | null>('/api/bank/counter'),
      ]);

      if (counterFresh) {
        this.activeCounter.set(this.normalizeCounter(counterFresh));
        if (counterFresh.averageServingTime) {
          this.averageServingTime.set(counterFresh.averageServingTime);
        }
      }

      const list = Array.isArray(tickets) ? tickets : [];
      const serving = list.find(
        (t) => t.ticketStatus === 'Serving' && t.counterId === counter.id,
      );
      const held = list.filter(
        (t) => t.ticketStatus === 'Hold' && t.counterId === counter.id,
      );
      const redirected = list.filter(
        (t) =>
          t.ticketStatus === 'Redirected' &&
          t.counterId === counter.id &&
          t.pendingRedirectAcceptance !== false,
      );
      const servedMine = list.filter(
        (t) => t.ticketStatus === 'Served' && t.counterId === counter.id,
      );

      this.heldTickets.set(held);
      this.redirectedTickets.set(redirected);
      this.ticketsServed.set(servedMine.length);
      this.totalDailyTickets.set(list.length);
      this.availableCounters.set(
        (Array.isArray(available) ? available : []).filter((c) => c.id !== counter.id),
      );

      if (serving) {
        this.setCurrentTicket(serving);
      } else if (this.currentTicket()?.counterId === counter.id) {
        this.currentTicket.set(null);
        this.ticketHistory.set([]);
      }

      await this.refreshQueueCounts();
      this.refreshRetries = 0;
    } catch (e) {
      console.error(e);
      this.scheduleRefreshRetry();
    }
  }

  private refreshRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshRetries = 0;

  /** Events replaced the 5s poll, so a failed refresh must be retried soon instead of waiting for the 30s safety net. */
  private scheduleRefreshRetry() {
    if (this.refreshRetryTimer || this.refreshRetries >= 6) return;
    this.refreshRetries++;
    this.refreshRetryTimer = setTimeout(() => {
      this.refreshRetryTimer = null;
      void this.refreshDesk().then(() => this.maybeAutoClaim());
    }, Math.min(1000 * this.refreshRetries, 5000));
  }

  private async refreshQueueCounts() {
    const branchId = this.session.session().branchId || this.activeCounter()?.branchId;
    const items = this.queueItems();
    if (!branchId || !items.length) return;
    const today = eatCalendarDate();
    try {
      const counts: Record<string, number> = {};
      let total = 0;
      const results = await Promise.all(
        items.map((q) =>
          this.api.get<Ticket[]>('/api/bank/ticket', {
            queueId: q.id,
            status: 'Not Served',
            branchId,
            date: today,
          }),
        ),
      );
      results.forEach((tickets, i) => {
        const n = Array.isArray(tickets) ? tickets.length : 0;
        counts[items[i].id] = n;
        total += n;
      });
      this.queueTicketCounts.set(counts);
      this.queueStatus.set(total);
    } catch {
      /* ignore */
    }
  }

  private setCurrentTicket(ticket: Ticket | null) {
    this.currentTicket.set(ticket);
    if (ticket) {
      if (!this.servingStartTimes[ticket.id]) {
        // updatedAt is EAT storage — convert to real instant for SLA math
        this.servingStartTimes[ticket.id] = ticket.updatedAt
          ? fromEatStorage(new Date(ticket.updatedAt))
          : new Date();
      }
      void this.loadHistory(ticket.id);
    } else {
      this.ticketHistory.set([]);
      this.slaTimeRemaining.set(null);
    }
  }

  private async loadHistory(ticketId: string) {
    try {
      const data = await this.api.get<{ services?: TicketServiceHistoryItem[] }>(
        `/api/bank/ticket/${ticketId}/history`,
      );
      this.ticketHistory.set(Array.isArray(data?.services) ? data.services : []);
    } catch {
      this.ticketHistory.set([]);
    }
  }

  private tickSla() {
    const ticket = this.currentTicket();
    const start = ticket ? this.servingStartTimes[ticket.id] : undefined;
    if (!ticket || !start) {
      this.slaTimeRemaining.set(null);
      this.slaExceeded.set(false);
      this.slaInGracePeriod.set(false);
      return;
    }
    const elapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
    if (elapsed < SLA_GRACE_SECONDS) {
      this.slaInGracePeriod.set(true);
      this.slaExceeded.set(false);
      this.slaTimeRemaining.set(SLA_GRACE_SECONDS - elapsed);
      return;
    }
    this.slaInGracePeriod.set(false);
    const afterGrace = elapsed - SLA_GRACE_SECONDS;
    if (afterGrace <= SLA_LIMIT_SECONDS) {
      this.slaExceeded.set(false);
      this.slaTimeRemaining.set(SLA_LIMIT_SECONDS - afterGrace);
    } else {
      this.slaExceeded.set(true);
      this.slaTimeRemaining.set(afterGrace - SLA_LIMIT_SECONDS);
    }
  }

  private async maybeAutoClaim() {
    const counter = this.activeCounter();
    if (
      !counter?.available ||
      this.currentTicket() ||
      this.suppressAutoFetch ||
      this.actionsDialogOpen() ||
      this.unavailableDialogOpen() ||
      this.changeCategoryOpen() ||
      this.actionPending() ||
      this.fetchInFlight
    ) {
      return;
    }
    await this.fetchNextTicket({ silent: true });
  }

  getQueueTicketCount = (queueId: string) => this.queueTicketCounts()[queueId] ?? 0;

  openActionsDialog() {
    this.suppressAutoFetch = true;
    this.actionsDialogOpen.set(true);
  }

  closeActionsDialog() {
    this.actionsDialogOpen.set(false);
    if (!this.currentTicket()) {
      this.suppressAutoFetch = false;
    }
  }

  private async putTicket(ticketId: string, body: Record<string, unknown>) {
    const res = await this.api.put<{ success?: boolean; data?: Ticket } | Ticket>(
      `/api/bank/ticket/${ticketId}`,
      body,
    );
    if (res && typeof res === 'object' && 'data' in res && res.data) return res.data;
    return res as Ticket;
  }

  async clearTicket() {
    const ticket = this.currentTicket();
    if (!ticket || this.actionPending()) return;
    this.actionPending.set('clearing');
    try {
      const updated = await this.putTicket(ticket.id, { ticketStatus: 'Served' });
      delete this.servingStartTimes[ticket.id];
      this.setCurrentTicket(null);
      this.ticketsServed.update((n) => n + 1);
      if (updated?.ratingSmsDeferred) {
        this.toast.success(
          'Ticket served. A rating SMS is being sent in the background if available.',
        );
      }
      this.suppressAutoFetch = true;
      this.actionsDialogOpen.set(true);
      await this.refreshDesk();
    } catch {
      this.toast.error('Failed to clear ticket');
    } finally {
      this.actionPending.set(null);
    }
  }

  async callAgain() {
    const ticket = this.currentTicket();
    if (!ticket || this.actionPending()) return;
    this.actionPending.set('callingAgain');
    try {
      await this.putTicket(ticket.id, { callAgain: true });
      this.toast.success('Calling ticket again');
    } catch {
      this.toast.error('Failed to call again');
    } finally {
      this.actionPending.set(null);
    }
  }

  async holdTicket(reason?: string) {
    const ticket = this.currentTicket();
    const holdComment = (reason ?? this.holdReason()).trim();
    if (!ticket || this.actionPending() || !holdComment) {
      if (!holdComment) this.toast.error('Hold reason is required');
      return;
    }
    this.actionPending.set('holding');
    try {
      await this.putTicket(ticket.id, { ticketStatus: 'Hold', holdComment });
      delete this.servingStartTimes[ticket.id];
      this.setCurrentTicket(null);
      this.holdDialogOpen.set(false);
      this.holdReason.set('');
      this.suppressAutoFetch = true;
      this.actionsDialogOpen.set(true);
      await this.refreshDesk();
    } catch {
      this.toast.error('Failed to hold ticket');
    } finally {
      this.actionPending.set(null);
    }
  }

  async markNoShow() {
    const ticket = this.currentTicket();
    if (!ticket || this.actionPending()) return;
    this.actionPending.set('markingNoShow');
    try {
      await this.putTicket(ticket.id, { ticketStatus: 'No Show' });
      delete this.servingStartTimes[ticket.id];
      this.setCurrentTicket(null);
      this.suppressAutoFetch = true;
      this.actionsDialogOpen.set(true);
      this.toast.success('Ticket marked as no show');
      await this.refreshDesk();
    } catch {
      this.toast.error('Failed to mark no show');
    } finally {
      this.actionPending.set(null);
    }
  }

  async redirect(counterId: string) {
    const ticket = this.currentTicket();
    if (!ticket || this.actionPending() || !counterId) return;
    this.actionPending.set('redirecting');
    try {
      await this.putTicket(ticket.id, { redirectToCounterId: counterId });
      delete this.servingStartTimes[ticket.id];
      this.setCurrentTicket(null);
      this.suppressAutoFetch = true;
      this.actionsDialogOpen.set(true);
      await this.refreshDesk();
    } catch {
      this.toast.error('Failed to redirect ticket');
    } finally {
      this.actionPending.set(null);
    }
  }

  async updateJustifyReason(queueId: string, subItemId: string) {
    const ticket = this.currentTicket();
    if (!ticket || this.actionPending()) return;
    const queue = this.queueItems().find((q) => q.id === queueId);
    const sub = queue?.menuItem.subMenuItems.find((s) => s.id === subItemId);
    if (!queue || !sub) return;
    this.actionPending.set('updatingJustify');
    try {
      const updated = await this.putTicket(ticket.id, {
        justifyReason: `${queue.menuItem.name}-${sub.name}`,
      });
      this.currentTicket.set(updated);
      this.toast.success('Confirmation successful');
    } catch {
      this.toast.error('Failed to update confirmation');
    } finally {
      this.actionPending.set(null);
    }
  }

  async fetchNextTicket(options?: { silent?: boolean }) {
    const counter = this.activeCounter();
    if (!counter || this.fetchInFlight || this.currentTicket()) return;
    this.fetchInFlight = true;
    if (!options?.silent) {
      this.actionPending.set('fetchingNext');
      this.isFetchingNext.set(true);
    }
    this.waitingForTicket.set(true);
    try {
      const res = await this.api.post<{ ticket?: Ticket; alreadyServing?: boolean }>(
        '/api/bank/ticket/claim',
        { counterId: counter.id },
      );
      const ticket = res?.ticket;
      if (ticket) {
        this.servingStartTimes[ticket.id] = new Date();
        this.setCurrentTicket(ticket);
        this.suppressAutoFetch = false;
        this.actionsDialogOpen.set(false);
      } else if (!options?.silent) {
        this.toast.error('No tickets available');
      }
      await this.refreshDesk();
    } catch {
      if (!options?.silent) this.toast.error('Failed to claim next ticket');
    } finally {
      this.fetchInFlight = false;
      this.waitingForTicket.set(false);
      this.isFetchingNext.set(false);
      if (!options?.silent) this.actionPending.set(null);
    }
  }

  async unholdTicket(ticket: Ticket) {
    if (this.actionPending()) return;
    this.actionPending.set('unholding');
    try {
      const updated = await this.putTicket(ticket.id, { ticketStatus: 'Serving' });
      this.servingStartTimes[updated.id] = new Date();
      this.setCurrentTicket(updated);
      this.actionsDialogOpen.set(false);
      this.suppressAutoFetch = false;
      await this.refreshDesk();
    } catch {
      this.toast.error('Failed to resume held ticket');
    } finally {
      this.actionPending.set(null);
    }
  }

  async claimRedirected(ticket: Ticket) {
    if (this.actionPending()) return;
    this.actionPending.set('claimingRedirect');
    try {
      const updated = await this.putTicket(ticket.id, { ticketStatus: 'Serving' });
      this.servingStartTimes[updated.id] = new Date();
      this.setCurrentTicket(updated);
      this.actionsDialogOpen.set(false);
      this.suppressAutoFetch = false;
      await this.refreshDesk();
    } catch {
      this.toast.error('Failed to claim redirected ticket');
    } finally {
      this.actionPending.set(null);
    }
  }

  async toggleAvailability() {
    const counter = this.activeCounter();
    if (!counter || this.actionPending()) return;
    if (counter.available) {
      this.openUnavailableDialog();
      return;
    }
    await this.setAvailability(true);
  }

  openUnavailableDialog() {
    this.actionsDialogOpen.set(false);
    this.suppressAutoFetch = true;
    this.unavailableDialogOpen.set(true);
  }

  closeUnavailableDialog() {
    this.unavailableDialogOpen.set(false);
    if (!this.currentTicket() && this.activeCounter()?.available) {
      this.suppressAutoFetch = false;
    }
  }

  async confirmUnavailable(reason: UnavailableReason) {
    const ok = await this.setAvailability(false, reason);
    if (ok) this.unavailableDialogOpen.set(false);
  }

  private async setAvailability(next: boolean, reason?: UnavailableReason) {
    const counter = this.activeCounter();
    if (!counter || this.actionPending()) return false;
    this.actionPending.set('togglingAvailability');
    try {
      const updated = await this.api.put<ActiveCounter>('/api/bank/counter', {
        available: next,
        ...(reason ? { unavailableReason: reason } : {}),
      });
      this.activeCounter.set(
        this.normalizeCounter({
          ...counter,
          ...updated,
          available: next,
          unavailableReason: next ? null : reason ?? updated.unavailableReason ?? null,
        }),
      );
      if (next) {
        this.suppressAutoFetch = false;
        await this.fetchNextTicket({ silent: true });
      } else {
        this.suppressAutoFetch = true;
      }
      return true;
    } catch {
      this.toast.error('Failed to update availability');
      return false;
    } finally {
      this.actionPending.set(null);
    }
  }

  openChangeCategory() {
    const counter = this.activeCounter();
    this.categoryQueueId.set(counter?.queueId || '');
    this.categoryCounterNumber.set(String(counter?.counterNumber ?? ''));
    this.changeCategoryOpen.set(true);
    this.actionsDialogOpen.set(false);
  }

  async saveChangeCategory() {
    if (this.actionPending()) return;
    this.actionPending.set('changingCategory');
    this.categoryLoading.set(true);
    try {
      await this.api.put('/api/bank/counter', {
        queueId: this.categoryQueueId(),
        counterNumber: Number(this.categoryCounterNumber()),
      });
      this.toast.success('Counter updated');
      location.reload();
    } catch {
      this.toast.error('Failed to change category');
      this.actionPending.set(null);
      this.categoryLoading.set(false);
    }
  }

  openMultiTx() {
    const ticket = this.currentTicket();
    let existing: TransactionSelection[] = [];
    const raw = ticket?.multipleTransactions;
    if (typeof raw === 'string') {
      try {
        existing = JSON.parse(raw);
      } catch {
        existing = [];
      }
    } else if (Array.isArray(raw)) {
      existing = raw;
    }
    this.selectedTransactions.set(
      existing.map((t) => ({ ...t, count: t.count && t.count > 0 ? t.count : 1 })),
    );
    this.multiTxOpen.set(true);
  }

  async saveMultiTx() {
    const ticket = this.currentTicket();
    if (!ticket || this.actionPending()) return;
    this.actionPending.set('savingTransactions');
    try {
      const payload = this.selectedTransactions().map((t) => ({
        ...t,
        count: t.count && t.count > 0 ? t.count : 1,
      }));
      const updated = await this.putTicket(ticket.id, {
        multipleTransactions: payload,
      });
      this.currentTicket.set(updated);
      this.multiTxOpen.set(false);
      this.toast.success('Transactions saved');
    } catch {
      this.toast.error('Failed to save transactions');
    } finally {
      this.actionPending.set(null);
    }
  }

  goUnavailableFromActions() {
    this.openUnavailableDialog();
  }
}
