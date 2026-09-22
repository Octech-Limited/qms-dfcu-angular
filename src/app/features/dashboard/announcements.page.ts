import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertTriangle,
  CheckCircle2,
  LucideAngularModule,
  Palette,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from 'lucide-angular';
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

type AnnouncementType = {
  id: string;
  name: string;
  backgroundColor: string;
  textColor: string;
  createdAt?: string;
};

type Announcement = {
  id: string;
  text: string;
  type: string | null;
  isActive: boolean;
  createdAt?: string;
};

@Component({
  selector: 'app-announcements',
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
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-bold tracking-tight">Announcements</h2>
        <button uiBtn variant="outline" size="sm" [disabled]="refreshing()" (click)="refresh()">
          <lucide-angular
            [img]="icons.RefreshCcw"
            class="size-4"
            [class.animate-spin]="refreshing()"
          ></lucide-angular>
          Refresh
        </button>
      </div>

      @if (loading()) {
        <div class="flex h-64 flex-col items-center justify-center gap-4">
          <ui-queue-spinner size="lg" [dotCount]="12" />
          <p class="text-sm text-muted-foreground">Loading announcements...</p>
        </div>
      } @else {
        <ui-card class="gap-0 py-0">
          <ui-card-header class="flex flex-row items-start justify-between gap-4 space-y-0 p-6 pb-4">
            <div>
              <ui-card-title class="text-xl">Announcement Types</ui-card-title>
              <p class="mt-1 text-sm text-muted-foreground">
                Create and customize announcement categories.
              </p>
            </div>
            <button uiBtn (click)="openTypeDialog()">
              <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
              New Type
            </button>
          </ui-card-header>
          <ui-card-content class="px-6 pb-6">
            @if (types().length === 0) {
              <div
                class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 p-10 text-center"
              >
                <lucide-angular
                  [img]="icons.Palette"
                  class="size-8 text-muted-foreground"
                ></lucide-angular>
                <div>
                  <p class="font-medium">No announcement types yet</p>
                  <p class="text-sm text-muted-foreground">
                    Create your first type to categorize announcements by color.
                  </p>
                </div>
                <button uiBtn size="sm" (click)="openTypeDialog()">
                  <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
                  Create Type
                </button>
              </div>
            } @else {
              <div class="overflow-auto">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b">
                      <th class="h-11 px-4 font-medium text-muted-foreground">Name</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Preview</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Created</th>
                      <th class="h-11 w-[120px] px-4 text-right font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (type of types(); track type.id) {
                      <tr class="border-t hover:bg-muted/40">
                        <td class="px-4 py-3 font-semibold uppercase tracking-wide">
                          {{ type.name }}
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex items-center gap-3">
                            <span
                              class="inline-flex min-w-[4rem] items-center justify-center rounded-full px-3 py-1 text-sm font-semibold uppercase tracking-wide"
                              [style.backgroundColor]="type.backgroundColor"
                              [style.color]="type.textColor"
                              >{{ type.name }}</span
                            >
                            <div class="flex items-center gap-2 text-xs text-muted-foreground">
                              <div class="flex items-center gap-1">
                                <span
                                  class="h-4 w-4 rounded"
                                  [style.backgroundColor]="type.backgroundColor"
                                ></span>
                                <span>{{ type.backgroundColor }}</span>
                              </div>
                              <div class="flex items-center gap-1">
                                <span
                                  class="h-4 w-4 rounded border"
                                  [style.backgroundColor]="type.textColor"
                                ></span>
                                <span>{{ type.textColor }}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td class="px-4 py-3">{{ formatDate(type.createdAt) }}</td>
                        <td class="px-4 py-3 text-right">
                          <div class="inline-flex items-center gap-1">
                            <button
                              uiBtn
                              size="icon"
                              variant="ghost"
                              extraClass="text-primary"
                              (click)="openTypeDialog(type)"
                            >
                              <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                            </button>
                            <button
                              uiBtn
                              size="icon"
                              variant="ghost"
                              extraClass="text-red-600"
                              (click)="confirmDeleteType.set(type)"
                            >
                              <lucide-angular [img]="icons.Trash2" class="size-4"></lucide-angular>
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </ui-card-content>
        </ui-card>

        <ui-card class="gap-0 py-0">
          <ui-card-header class="flex flex-row items-start justify-between gap-4 space-y-0 p-6 pb-4">
            <div>
              <ui-card-title class="text-xl">Announcements</ui-card-title>
              <p class="mt-1 text-sm text-muted-foreground">
                Manage the messages displayed on customer-facing screens.
              </p>
            </div>
            <button uiBtn (click)="openAnnouncementDialog()">
              <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
              New Announcement
            </button>
          </ui-card-header>
          <ui-card-content class="px-6 pb-6">
            <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div class="relative">
                <lucide-angular
                  [img]="icons.Search"
                  class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
                ></lucide-angular>
                <input
                  class="h-9 w-full rounded-md border border-input bg-background pl-10 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  placeholder="Search announcements..."
                  [(ngModel)]="searchQuery"
                  (ngModelChange)="currentPage.set(1)"
                />
                @if (searchQuery) {
                  <button
                    type="button"
                    class="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted"
                    (click)="searchQuery = ''; currentPage.set(1)"
                  >
                    <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
                  </button>
                }
              </div>
              <select
                class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                [(ngModel)]="typeFilter"
                (ngModelChange)="currentPage.set(1)"
              >
                <option value="all">All Types</option>
                @for (type of types(); track type.id) {
                  <option [value]="type.name">{{ type.name }}</option>
                }
              </select>
              <select
                class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                [(ngModel)]="statusFilter"
                (ngModelChange)="currentPage.set(1)"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <div class="flex items-center text-sm text-muted-foreground">
                Showing {{ filtered().length }} of {{ announcements().length }} announcements
              </div>
            </div>

            @if (announcements().length === 0) {
              <div
                class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 p-10 text-center"
              >
                <lucide-angular
                  [img]="icons.AlertTriangle"
                  class="size-8 text-muted-foreground"
                ></lucide-angular>
                <div>
                  <p class="font-medium">No announcements created</p>
                  <p class="text-sm text-muted-foreground">
                    Create announcements to appear in the marquee display.
                  </p>
                </div>
                <button uiBtn size="sm" (click)="openAnnouncementDialog()">
                  <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
                  Create Announcement
                </button>
              </div>
            } @else {
              <div class="overflow-auto">
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="border-b">
                      <th class="h-11 px-4 font-medium text-muted-foreground">Message</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Type</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Active</th>
                      <th class="h-11 px-4 font-medium text-muted-foreground">Created</th>
                      <th class="h-11 w-[140px] px-4 text-right font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (announcement of pageRows(); track announcement.id) {
                      <tr class="border-t hover:bg-muted/40">
                        <td class="px-4 py-3">
                          <p class="font-medium text-foreground">{{ announcement.text }}</p>
                        </td>
                        <td class="px-4 py-3">
                          @if (resolveType(announcement.type); as type) {
                            <span
                              class="inline-flex min-w-[4rem] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase"
                              [style.backgroundColor]="type.backgroundColor"
                              [style.color]="type.textColor"
                              >{{ type.name }}</span
                            >
                          } @else {
                            <span class="text-sm text-muted-foreground">No type</span>
                          }
                        </td>
                        <td class="px-4 py-3">
                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                              [class.bg-primary]="announcement.isActive"
                              [class.bg-input]="!announcement.isActive"
                              [attr.aria-checked]="announcement.isActive"
                              (click)="toggleActive(announcement)"
                            >
                              <span
                                class="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                                [class.translate-x-4]="announcement.isActive"
                              ></span>
                            </button>
                            <span class="text-xs text-muted-foreground">{{
                              announcement.isActive ? 'Active' : 'Hidden'
                            }}</span>
                          </div>
                        </td>
                        <td class="px-4 py-3">{{ formatDate(announcement.createdAt) }}</td>
                        <td class="px-4 py-3 text-right">
                          <div class="inline-flex items-center gap-1">
                            <button
                              uiBtn
                              size="icon"
                              variant="ghost"
                              extraClass="text-primary"
                              (click)="openAnnouncementDialog(announcement)"
                            >
                              <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                            </button>
                            <button
                              uiBtn
                              size="icon"
                              variant="ghost"
                              extraClass="text-red-600"
                              (click)="confirmDeleteAnnouncement.set(announcement)"
                            >
                              <lucide-angular [img]="icons.Trash2" class="size-4"></lucide-angular>
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (totalPages() > 1) {
                <div class="mt-4 flex items-center justify-between border-t px-1 pt-3 text-sm">
                  <span class="text-muted-foreground"
                    >Page {{ currentPage() }} of {{ totalPages() }}</span
                  >
                  <div class="flex gap-2">
                    <button
                      uiBtn
                      variant="outline"
                      size="sm"
                      [disabled]="currentPage() <= 1"
                      (click)="currentPage.update((p) => p - 1)"
                    >
                      Previous
                    </button>
                    <button
                      uiBtn
                      variant="outline"
                      size="sm"
                      [disabled]="currentPage() >= totalPages()"
                      (click)="currentPage.update((p) => p + 1)"
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

      @if (typeDialogOpen()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeTypeDialog()"
        >
          <div
            class="glass w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <div class="mb-4 flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  {{ editingType() ? 'Edit Announcement Type' : 'New Announcement Type' }}
                </h3>
                <p class="mt-1 text-sm text-muted-foreground">
                  Configure the label and colors used for this announcement type.
                </p>
              </div>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeTypeDialog()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="space-y-4">
              <label class="grid gap-2 text-sm font-medium">
                Type Name
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  [(ngModel)]="typeForm.name"
                  placeholder="e.g., Alert, Info, Reminder"
                />
              </label>
              <div class="grid grid-cols-2 gap-4">
                <label class="grid gap-2 text-sm font-medium">
                  Background Color
                  <input
                    class="h-10 cursor-pointer rounded-md border border-input bg-background"
                    type="color"
                    [(ngModel)]="typeForm.backgroundColor"
                  />
                </label>
                <label class="grid gap-2 text-sm font-medium">
                  Text Color
                  <input
                    class="h-10 cursor-pointer rounded-md border border-input bg-background"
                    type="color"
                    [(ngModel)]="typeForm.textColor"
                  />
                </label>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-muted-foreground">Preview</span>
                <span
                  class="inline-flex min-w-[4rem] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                  [style.backgroundColor]="typeForm.backgroundColor"
                  [style.color]="typeForm.textColor"
                  >{{ typeForm.name || 'Sample' }}</span
                >
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button uiBtn type="button" variant="outline" (click)="closeTypeDialog()">
                  Cancel
                </button>
                <button uiBtn type="button" [disabled]="savingType()" (click)="saveType()">
                  {{ savingType() ? 'Saving...' : editingType() ? 'Update' : 'Create' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      @if (announcementDialogOpen()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeAnnouncementDialog()"
        >
          <div
            class="glass w-full max-w-xl rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <div class="mb-4 flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  {{ editingAnnouncement() ? 'Edit Announcement' : 'New Announcement' }}
                </h3>
                <p class="mt-1 text-sm text-muted-foreground">
                  Control the message shown in the marquee display.
                </p>
              </div>
              <button
                uiBtn
                type="button"
                variant="ghost"
                size="icon"
                (click)="closeAnnouncementDialog()"
              >
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="space-y-4">
              <label class="grid gap-2 text-sm font-medium">
                Message
                <textarea
                  class="min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  rows="4"
                  [(ngModel)]="announcementForm.text"
                  placeholder="Enter the announcement message..."
                ></textarea>
              </label>
              <div class="grid gap-4 md:grid-cols-2">
                <label class="grid gap-2 text-sm font-medium">
                  Type (optional)
                  <select
                    class="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    [(ngModel)]="announcementForm.type"
                  >
                    <option value="">No type</option>
                    @for (type of types(); track type.id) {
                      <option [value]="type.id">{{ type.name }}</option>
                    }
                  </select>
                </label>
                <div class="grid gap-2 text-sm font-medium">
                  Status
                  <div
                    class="flex h-10 items-center justify-between rounded-md border border-input px-3"
                  >
                    <span class="text-sm font-normal text-muted-foreground">{{
                      announcementForm.isActive ? 'Active' : 'Hidden'
                    }}</span>
                    <button
                      type="button"
                      role="switch"
                      class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                      [class.bg-primary]="announcementForm.isActive"
                      [class.bg-input]="!announcementForm.isActive"
                      [attr.aria-checked]="announcementForm.isActive"
                      (click)="announcementForm.isActive = !announcementForm.isActive"
                    >
                      <span
                        class="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                        [class.translate-x-4]="announcementForm.isActive"
                      ></span>
                    </button>
                  </div>
                </div>
              </div>
              @if (announcementForm.type) {
                <div
                  class="flex items-center gap-3 rounded-md border border-dashed border-muted-foreground/40 p-3"
                >
                  <lucide-angular
                    [img]="icons.CheckCircle2"
                    class="size-5 text-emerald-500"
                  ></lucide-angular>
                  <div class="text-sm">
                    <p class="font-medium">
                      Linked type:
                      {{ resolveType(announcementForm.type)?.name || 'Unknown' }}
                    </p>
                    <p class="text-muted-foreground">
                      This announcement will display with the chosen type badge.
                    </p>
                  </div>
                </div>
              }
              <div class="flex justify-end gap-2 pt-2">
                <button uiBtn type="button" variant="outline" (click)="closeAnnouncementDialog()">
                  Cancel
                </button>
                <button
                  uiBtn
                  type="button"
                  [disabled]="savingAnnouncement()"
                  (click)="saveAnnouncement()"
                >
                  {{
                    savingAnnouncement()
                      ? 'Saving...'
                      : editingAnnouncement()
                        ? 'Update'
                        : 'Create'
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      @if (confirmDeleteType(); as type) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="confirmDeleteType.set(null)"
        >
          <div
            class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <h3 class="text-lg font-semibold">Are you sure?</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              This action cannot be undone. This will permanently delete the announcement type "{{
                type.name
              }}".
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn variant="outline" (click)="confirmDeleteType.set(null)">Cancel</button>
              <button uiBtn variant="destructive" (click)="deleteType(type)">Delete</button>
            </div>
          </div>
        </div>
      }

      @if (confirmDeleteAnnouncement(); as announcement) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="confirmDeleteAnnouncement.set(null)"
        >
          <div
            class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <h3 class="text-lg font-semibold">Are you sure?</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              This action cannot be undone. This will permanently delete the announcement "{{
                truncate(announcement.text)
              }}".
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn variant="outline" (click)="confirmDeleteAnnouncement.set(null)">
                Cancel
              </button>
              <button uiBtn variant="destructive" (click)="deleteAnnouncement(announcement)">
                Delete
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AnnouncementsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = {
    Plus,
    Pencil,
    Trash2,
    Search,
    X,
    RefreshCcw,
    Palette,
    AlertTriangle,
    CheckCircle2,
  };

  readonly types = signal<AnnouncementType[]>([]);
  readonly announcements = signal<Announcement[]>([]);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly savingType = signal(false);
  readonly savingAnnouncement = signal(false);

  readonly typeDialogOpen = signal(false);
  readonly announcementDialogOpen = signal(false);
  readonly editingType = signal<AnnouncementType | null>(null);
  readonly editingAnnouncement = signal<Announcement | null>(null);
  readonly confirmDeleteType = signal<AnnouncementType | null>(null);
  readonly confirmDeleteAnnouncement = signal<Announcement | null>(null);

  readonly currentPage = signal(1);
  readonly itemsPerPage = 10;

  searchQuery = '';
  typeFilter = 'all';
  statusFilter = 'all';

  typeForm = this.emptyTypeForm();
  announcementForm = this.emptyAnnouncementForm();

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    return this.announcements()
      .filter((item) => {
        const matchesSearch = !q || item.text.toLowerCase().includes(q);
        const matchesType =
          this.typeFilter === 'all' ||
          item.type === this.typeFilter ||
          this.resolveType(item.type)?.name === this.typeFilter;
        const matchesStatus =
          this.statusFilter === 'all' ||
          (this.statusFilter === 'active' && item.isActive) ||
          (this.statusFilter === 'inactive' && !item.isActive);
        return matchesSearch && matchesType && matchesStatus;
      })
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.itemsPerPage)),
  );

  readonly pageRows = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.filtered().slice(start, start + this.itemsPerPage);
  });

  async ngOnInit() {
    this.loading.set(true);
    await this.refresh();
    this.loading.set(false);
  }

  emptyTypeForm() {
    return {
      name: '',
      backgroundColor: '#0e4480',
      textColor: '#ffffff',
    };
  }

  emptyAnnouncementForm() {
    return {
      text: '',
      type: '',
      isActive: true,
    };
  }

  formatDate(isoDate?: string) {
    if (!isoDate) return '-';
    return (
      formatInEat(isoDate, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }) || '-'
    );
  }

  truncate(text: string) {
    return text.length > 50 ? `${text.substring(0, 50)}...` : text;
  }

  resolveType(value: string | null | undefined): AnnouncementType | null {
    if (!value) return null;
    return (
      this.types().find((t) => t.name === value || t.id === value) ?? null
    );
  }

  async fetchTypes() {
    try {
      const data = await this.api.get<AnnouncementType[]>('/api/bank/announcement-types');
      this.types.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Unable to load announcement types');
    }
  }

  async fetchAnnouncements() {
    try {
      const data = await this.api.get<Announcement[]>('/api/bank/announcements');
      this.announcements.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Unable to load announcements');
    }
  }

  async refresh() {
    this.refreshing.set(true);
    await Promise.all([this.fetchTypes(), this.fetchAnnouncements()]);
    this.refreshing.set(false);
  }

  openTypeDialog(type?: AnnouncementType | null) {
    if (type) {
      this.editingType.set(type);
      this.typeForm = {
        name: type.name,
        backgroundColor: type.backgroundColor || '#0e4480',
        textColor: type.textColor || '#ffffff',
      };
    } else {
      this.editingType.set(null);
      this.typeForm = this.emptyTypeForm();
    }
    this.typeDialogOpen.set(true);
  }

  closeTypeDialog() {
    this.typeDialogOpen.set(false);
    this.editingType.set(null);
    this.typeForm = this.emptyTypeForm();
  }

  openAnnouncementDialog(announcement?: Announcement | null) {
    if (announcement) {
      this.editingAnnouncement.set(announcement);
      const resolved = this.resolveType(announcement.type);
      this.announcementForm = {
        text: announcement.text,
        type: resolved?.id || announcement.type || '',
        isActive: announcement.isActive,
      };
    } else {
      this.editingAnnouncement.set(null);
      this.announcementForm = this.emptyAnnouncementForm();
    }
    this.announcementDialogOpen.set(true);
  }

  closeAnnouncementDialog() {
    this.announcementDialogOpen.set(false);
    this.editingAnnouncement.set(null);
    this.announcementForm = this.emptyAnnouncementForm();
  }

  async saveType() {
    if (!this.typeForm.name.trim()) {
      this.toast.error('Type name is required');
      return;
    }
    this.savingType.set(true);
    try {
      const payload = {
        name: this.typeForm.name.trim(),
        backgroundColor: this.typeForm.backgroundColor,
        textColor: this.typeForm.textColor,
      };
      const editing = this.editingType();
      if (editing) {
        await this.api.put(`/api/bank/announcement-types/${editing.id}`, payload);
        this.toast.success('Announcement type updated');
      } else {
        await this.api.post('/api/bank/announcement-types', payload);
        this.toast.success('Announcement type created');
      }
      this.closeTypeDialog();
      await this.fetchTypes();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error ||
        'Failed to save announcement type';
      this.toast.error(message);
    } finally {
      this.savingType.set(false);
    }
  }

  async deleteType(type: AnnouncementType) {
    try {
      await this.api.delete(`/api/bank/announcement-types/${type.id}`);
      this.toast.success('Announcement type deleted');
      this.confirmDeleteType.set(null);
      await this.refresh();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error || 'Failed to delete type';
      this.toast.error(message);
    }
  }

  async saveAnnouncement() {
    if (!this.announcementForm.text.trim()) {
      this.toast.error('Announcement text is required');
      return;
    }
    this.savingAnnouncement.set(true);
    try {
      const payload = {
        text: this.announcementForm.text.trim(),
        type: this.announcementForm.type || null,
        isActive: this.announcementForm.isActive,
      };
      const editing = this.editingAnnouncement();
      if (editing) {
        await this.api.put(`/api/bank/announcements/${editing.id}`, payload);
        this.toast.success('Announcement updated');
      } else {
        await this.api.post('/api/bank/announcements', payload);
        this.toast.success('Announcement created');
      }
      this.closeAnnouncementDialog();
      await this.fetchAnnouncements();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error || 'Failed to save announcement';
      this.toast.error(message);
    } finally {
      this.savingAnnouncement.set(false);
    }
  }

  async deleteAnnouncement(announcement: Announcement) {
    try {
      await this.api.delete(`/api/bank/announcements/${announcement.id}`);
      this.toast.success('Announcement deleted');
      this.confirmDeleteAnnouncement.set(null);
      await this.fetchAnnouncements();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error ||
        'Failed to delete announcement';
      this.toast.error(message);
    }
  }

  async toggleActive(announcement: Announcement) {
    const nextValue = !announcement.isActive;
    try {
      await this.api.put(`/api/bank/announcements/${announcement.id}`, {
        text: announcement.text,
        type: announcement.type || null,
        isActive: nextValue,
      });
      this.announcements.update((prev) =>
        prev.map((item) =>
          item.id === announcement.id ? { ...item, isActive: nextValue } : item,
        ),
      );
    } catch {
      this.toast.error('Unable to update announcement status');
    }
  }
}
