import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Eye, Filter, LucideAngularModule, Route, X } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { formatInEat } from '../../core/timezone';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
  UiQueueSpinner,
} from '../../shared/ui/ui';

type UserInfo = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  username: string;
};

type AuditLog = {
  id: string;
  collectionName: string;
  documentId: string | null;
  operation: string;
  userId: string | null;
  performedBy: string | null;
  description: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  sessionId: string | null;
  actorType: string | null;
  category: string | null;
  action: string | null;
  outcome: string | null;
  ticketId: string | null;
  createdAt: string;
  userInfo: UserInfo | null;
  performedByInfo: UserInfo | null;
};

type UserSessionRow = {
  id: string;
  userId: string | null;
  date: string;
  actorType: string | null;
  actorTypes: string[];
  branchName: string | null;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  eventCount: number;
  userInfo: UserInfo | null;
};

type FilterUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  username?: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function displayName(info: UserInfo | null | undefined, fallback = 'System') {
  if (!info) return fallback;
  return info.username || fallback;
}

function categoryColor(value: string | null) {
  switch (value) {
    case 'auth':
      return 'bg-purple-100 text-purple-800';
    case 'page':
      return 'bg-slate-100 text-slate-800';
    case 'config':
      return 'bg-primary-100 text-primary-800';
    case 'serving':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function actorColor(value: string | null) {
  switch (value) {
    case 'serving':
      return 'bg-amber-100 text-amber-800';
    case 'admin':
      return 'bg-red-100 text-red-800';
    case 'dashboard':
      return 'bg-primary-100 text-primary-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function operationColor(operation: string) {
  switch (operation.toLowerCase()) {
    case 'create':
    case 'login':
    case 'claim':
    case 'serve':
    case 'available':
      return 'bg-green-100 text-green-800';
    case 'update':
    case 'view':
    case 'hold':
    case 'resume':
    case 'reorder':
      return 'bg-primary-100 text-primary-800';
    case 'delete':
    case 'logout':
    case 'paused':
    case 'no_show':
    case 'login_failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

@Component({
  selector: 'app-audit-logs',
  imports: [
    FormsModule,
    LucideAngularModule,
    UiButton,
    UiCard,
    UiCardContent,
    UiCardHeader,
    UiCardTitle,
    UiQueueSpinner,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <ui-card class="gap-0 py-0">
        <ui-card-header class="pt-6">
          <ui-card-title class="flex items-center gap-2">
            <lucide-angular [img]="icons.Filter" class="size-5"></lucide-angular>
            Filters
          </ui-card-title>
        </ui-card-header>
        <ui-card-content class="pb-6">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label class="grid gap-2 text-sm font-medium">
              User
              <select
                class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                [(ngModel)]="selectedUserId"
                (ngModelChange)="onFilterChange()"
              >
                <option value="">All users</option>
                @for (user of users(); track user.id) {
                  <option [value]="user.id">
                    {{ user.firstName }} {{ user.lastName }}
                  </option>
                }
              </select>
            </label>
            <label class="grid gap-2 text-sm font-medium">
              Category
              <select
                class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                [(ngModel)]="category"
                (ngModelChange)="onFilterChange()"
              >
                <option value="">All categories</option>
                <option value="auth">Auth</option>
                <option value="page">Page</option>
                <option value="config">Config</option>
                <option value="serving">Serving</option>
              </select>
            </label>
            <label class="grid gap-2 text-sm font-medium">
              Actor type
              <select
                class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                [(ngModel)]="actorType"
                (ngModelChange)="onFilterChange()"
              >
                <option value="">All actor types</option>
                <option value="dashboard">Dashboard</option>
                <option value="serving">Serving</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            @if (tab() === 'events') {
              <label class="grid gap-2 text-sm font-medium">
                Operation
                <select
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  [(ngModel)]="operation"
                  (ngModelChange)="onFilterChange()"
                >
                  <option value="">All operations</option>
                  @for (op of uniqueOperations(); track op) {
                    <option [value]="op">{{ op }}</option>
                  }
                </select>
              </label>
              <label class="grid gap-2 text-sm font-medium">
                Collection
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="Filter by collection..."
                  [(ngModel)]="collectionName"
                  (ngModelChange)="onFilterChange()"
                />
              </label>
            }
            <label class="grid gap-2 text-sm font-medium">
              Start Date
              <input
                type="date"
                class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                [(ngModel)]="startDate"
                (ngModelChange)="onFilterChange()"
              />
            </label>
            <label class="grid gap-2 text-sm font-medium">
              End Date
              <input
                type="date"
                class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                [(ngModel)]="endDate"
                (ngModelChange)="onFilterChange()"
              />
            </label>
          </div>
          <div class="mt-4 flex justify-end">
            <button uiBtn variant="outline" type="button" (click)="clearFilters()">
              <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              Clear Filters
            </button>
          </div>
        </ui-card-content>
      </ui-card>

      <div class="inline-flex gap-1 rounded-lg border bg-muted/40 p-1">
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          [class.bg-background]="tab() === 'sessions'"
          [class.shadow-sm]="tab() === 'sessions'"
          [class.text-foreground]="tab() === 'sessions'"
          [class.text-muted-foreground]="tab() !== 'sessions'"
          (click)="setTab('sessions')"
        >
          Journeys
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          [class.bg-background]="tab() === 'events'"
          [class.shadow-sm]="tab() === 'events'"
          [class.text-foreground]="tab() === 'events'"
          [class.text-muted-foreground]="tab() !== 'events'"
          (click)="setTab('events')"
        >
          Events
        </button>
      </div>

      @if (tab() === 'sessions') {
        <ui-card class="gap-0 py-0">
          <ui-card-header class="pt-6">
            <ui-card-title>Daily journeys ({{ total() }} total)</ui-card-title>
          </ui-card-header>
          <ui-card-content class="pb-6">
            @if (loading()) {
              <div class="flex h-64 items-center justify-center">
                <ui-queue-spinner size="lg" [dotCount]="12" />
              </div>
            } @else if (sessions().length === 0) {
              <div class="py-8 text-center text-muted-foreground">No sessions found</div>
            } @else {
              <div class="overflow-auto rounded-md border">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b bg-muted/40">
                      <th class="h-11 px-4 font-medium text-muted-foreground">Started</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Ended</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">User</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Actor</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Branch</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Events</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">End reason</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of sessions(); track row.id) {
                      <tr class="border-t hover:bg-muted/40">
                        <td class="px-4 py-3 font-mono text-sm">
                          {{ formatDate(row.startedAt) }}
                        </td>
                        <td class="px-4 py-3 font-mono text-sm">
                          {{ row.endedAt ? formatDate(row.endedAt) : 'Active' }}
                        </td>
                        <td class="px-4 py-3">{{ sessionUserLabel(row) }}</td>
                        <td class="px-4 py-3">
                          <div class="flex flex-wrap gap-1">
                            @for (actor of sessionActors(row); track actor) {
                              <span
                                class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {{
                                  actorColor(actor)
                                }}"
                              >
                                {{ actor }}
                              </span>
                            }
                          </div>
                        </td>
                        <td class="px-4 py-3">{{ row.branchName || '-' }}</td>
                        <td class="px-4 py-3">{{ row.eventCount }}</td>
                        <td class="px-4 py-3">{{ row.endReason || '-' }}</td>
                        <td class="px-4 py-3">
                          <button
                            uiBtn
                            variant="ghost"
                            size="sm"
                            type="button"
                            (click)="openJourney(row)"
                          >
                            <lucide-angular [img]="icons.Route" class="size-4"></lucide-angular>
                            Journey
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (totalPages() > 1) {
                <div class="mt-4 flex items-center justify-between text-sm">
                  <div class="text-muted-foreground">
                    Page {{ page() }} of {{ totalPages() }}
                  </div>
                  <div class="flex gap-2">
                    <button
                      uiBtn
                      variant="outline"
                      size="sm"
                      type="button"
                      [disabled]="page() === 1"
                      (click)="goPage(page() - 1)"
                    >
                      Previous
                    </button>
                    <button
                      uiBtn
                      variant="outline"
                      size="sm"
                      type="button"
                      [disabled]="page() === totalPages()"
                      (click)="goPage(page() + 1)"
                    >
                      Next
                    </button>
                  </div>
                </div>
              }
            }
          </ui-card-content>
        </ui-card>
      } @else {
        <ui-card class="gap-0 py-0">
          <ui-card-header class="pt-6">
            <ui-card-title>Audit Trail ({{ total() }} total)</ui-card-title>
          </ui-card-header>
          <ui-card-content class="pb-6">
            @if (loading()) {
              <div class="flex h-64 items-center justify-center">
                <ui-queue-spinner size="lg" [dotCount]="12" />
              </div>
            } @else if (auditLogs().length === 0) {
              <div class="py-8 text-center text-muted-foreground">No audit logs found</div>
            } @else {
              <div class="overflow-auto rounded-md border">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b bg-muted/40">
                      <th class="h-11 px-4 font-medium text-muted-foreground">Date & Time</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Action</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Category</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">User</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Description</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (log of auditLogs(); track log.id) {
                      <tr class="border-t hover:bg-muted/40">
                        <td class="px-4 py-3 font-mono text-sm">
                          {{ formatDate(log.createdAt) }}
                        </td>
                        <td class="px-4 py-3">
                          <span
                            class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {{
                              operationColor(log.action || log.operation)
                            }}"
                          >
                            {{ log.action || log.operation }}
                          </span>
                        </td>
                        <td class="px-4 py-3">
                          @if (log.category) {
                            <span
                              class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {{
                                categoryColor(log.category)
                              }}"
                            >
                              {{ log.category }}
                            </span>
                          } @else {
                            {{ log.collectionName }}
                          }
                        </td>
                        <td class="px-4 py-3">{{ getUserDisplayName(log) }}</td>
                        <td class="max-w-xs truncate px-4 py-3">
                          {{ log.description || '-' }}
                        </td>
                        <td class="px-4 py-3">
                          <button
                            uiBtn
                            variant="ghost"
                            size="sm"
                            type="button"
                            (click)="openEventDetail(log)"
                          >
                            <lucide-angular [img]="icons.Eye" class="size-4"></lucide-angular>
                            View
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (totalPages() > 1) {
                <div class="mt-4 flex items-center justify-between text-sm">
                  <div class="text-muted-foreground">
                    Page {{ page() }} of {{ totalPages() }}
                  </div>
                  <div class="flex gap-2">
                    <button
                      uiBtn
                      variant="outline"
                      size="sm"
                      type="button"
                      [disabled]="page() === 1"
                      (click)="goPage(page() - 1)"
                    >
                      Previous
                    </button>
                    <button
                      uiBtn
                      variant="outline"
                      size="sm"
                      type="button"
                      [disabled]="page() === totalPages()"
                      (click)="goPage(page() + 1)"
                    >
                      Next
                    </button>
                  </div>
                </div>
              }
            }
          </ui-card-content>
        </ui-card>
      }

      @if (selectedLog(); as log) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeEventDetail()"
        >
          <div
            class="glass max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">Audit Log Details</h3>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeEventDetail()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <div class="text-sm font-semibold">Action</div>
                  <p class="text-sm">{{ log.action || log.operation }}</p>
                </div>
                <div>
                  <div class="text-sm font-semibold">Category</div>
                  <p class="text-sm">{{ log.category || log.collectionName }}</p>
                </div>
                <div>
                  <div class="text-sm font-semibold">Performed By</div>
                  <p class="text-sm">{{ getUserDisplayName(log) }}</p>
                </div>
                <div>
                  <div class="text-sm font-semibold">Date & Time</div>
                  <p class="text-sm">{{ formatDate(log.createdAt) }}</p>
                </div>
                @if (log.description) {
                  <div class="col-span-2">
                    <div class="text-sm font-semibold">Description</div>
                    <p class="text-sm">{{ log.description }}</p>
                  </div>
                }
                @if (log.ticketId) {
                  <div>
                    <div class="text-sm font-semibold">Ticket ID</div>
                    <p class="font-mono text-sm">{{ log.ticketId }}</p>
                  </div>
                }
                @if (log.sessionId) {
                  <div>
                    <div class="text-sm font-semibold">Session ID</div>
                    <p class="break-all font-mono text-sm">{{ log.sessionId }}</p>
                  </div>
                }
              </div>
              @if (log.before != null) {
                <div>
                  <div class="text-sm font-semibold">Before</div>
                  <pre
                    class="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs"
                  >{{ prettyJson(log.before) }}</pre>
                </div>
              }
              @if (log.after != null) {
                <div>
                  <div class="text-sm font-semibold">After</div>
                  <pre
                    class="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs"
                  >{{ prettyJson(log.after) }}</pre>
                </div>
              }
              @if (log.metadata != null) {
                <div>
                  <div class="text-sm font-semibold">Metadata</div>
                  <pre
                    class="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs"
                  >{{ prettyJson(log.metadata) }}</pre>
                </div>
              }
            </div>
          </div>
        </div>
      }

      @if (journeySession(); as session) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeJourney()"
        >
          <div
            class="glass max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">{{ journeyTitle(session) }}</h3>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeJourney()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <p class="mb-4 text-sm text-muted-foreground">
              {{ formatDate(session.startedAt) }}
              →
              {{ session.endedAt ? formatDate(session.endedAt) : 'Active'
              }}{{ session.endReason ? ' (' + session.endReason + ')' : '' }}
            </p>
            @if (journeyLoading()) {
              <div class="flex justify-center py-12">
                <ui-queue-spinner size="lg" [dotCount]="12" />
              </div>
            } @else if (journeyEvents().length === 0) {
              <p class="py-8 text-center text-sm text-muted-foreground">
                No events recorded for this session
              </p>
            } @else {
              <ol class="relative ml-3 space-y-4 border-l border-border py-2">
                @for (event of journeyEvents(); track event.id) {
                  <li class="relative ml-4">
                    <div
                      class="absolute -left-[1.375rem] mt-1.5 size-3 rounded-full bg-primary"
                    ></div>
                    <p class="font-mono text-xs text-muted-foreground">
                      {{ formatDate(event.createdAt) }}
                    </p>
                    <div class="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {{
                          operationColor(event.action || event.operation)
                        }}"
                      >
                        {{ event.action || event.operation }}
                      </span>
                      @if (event.category) {
                        <span
                          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {{
                            categoryColor(event.category)
                          }}"
                        >
                          {{ event.category }}
                        </span>
                      }
                    </div>
                    <p class="mt-1 text-sm">
                      {{ event.description || event.collectionName }}
                    </p>
                  </li>
                }
              </ol>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class AuditLogsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Filter, X, Eye, Route };
  readonly tab = signal<'sessions' | 'events'>('sessions');
  readonly auditLogs = signal<AuditLog[]>([]);
  readonly sessions = signal<UserSessionRow[]>([]);
  readonly users = signal<FilterUser[]>([]);
  readonly loading = signal(true);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly selectedLog = signal<AuditLog | null>(null);
  readonly journeySession = signal<UserSessionRow | null>(null);
  readonly journeyEvents = signal<AuditLog[]>([]);
  readonly journeyLoading = signal(false);

  selectedUserId = '';
  category = '';
  actorType = '';
  operation = '';
  collectionName = '';
  startDate = '';
  endDate = '';

  readonly categoryColor = categoryColor;
  readonly actorColor = actorColor;
  readonly operationColor = operationColor;

  async ngOnInit() {
    await this.fetchUsers();
    await this.reload();
  }

  uniqueOperations() {
    return Array.from(new Set(this.auditLogs().map((log) => log.operation).filter(Boolean)));
  }

  formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
    return formatInEat(value, options);
  }

  prettyJson(value: unknown) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  getUserDisplayName(log: AuditLog) {
    if (log.performedByInfo) return displayName(log.performedByInfo);
    if (log.userInfo) return displayName(log.userInfo);
    if (log.performedBy && !UUID_RE.test(log.performedBy)) {
      return log.performedBy.charAt(0).toUpperCase() + log.performedBy.slice(1);
    }
    return 'System';
  }

  sessionUserLabel(row: UserSessionRow) {
    if (row.userInfo) return displayName(row.userInfo);
    if ((row.actorTypes ?? []).includes('admin') || row.actorType === 'admin') return 'Admin';
    return 'Unknown';
  }

  sessionActors(row: UserSessionRow) {
    if (row.actorTypes?.length) return row.actorTypes;
    if (row.actorType) return [row.actorType];
    return [];
  }

  journeyTitle(session: UserSessionRow) {
    const who = session.userInfo
      ? displayName(session.userInfo)
      : (session.actorTypes ?? []).includes('admin') || session.actorType === 'admin'
        ? 'Admin'
        : 'User';
    const day = formatInEat(session.startedAt, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    return `${who} — ${day}`;
  }

  setTab(next: 'sessions' | 'events') {
    if (this.tab() === next) return;
    this.tab.set(next);
    this.page.set(1);
    void this.reload();
  }

  onFilterChange() {
    this.page.set(1);
    void this.reload();
  }

  clearFilters() {
    this.selectedUserId = '';
    this.category = '';
    this.actorType = '';
    this.operation = '';
    this.collectionName = '';
    this.startDate = '';
    this.endDate = '';
    this.page.set(1);
    void this.reload();
  }

  goPage(next: number) {
    const clamped = Math.max(1, Math.min(this.totalPages(), next));
    if (clamped === this.page()) return;
    this.page.set(clamped);
    void this.reload();
  }

  openEventDetail(log: AuditLog) {
    this.selectedLog.set(log);
  }

  closeEventDetail() {
    this.selectedLog.set(null);
  }

  closeJourney() {
    this.journeySession.set(null);
    this.journeyEvents.set([]);
  }

  async openJourney(row: UserSessionRow) {
    this.journeySession.set(row);
    this.journeyLoading.set(true);
    this.journeyEvents.set([]);
    try {
      const params: Record<string, string | number> = {
        day: row.date,
        limit: 500,
      };
      if (row.userId) {
        params['userId'] = row.userId;
      } else {
        params['actorType'] = 'admin';
      }
      const data = await this.api.get<{ auditLogs: AuditLog[] }>('/api/bank/audit-logs', params);
      this.journeyEvents.set(data.auditLogs ?? []);
    } catch {
      this.toast.error('Failed to load session journey');
    } finally {
      this.journeyLoading.set(false);
    }
  }

  private async fetchUsers() {
    try {
      const data = await this.api.get<FilterUser[]>('/api/bank/users');
      this.users.set(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }

  private filterParams() {
    return {
      page: this.page(),
      limit: 50,
      userId: this.selectedUserId || undefined,
      category: this.category || undefined,
      actorType: this.actorType || undefined,
      startDate: this.startDate || undefined,
      endDate: this.endDate || undefined,
    };
  }

  private async reload() {
    if (this.tab() === 'sessions') {
      await this.fetchSessions();
    } else {
      await this.fetchAuditLogs();
    }
  }

  private async fetchSessions() {
    this.loading.set(true);
    try {
      const data = await this.api.get<{ sessions: UserSessionRow[]; pagination: Pagination }>(
        '/api/bank/audit-logs',
        { ...this.filterParams(), view: 'sessions' },
      );
      this.sessions.set(data.sessions ?? []);
      this.totalPages.set(data.pagination?.totalPages ?? 1);
      this.total.set(data.pagination?.total ?? 0);
      if (data.pagination?.page) this.page.set(data.pagination.page);
    } catch {
      this.toast.error('Failed to fetch sessions');
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchAuditLogs() {
    this.loading.set(true);
    try {
      const data = await this.api.get<{ auditLogs: AuditLog[]; pagination: Pagination }>(
        '/api/bank/audit-logs',
        {
          ...this.filterParams(),
          operation: this.operation || undefined,
          collectionName: this.collectionName || undefined,
        },
      );
      this.auditLogs.set(data.auditLogs ?? []);
      this.totalPages.set(data.pagination?.totalPages ?? 1);
      this.total.set(data.pagination?.total ?? 0);
      if (data.pagination?.page) this.page.set(data.pagination.page);
    } catch {
      this.toast.error('Failed to fetch audit logs');
    } finally {
      this.loading.set(false);
    }
  }
}
