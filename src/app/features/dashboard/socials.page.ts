import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Facebook,
  Ghost,
  Instagram,
  Link2,
  Linkedin,
  LucideAngularModule,
  MessageCircle,
  Music2,
  Pencil,
  Pin,
  Plus,
  Search,
  Send,
  Share2,
  Trash2,
  X,
  Youtube,
  type LucideIconData,
} from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { XTwitter } from '../../core/social-icons';
import { ToastService } from '../../core/toast.service';
import { UiButton, UiCard, UiCardContent, UiQueueSpinner } from '../../shared/ui/ui';

type SocialMedia = {
  id: string;
  platform: string;
  handle: string;
  createdAt?: string;
};

const SOCIAL_PLATFORMS = [
  'Facebook',
  'X',
  'Instagram',
  'LinkedIn',
  'YouTube',
  'TikTok',
  'WhatsApp',
  'Telegram',
  'Snapchat',
  'Pinterest',
  'Other',
] as const;

type PlatformVisual = { icon: LucideIconData; className: string };

function platformVisual(platform: string): PlatformVisual {
  const p = platform.toLowerCase();
  if (p.includes('facebook')) return { icon: Facebook, className: 'text-[#1877F2]' };
  if (p === 'x' || p.includes('twitter')) return { icon: XTwitter, className: 'text-[#000000]' };
  if (p.includes('instagram')) return { icon: Instagram, className: 'text-[#E4405F]' };
  if (p.includes('linkedin')) return { icon: Linkedin, className: 'text-[#0077B5]' };
  if (p.includes('youtube')) return { icon: Youtube, className: 'text-[#FF0000]' };
  if (p.includes('tiktok')) return { icon: Music2, className: 'text-[#000000]' };
  if (p.includes('whatsapp')) return { icon: MessageCircle, className: 'text-[#25D366]' };
  if (p.includes('telegram')) return { icon: Send, className: 'text-[#0088CC]' };
  if (p.includes('snapchat')) return { icon: Ghost, className: 'text-[#FFFC00]' };
  if (p.includes('pinterest')) return { icon: Pin, className: 'text-[#BD081C]' };
  return { icon: Link2, className: 'text-gray-500' };
}

@Component({
  selector: 'app-socials',
  imports: [FormsModule, LucideAngularModule, UiButton, UiCard, UiCardContent, UiQueueSpinner],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-3xl font-bold tracking-tight">Social Media Management</h1>
        <button uiBtn (click)="openCreate()">
          <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
          Add Social Media
        </button>
      </div>

      <ui-card class="gap-0 py-0">
        <ui-card-content class="py-6">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div class="relative">
              <lucide-angular
                [img]="icons.Search"
                class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
              ></lucide-angular>
              <input
                class="h-9 w-full rounded-md border border-input bg-background pl-10 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="Search social media..."
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
              [(ngModel)]="platformFilter"
              (ngModelChange)="currentPage.set(1)"
            >
              <option value="all">All Platforms</option>
              @for (platform of platforms; track platform) {
                <option [value]="platform">{{ platform }}</option>
              }
            </select>
            <div class="flex items-center text-sm text-muted-foreground">
              Showing {{ filtered().length }} of {{ socials().length }} accounts
            </div>
          </div>
        </ui-card-content>
      </ui-card>

      @if (loading()) {
        <div class="flex h-48 items-center justify-center">
          <ui-queue-spinner size="lg" [dotCount]="12" />
        </div>
      } @else if (socials().length === 0) {
        <ui-card class="flex h-48 flex-col items-center justify-center border-dashed py-0">
          <lucide-angular [img]="icons.Share2" class="mb-4 size-12 text-gray-400"></lucide-angular>
          <p class="text-lg text-gray-500">No social media added</p>
          <p class="text-sm text-gray-400">Add your first social media account to get started</p>
        </ui-card>
      } @else {
        <ui-card class="gap-0 overflow-hidden py-0">
          <div class="overflow-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b">
                  <th class="h-11 px-4 font-medium text-muted-foreground">Platform</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Handle</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (social of pageRows(); track social.id) {
                  <tr class="border-t hover:bg-muted/40">
                    <td class="px-4 py-3 font-medium">
                      <div class="flex items-center gap-2">
                        <lucide-angular
                          [img]="platformIcon(social.platform)"
                          [class]="'size-5 shrink-0 ' + platformIconClass(social.platform)"
                        ></lucide-angular>
                        <span>{{ social.platform }}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ social.handle }}</td>
                    <td class="px-4 py-3">
                      <div class="flex gap-1">
                        <button
                          uiBtn
                          size="icon"
                          variant="ghost"
                          extraClass="text-primary"
                          (click)="openEdit(social)"
                        >
                          <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                        </button>
                        <button
                          uiBtn
                          size="icon"
                          variant="ghost"
                          extraClass="text-red-600"
                          (click)="confirmDelete.set(social)"
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
            <div class="flex items-center justify-between border-t px-4 py-3 text-sm">
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
        </ui-card>
      }

      @if (dialogOpen()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeDialog()"
        >
          <form
            class="glass w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
            (ngSubmit)="save()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ editing() ? 'Edit Social Media' : 'Add New Social Media' }}
              </h3>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeDialog()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="space-y-4">
              <label class="grid gap-2 text-sm font-medium">
                Platform
                <select
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="platform"
                  [(ngModel)]="form.platform"
                  required
                >
                  <option value="" disabled>Select platform</option>
                  @for (platform of platforms; track platform) {
                    <option [value]="platform">{{ platform }}</option>
                  }
                </select>
              </label>
              <label class="grid gap-2 text-sm font-medium">
                Handle/Username
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="handle"
                  [(ngModel)]="form.handle"
                  placeholder="e.g., @username or username"
                  required
                />
              </label>
              <button uiBtn class="w-full" [disabled]="saving()">
                {{ editing() ? 'Update' : 'Create' }} Social Media
              </button>
            </div>
          </form>
        </div>
      }

      @if (confirmDelete(); as social) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="confirmDelete.set(null)"
        >
          <div
            class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <h3 class="text-lg font-semibold">Are you sure?</h3>
            <p class="mt-2 text-sm text-muted-foreground">
              This action cannot be undone. This will permanently delete the
              {{ social.platform }} account "{{ social.handle }}".
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn variant="outline" (click)="confirmDelete.set(null)">Cancel</button>
              <button uiBtn variant="destructive" (click)="remove(social)">Delete</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class SocialsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = {
    Plus,
    Pencil,
    Trash2,
    Search,
    X,
    Share2,
    Facebook,
    Instagram,
    Linkedin,
    Youtube,
    XTwitter,
    Music2,
    MessageCircle,
    Send,
    Ghost,
    Pin,
    Link2,
  };
  readonly platforms = SOCIAL_PLATFORMS;

  readonly socials = signal<SocialMedia[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dialogOpen = signal(false);
  readonly editing = signal<SocialMedia | null>(null);
  readonly confirmDelete = signal<SocialMedia | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = 10;

  searchQuery = '';
  platformFilter = 'all';
  form = this.emptyForm();

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    return this.socials().filter((social) => {
      const matchesSearch =
        !q ||
        social.platform.toLowerCase().includes(q) ||
        social.handle.toLowerCase().includes(q);
      const matchesPlatform =
        this.platformFilter === 'all' ||
        social.platform.toLowerCase() === this.platformFilter.toLowerCase();
      return matchesSearch && matchesPlatform;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.itemsPerPage)),
  );

  readonly pageRows = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.filtered().slice(start, start + this.itemsPerPage);
  });

  async ngOnInit() {
    await this.reload();
  }

  emptyForm() {
    return { platform: '', handle: '' };
  }

  platformIcon(platform: string): LucideIconData {
    return platformVisual(platform).icon;
  }

  platformIconClass(platform: string): string {
    return platformVisual(platform).className;
  }

  async reload() {
    this.loading.set(true);
    try {
      const data = await this.api.get<SocialMedia[]>('/api/bank/social-media');
      this.socials.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Failed to fetch social media');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editing.set(null);
    this.form = this.emptyForm();
    this.dialogOpen.set(true);
  }

  openEdit(social: SocialMedia) {
    this.editing.set(social);
    this.form = {
      platform: social.platform || '',
      handle: social.handle || '',
    };
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
    this.editing.set(null);
    this.form = this.emptyForm();
  }

  async save() {
    if (!this.form.platform.trim() || !this.form.handle.trim()) {
      this.toast.error('Platform and handle are required');
      return;
    }
    this.saving.set(true);
    try {
      const payload = {
        platform: this.form.platform.trim(),
        handle: this.form.handle.trim(),
      };
      const editing = this.editing();
      if (editing) {
        await this.api.put(`/api/bank/social-media/${editing.id}`, payload);
        this.toast.success('Social media updated successfully');
      } else {
        await this.api.post('/api/bank/social-media', payload);
        this.toast.success('Social media created successfully');
      }
      this.closeDialog();
      await this.reload();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error ||
        'Failed to save social media';
      this.toast.error(message);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(social: SocialMedia) {
    try {
      await this.api.delete(`/api/bank/social-media/${social.id}`);
      this.toast.success('Social media deleted successfully');
      this.confirmDelete.set(null);
      await this.reload();
    } catch {
      this.toast.error('Failed to delete social media');
    }
  }
}
