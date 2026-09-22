import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertTriangle,
  Building2,
  LucideAngularModule,
  Pencil,
  Plus,
  Search,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Youtube,
} from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { eatNow, formatInEat, toEatDatetimeLocalValue } from '../../core/timezone';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
  UiQueueSpinner,
} from '../../shared/ui/ui';
import {
  DashboardAdCarouselComponent,
  type DashboardAd,
  type DashboardBranch,
} from './ad-carousel.component';

const EXPIRED_AD_RETENTION_DAYS = 30;
const ITEMS_PER_PAGE = 9;
const YOUTUBE_RE = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;

type Ad = DashboardAd & {
  validFrom?: string | null;
  validUntil?: string | null;
  createdAt?: string | null;
  isLive?: boolean;
};

type AdStatus = 'active' | 'expired' | 'scheduled';

@Component({
  selector: 'app-ads',
  imports: [
    FormsModule,
    LucideAngularModule,
    UiButton,
    UiCard,
    UiCardContent,
    UiCardHeader,
    UiCardTitle,
    UiQueueSpinner,
    DashboardAdCarouselComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl font-bold tracking-tight">Display Ads</h2>
        <div class="flex items-center gap-3">
          <button
            uiBtn
            variant="outline"
            size="icon"
            type="button"
            [attr.title]="enableAudio() ? 'Mute audio' : 'Enable audio'"
            (click)="enableAudio.set(!enableAudio())"
          >
            <lucide-angular
              [img]="enableAudio() ? icons.Volume2 : icons.VolumeX"
              class="size-4"
            ></lucide-angular>
          </button>
          <button uiBtn type="button" (click)="openCreate()">
            <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
            Add Advertisement
          </button>
        </div>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16">
          <ui-queue-spinner size="lg" />
        </div>
      } @else {
        @if (hasExpiredAds()) {
          <div
            class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <lucide-angular [img]="icons.AlertTriangle" class="mt-0.5 size-4 shrink-0"></lucide-angular>
            <p>
              Expired ads are shown below and kept for
              {{ retentionDays }} days after expiry, then removed automatically.
            </p>
          </div>
        }

        <app-dashboard-ad-carousel
          [ads]="previewAds()"
          [branches]="branches()"
          [enableAudio]="enableAudio()"
        />

        <ui-card>
          <ui-card-content class="grid grid-cols-1 gap-4 py-6 md:grid-cols-4">
            <label class="relative md:col-span-1">
              <span
                class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
              >
                <lucide-angular
                  [img]="icons.Search"
                  class="size-4 text-muted-foreground"
                ></lucide-angular>
              </span>
              <input
                class="h-9 w-full rounded-md border border-input bg-background pl-10 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="Search ads..."
                [(ngModel)]="searchQuery"
                (ngModelChange)="currentPage.set(1)"
                name="search"
              />
              @if (searchQuery) {
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  (click)="searchQuery = ''; currentPage.set(1)"
                >
                  <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
                </button>
              }
            </label>
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              [(ngModel)]="branchFilter"
              (ngModelChange)="currentPage.set(1)"
              name="branchFilter"
            >
              <option value="all">All branches</option>
              @for (branch of branches(); track branch.id) {
                <option [value]="branch.id">{{ branch.name }}</option>
              }
            </select>
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              [(ngModel)]="statusFilter"
              (ngModelChange)="currentPage.set(1)"
              name="statusFilter"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
            </select>
            <div class="flex items-center text-sm text-muted-foreground">
              Showing {{ pageRows().length }} of {{ filtered().length }} ads
            </div>
          </ui-card-content>
        </ui-card>

        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          @for (ad of pageRows(); track ad.id) {
            <ui-card>
              <ui-card-header class="flex flex-row items-center justify-between space-y-0 pb-2">
                <ui-card-title class="truncate text-sm font-medium">{{ ad.name }}</ui-card-title>
                <div class="flex items-center gap-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    [class]="statusClass(ad)"
                  >
                    {{ statusLabel(ad) }}
                  </span>
                  <button uiBtn variant="outline" size="icon" type="button" (click)="openEdit(ad)">
                    <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                  </button>
                  <button uiBtn variant="destructive" size="icon" type="button" (click)="remove(ad)">
                    <lucide-angular [img]="icons.Trash2" class="size-4"></lucide-angular>
                  </button>
                </div>
              </ui-card-header>
              <ui-card-content>
                <div class="relative aspect-video overflow-hidden rounded-lg bg-muted">
                  @if (ad.youtubeUrl) {
                    <div class="flex h-full w-full flex-col items-center justify-center gap-2 bg-red-600/10 text-red-700">
                      <lucide-angular [img]="icons.Youtube" class="size-10"></lucide-angular>
                      @if (ad.isLive) {
                        <span class="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white"
                          >LIVE</span
                        >
                      }
                    </div>
                  } @else if (ad.video) {
                    <video
                      [src]="ad.video"
                      class="h-full w-full object-cover"
                      muted
                      autoplay
                      loop
                      playsinline
                      (loadeddata)="$any($event.target).muted = true; $any($event.target).volume = 0"
                    ></video>
                  } @else if (ad.image) {
                    <img [src]="ad.image" [alt]="ad.name" class="h-full w-full object-cover" />
                  }
                </div>
                <div class="mt-4 space-y-1 text-sm text-muted-foreground">
                  @if (ad.createdAt) {
                    <p>Added {{ formatDate(ad.createdAt) }}</p>
                  }
                  @if (ad.validFrom) {
                    <p>Valid from {{ formatDate(ad.validFrom) }}</p>
                  }
                  @if (ad.validUntil) {
                    <p>Valid until {{ formatDate(ad.validUntil) }}</p>
                  }
                  @if (ad.youtubeUrl) {
                    <p class="truncate">YouTube: {{ ad.youtubeUrl }}</p>
                  }
                  <div class="flex flex-wrap gap-1 pt-1">
                    @for (name of branchNames(ad); track name) {
                      <span
                        class="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary"
                      >
                        <lucide-angular [img]="icons.Building2" class="size-3"></lucide-angular>
                        {{ name }}
                      </span>
                    }
                  </div>
                </div>
              </ui-card-content>
            </ui-card>
          } @empty {
            <p class="col-span-full text-center text-sm text-muted-foreground">No ads found.</p>
          }
        </div>

        @if (totalPages() > 1) {
          <div class="mt-2 flex items-center justify-center gap-2">
            <button
              uiBtn
              variant="outline"
              size="sm"
              type="button"
              [disabled]="currentPage() <= 1"
              (click)="currentPage.set(currentPage() - 1)"
            >
              Previous
            </button>
            <span class="text-sm text-muted-foreground">
              Page {{ currentPage() }} of {{ totalPages() }}
            </span>
            <button
              uiBtn
              variant="outline"
              size="sm"
              type="button"
              [disabled]="currentPage() >= totalPages()"
              (click)="currentPage.set(currentPage() + 1)"
            >
              Next
            </button>
          </div>
        }
      }

      @if (dialogOpen()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeDialog()"
        >
          <div
            class="max-h-[90vh] w-full max-w-[425px] overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ editing() ? 'Edit Advertisement' : 'Add New Advertisement' }}
              </h3>
              <button type="button" class="rounded-md p-1 hover:bg-muted" (click)="closeDialog()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <form class="space-y-4" (ngSubmit)="save()">
              <label class="grid gap-2 text-sm font-medium">
                Ad Name
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="name"
                  [(ngModel)]="form.name"
                  required
                />
              </label>
              <div class="grid gap-2 text-sm font-medium">
                Select Branches
                <div class="max-h-32 space-y-2 overflow-y-auto rounded-md border p-2">
                  @for (branch of branches(); track branch.id) {
                    <label class="flex items-center gap-2 text-sm font-normal">
                      <input
                        type="checkbox"
                        [checked]="selectedBranches().includes(branch.id)"
                        (change)="toggleBranch(branch.id)"
                      />
                      {{ branch.name }}
                    </label>
                  }
                </div>
                @if (!selectedBranches().length) {
                  <p class="text-xs text-destructive">Select at least one branch</p>
                }
              </div>

              @if (!editing()) {
                <div class="grid gap-2 text-sm font-medium">
                  Media type
                  <div class="flex gap-4 font-normal">
                    <label class="flex items-center gap-2">
                      <input type="radio" name="mediaType" value="file" [(ngModel)]="mediaType" />
                      File
                    </label>
                    <label class="flex items-center gap-2">
                      <input
                        type="radio"
                        name="mediaType"
                        value="youtube"
                        [(ngModel)]="mediaType"
                      />
                      YouTube
                    </label>
                  </div>
                </div>
                @if (mediaType === 'file') {
                  <label class="grid gap-2 text-sm font-medium">
                    Image or video
                    <input
                      class="text-sm"
                      type="file"
                      accept="image/*,video/*"
                      (change)="onFile($event)"
                      required
                    />
                  </label>
                } @else {
                  <label class="grid gap-2 text-sm font-medium">
                    YouTube URL
                    <input
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      name="youtubeUrl"
                      [(ngModel)]="form.youtubeUrl"
                      required
                    />
                  </label>
                  <label class="flex items-center gap-2 text-sm font-normal">
                    <input type="checkbox" [(ngModel)]="form.isLive" name="isLive" />
                    Live stream
                  </label>
                }
              } @else {
                <div class="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  @if (editing()?.youtubeUrl) {
                    Current media: YouTube
                  } @else if (editing()?.video) {
                    Current media: Video (cannot change)
                  } @else {
                    Current media: Image (cannot change)
                  }
                </div>
                @if (editing()?.youtubeUrl) {
                  <label class="grid gap-2 text-sm font-medium">
                    YouTube URL
                    <input
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      name="youtubeUrl"
                      [(ngModel)]="form.youtubeUrl"
                      placeholder="Leave blank to keep current"
                    />
                  </label>
                  <label class="flex items-center gap-2 text-sm font-normal">
                    <input type="checkbox" [(ngModel)]="form.isLive" name="isLive" />
                    Live stream
                  </label>
                }
              }

              <label class="grid gap-2 text-sm font-medium">
                Valid from
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  type="datetime-local"
                  name="validFrom"
                  [(ngModel)]="form.validFrom"
                />
              </label>
              <label class="grid gap-2 text-sm font-medium">
                Valid until
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  type="datetime-local"
                  name="validUntil"
                  [(ngModel)]="form.validUntil"
                />
              </label>

              <div class="flex justify-end gap-2 pt-2">
                <button uiBtn variant="outline" type="button" (click)="closeDialog()">Cancel</button>
                <button uiBtn type="submit" [disabled]="!selectedBranches().length || saving()">
                  {{ editing() ? 'Update' : 'Create' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = {
    Plus,
    Search,
    X,
    Pencil,
    Trash2,
    Volume2,
    VolumeX,
    AlertTriangle,
    Building2,
    Youtube,
  };
  readonly retentionDays = EXPIRED_AD_RETENTION_DAYS;

  readonly ads = signal<Ad[]>([]);
  readonly branches = signal<DashboardBranch[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dialogOpen = signal(false);
  readonly editing = signal<Ad | null>(null);
  readonly enableAudio = signal(false);
  readonly selectedBranches = signal<string[]>([]);
  readonly currentPage = signal(1);

  searchQuery = '';
  branchFilter = 'all';
  statusFilter = 'all';
  mediaType: 'file' | 'youtube' = 'file';
  mediaFile: File | null = null;
  form = { name: '', youtubeUrl: '', isLive: false, validFrom: '', validUntil: '' };

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    return this.ads().filter((ad) => {
      const matchesSearch = !q || (ad.name ?? '').toLowerCase().includes(q);
      const matchesBranch =
        this.branchFilter === 'all' ||
        (Array.isArray(ad.branchIds) && ad.branchIds.includes(this.branchFilter));
      const status = this.getAdStatus(ad);
      const matchesStatus = this.statusFilter === 'all' || status === this.statusFilter;
      return matchesSearch && matchesBranch && matchesStatus;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / ITEMS_PER_PAGE)),
  );

  readonly pageRows = computed(() => {
    const start = (this.currentPage() - 1) * ITEMS_PER_PAGE;
    return this.filtered().slice(start, start + ITEMS_PER_PAGE);
  });

  readonly hasExpiredAds = computed(() => this.ads().some((ad) => this.getAdStatus(ad) === 'expired'));

  readonly previewAds = computed(() =>
    this.ads().filter((ad) => this.getAdStatus(ad) !== 'expired'),
  );

  async ngOnInit() {
    await Promise.all([this.reload(), this.loadBranches()]);
  }

  async reload() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Ad[]>('/api/bank/ads', { includeAll: 'true' });
      this.ads.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Failed to fetch ads');
    } finally {
      this.loading.set(false);
    }
  }

  async loadBranches() {
    try {
      const data = await this.api.get<DashboardBranch[]>('/api/bank/branches');
      this.branches.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Failed to fetch branches');
    }
  }

  getAdStatus(ad: Ad): AdStatus {
    const now = eatNow();
    const validFrom = ad.validFrom ? new Date(ad.validFrom) : null;
    const validUntil = ad.validUntil ? new Date(ad.validUntil) : null;
    if (validUntil && validUntil < now) return 'expired';
    if (validFrom && validFrom > now) return 'scheduled';
    return 'active';
  }

  statusLabel(ad: Ad) {
    const s = this.getAdStatus(ad);
    return s === 'active' ? 'Active' : s === 'expired' ? 'Expired' : 'Scheduled';
  }

  statusClass(ad: Ad) {
    const s = this.getAdStatus(ad);
    if (s === 'active') return 'bg-green-100 text-green-800';
    if (s === 'expired') return 'bg-red-100 text-red-800';
    return 'bg-primary/10 text-primary';
  }

  branchNames(ad: Ad) {
    return (ad.branchIds ?? [])
      .map((id) => this.branches().find((b) => b.id === id)?.name ?? '')
      .filter(Boolean);
  }

  formatDate(value: string) {
    return formatInEat(value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  openCreate() {
    this.editing.set(null);
    this.selectedBranches.set([]);
    this.mediaType = 'file';
    this.mediaFile = null;
    this.form = { name: '', youtubeUrl: '', isLive: false, validFrom: '', validUntil: '' };
    this.dialogOpen.set(true);
  }

  openEdit(ad: Ad) {
    this.editing.set(ad);
    this.selectedBranches.set([...(ad.branchIds ?? [])]);
    this.mediaFile = null;
    this.form = {
      name: ad.name || '',
      youtubeUrl: ad.youtubeUrl || '',
      isLive: Boolean(ad.isLive),
      validFrom: toEatDatetimeLocalValue(ad.validFrom),
      validUntil: toEatDatetimeLocalValue(ad.validUntil),
    };
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
    this.editing.set(null);
  }

  toggleBranch(id: string) {
    const cur = this.selectedBranches();
    this.selectedBranches.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.mediaFile = input.files?.[0] ?? null;
  }

  async save() {
    if (!this.selectedBranches().length) return;
    const editing = this.editing();
    if (!editing) {
      if (this.mediaType === 'youtube') {
        if (!YOUTUBE_RE.test(this.form.youtubeUrl.trim())) {
          this.toast.error('Invalid YouTube URL format');
          return;
        }
      } else if (!this.mediaFile) {
        this.toast.error('Image or video is required');
        return;
      }
    }

    const fd = new FormData();
    fd.append('name', this.form.name.trim());
    fd.append('branchIds', JSON.stringify(this.selectedBranches()));
    fd.append('isLive', String(this.form.isLive));
    if (this.form.validFrom) fd.append('validFrom', this.form.validFrom);
    if (this.form.validUntil) fd.append('validUntil', this.form.validUntil);

    if (!editing) {
      if (this.mediaType === 'file' && this.mediaFile) {
        if (this.mediaFile.type.startsWith('image/')) fd.append('image', this.mediaFile);
        else if (this.mediaFile.type.startsWith('video/')) fd.append('video', this.mediaFile);
        else {
          this.toast.error('Unsupported file type');
          return;
        }
      } else if (this.mediaType === 'youtube') {
        fd.append('youtubeUrl', this.form.youtubeUrl.trim());
      }
    } else if (editing.youtubeUrl) {
      fd.append('youtubeUrl', this.form.youtubeUrl.trim() || editing.youtubeUrl);
    }

    this.saving.set(true);
    try {
      if (editing) {
        await this.api.put(`/api/bank/ads/${editing.id}`, fd);
        this.toast.success('Advertisement updated successfully!');
        await this.reload();
      } else {
        const created = await this.api.post<Ad>('/api/bank/ads', fd);
        this.ads.set([created, ...this.ads()]);
        this.toast.success('Advertisement created successfully!');
      }
      this.closeDialog();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error ||
        (error instanceof Error ? error.message : 'Unknown error');
      this.toast.error(`Error saving ad: ${message}`);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(ad: Ad) {
    try {
      await this.api.delete(`/api/bank/ads/${ad.id}`);
      this.ads.set(this.ads().filter((a) => a.id !== ad.id));
      this.toast.success('Advertisement deleted successfully!');
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error ||
        (error instanceof Error ? error.message : 'Unknown error');
      this.toast.error(`Error deleting ad: ${message}`);
    }
  }
}
