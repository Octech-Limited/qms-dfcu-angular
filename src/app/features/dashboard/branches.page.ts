import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Building2,
  LucideAngularModule,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
  X,
} from 'lucide-angular';
import QRCode from 'qrcode';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { UiButton, UiCard, UiCardContent, UiQueueSpinner } from '../../shared/ui/ui';

type Branch = {
  id: string;
  name: string;
  address: string;
  kioskUsername?: string | null;
  kioskPassword?: string | null;
  kioskIpAddress?: string | null;
  platform?: 'Windows' | 'Linux' | string | null;
  hallDisplayUsername?: string | null;
  hallDisplayPassword?: string | null;
  status: boolean;
};

@Component({
  selector: 'app-branches',
  imports: [FormsModule, LucideAngularModule, UiButton, UiCard, UiCardContent, UiQueueSpinner],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-3xl font-bold tracking-tight">Branch Management</h1>
        <button uiBtn (click)="openCreate()">
          <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
          Add Branch
        </button>
      </div>

      <ui-card class="gap-0 py-0">
        <ui-card-content class="py-6">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div class="relative">
              <lucide-angular
                [img]="icons.Search"
                class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
              ></lucide-angular>
              <input
                class="h-9 w-full rounded-md border border-input bg-background pl-10 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder="Search branches..."
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
              <option value="Windows">Windows</option>
              <option value="Linux">Linux</option>
            </select>
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              [(ngModel)]="hasQmsFilter"
              (ngModelChange)="currentPage.set(1)"
            >
              <option value="all">All QMS Status</option>
              <option value="yes">Has QMS</option>
              <option value="no">No QMS</option>
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
              Showing {{ filtered().length }} of {{ branches().length }} branches
            </div>
          </div>
        </ui-card-content>
      </ui-card>

      @if (loading()) {
        <div class="flex h-48 items-center justify-center">
          <ui-queue-spinner size="lg" [dotCount]="12" />
        </div>
      } @else if (branches().length === 0) {
        <ui-card class="flex h-48 flex-col items-center justify-center border-dashed py-0">
          <lucide-angular [img]="icons.Building2" class="mb-4 size-12 text-gray-400"></lucide-angular>
          <p class="text-lg text-gray-500">No branches available</p>
          <p class="text-sm text-gray-400">Add your first branch to get started</p>
        </ui-card>
      } @else {
        <ui-card class="gap-0 overflow-hidden py-0">
          <div class="overflow-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b">
                  <th class="h-11 px-4 font-medium text-muted-foreground">Name</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Address</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Kiosk Username</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Display Username</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Status</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (branch of pageRows(); track branch.id) {
                  <tr class="border-t hover:bg-muted/40">
                    <td class="px-4 py-3 font-medium">{{ branch.name }}</td>
                    <td class="px-4 py-3">{{ branch.address }}</td>
                    <td class="px-4 py-3">
                      {{ branch.kioskUsername ? branch.kioskUsername : 'No QMS' }}
                    </td>
                    <td class="px-4 py-3">{{ branch.hallDisplayUsername || '—' }}</td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                          [class.bg-primary]="branch.status"
                          [class.bg-input]="!branch.status"
                          [attr.aria-checked]="branch.status"
                          (click)="toggleStatus(branch)"
                        >
                          <span
                            class="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                            [class.translate-x-4]="branch.status"
                          ></span>
                        </button>
                        <span
                          class="text-sm"
                          [class.text-green-600]="branch.status"
                          [class.text-gray-500]="!branch.status"
                          >{{ branch.status ? 'Active' : 'Inactive' }}</span
                        >
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex gap-1">
                        <button
                          uiBtn
                          size="icon"
                          variant="ghost"
                          extraClass="text-primary"
                          (click)="openEdit(branch)"
                        >
                          <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                        </button>
                        @if (branch.kioskUsername) {
                          <button
                            uiBtn
                            size="icon"
                            variant="ghost"
                            extraClass="text-green-600"
                            title="Download QR Code"
                            (click)="downloadQr(branch)"
                          >
                            <lucide-angular [img]="icons.QrCode" class="size-4"></lucide-angular>
                          </button>
                        }
                        <button
                          uiBtn
                          size="icon"
                          variant="ghost"
                          extraClass="text-red-600"
                          (click)="confirmDelete.set(branch)"
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
            class="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
            (ngSubmit)="save()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ editing() ? 'Edit Branch' : 'Add New Branch' }}
              </h3>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeDialog()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="space-y-4">
              <label class="grid gap-2 text-sm font-medium">
                Branch Name
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="name"
                  [(ngModel)]="form.name"
                  required
                />
              </label>
              <label class="grid gap-2 text-sm font-medium">
                Address
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="address"
                  [(ngModel)]="form.address"
                  required
                />
              </label>
              <div class="grid grid-cols-2 gap-4">
                <label class="grid gap-2 text-sm font-medium">
                  Hall Display Username
                  <input
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    name="hallDisplayUsername"
                    [(ngModel)]="form.hallDisplayUsername"
                    required
                  />
                </label>
                <label class="grid gap-2 text-sm font-medium">
                  Hall Display Password
                  <input
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    type="password"
                    name="hallDisplayPassword"
                    [(ngModel)]="form.hallDisplayPassword"
                    placeholder="Enter password"
                  />
                  <span class="text-xs font-normal text-muted-foreground">
                    Minimum 8 characters with uppercase, lowercase, number, and special character.
                  </span>
                </label>
              </div>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <button
                  type="button"
                  role="switch"
                  class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                  [class.bg-primary]="hasQms()"
                  [class.bg-input]="!hasQms()"
                  [attr.aria-checked]="hasQms()"
                  (click)="hasQms.update((v) => !v)"
                >
                  <span
                    class="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                    [class.translate-x-4]="hasQms()"
                  ></span>
                </button>
                Has QMS
              </label>
              @if (hasQms()) {
                <div class="grid grid-cols-2 gap-4">
                  <label class="grid gap-2 text-sm font-medium">
                    Kiosk Username
                    <input
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      name="kioskUsername"
                      [(ngModel)]="form.kioskUsername"
                      required
                    />
                  </label>
                  <label class="grid gap-2 text-sm font-medium">
                    Kiosk Password
                    <input
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      type="password"
                      name="kioskPassword"
                      [(ngModel)]="form.kioskPassword"
                      placeholder="Enter password"
                    />
                  </label>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <label class="grid gap-2 text-sm font-medium">
                    Kiosk IP Address
                    <input
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      name="kioskIpAddress"
                      [(ngModel)]="form.kioskIpAddress"
                      placeholder="e.g., 192.168.1.7"
                    />
                  </label>
                  <label class="grid gap-2 text-sm font-medium">
                    Platform
                    <select
                      class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      name="platform"
                      [(ngModel)]="form.platform"
                    >
                      <option value="Windows">Windows</option>
                      <option value="Linux">Linux</option>
                    </select>
                  </label>
                </div>
              }
              <button uiBtn class="w-full">
                {{ editing() ? 'Update' : 'Create' }} Branch
              </button>
            </div>
          </form>
        </div>
      }

      @if (confirmDelete(); as branch) {
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
              This action cannot be undone. This will permanently delete the branch "{{
                branch.name
              }}".
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn variant="outline" (click)="confirmDelete.set(null)">Cancel</button>
              <button uiBtn variant="destructive" (click)="remove(branch)">Delete</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class BranchesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Plus, Search, X, Pencil, Trash2, QrCode, Building2 };
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly dialogOpen = signal(false);
  readonly editing = signal<Branch | null>(null);
  readonly hasQms = signal(false);
  readonly confirmDelete = signal<Branch | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = 10;

  searchQuery = '';
  platformFilter = 'all';
  hasQmsFilter = 'all';
  statusFilter = 'all';

  form = this.emptyForm();

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    return this.branches().filter((branch) => {
      const matchesSearch =
        !q ||
        branch.name.toLowerCase().includes(q) ||
        branch.address?.toLowerCase().includes(q) ||
        branch.hallDisplayUsername?.toLowerCase().includes(q);
      const matchesPlatform =
        this.platformFilter === 'all' || branch.platform === this.platformFilter;
      const matchesQms =
        this.hasQmsFilter === 'all' ||
        (this.hasQmsFilter === 'yes' && !!branch.kioskUsername) ||
        (this.hasQmsFilter === 'no' && !branch.kioskUsername);
      const matchesStatus =
        this.statusFilter === 'all' ||
        (this.statusFilter === 'active' && branch.status) ||
        (this.statusFilter === 'inactive' && !branch.status);
      return matchesSearch && matchesPlatform && matchesQms && matchesStatus;
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
    return {
      name: '',
      address: '',
      hallDisplayUsername: '',
      hallDisplayPassword: '',
      kioskUsername: '',
      kioskPassword: '',
      kioskIpAddress: '',
      platform: 'Windows' as string,
    };
  }

  async reload() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Branch[]>('/api/bank/branches');
      this.branches.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Failed to fetch branches');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editing.set(null);
    this.hasQms.set(false);
    this.form = this.emptyForm();
    this.dialogOpen.set(true);
  }

  openEdit(branch: Branch) {
    this.editing.set(branch);
    this.hasQms.set(!!branch.kioskUsername);
    this.form = {
      name: branch.name || '',
      address: branch.address || '',
      hallDisplayUsername: branch.hallDisplayUsername || '',
      hallDisplayPassword: '',
      kioskUsername: branch.kioskUsername || '',
      kioskPassword: '',
      kioskIpAddress: branch.kioskIpAddress || '',
      platform: branch.platform || 'Windows',
    };
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
    this.editing.set(null);
    this.hasQms.set(false);
  }

  payload() {
    const body: Record<string, unknown> = {
      name: this.form.name,
      address: this.form.address,
      hallDisplayUsername: this.form.hallDisplayUsername,
    };
    if (this.form.hallDisplayPassword.trim()) {
      body['hallDisplayPassword'] = this.form.hallDisplayPassword.trim();
    }
    if (this.hasQms()) {
      body['kioskUsername'] = this.form.kioskUsername;
      body['kioskIpAddress'] = this.form.kioskIpAddress || null;
      body['platform'] = this.form.platform;
      if (this.form.kioskPassword.trim()) body['kioskPassword'] = this.form.kioskPassword.trim();
    } else {
      body['kioskUsername'] = null;
      body['kioskPassword'] = null;
      body['kioskIpAddress'] = null;
      body['platform'] = null;
    }
    return body;
  }

  async save() {
    try {
      const editing = this.editing();
      if (editing) {
        await this.api.put(`/api/bank/branches/${editing.id}`, this.payload());
        this.toast.success('Branch updated successfully');
      } else {
        await this.api.post('/api/bank/branches', this.payload());
        this.toast.success('Branch created successfully');
      }
      this.closeDialog();
      await this.reload();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string; message?: string } })?.error?.error ||
        (error as { error?: { error?: string; message?: string } })?.error?.message ||
        'Failed to save branch';
      this.toast.error(message);
    }
  }

  async toggleStatus(branch: Branch) {
    try {
      await this.api.put(`/api/bank/branches/${branch.id}`, { status: !branch.status });
      this.toast.success(`Branch ${!branch.status ? 'activated' : 'deactivated'} successfully`);
      await this.reload();
    } catch {
      this.toast.error('Failed to update branch status');
    }
  }

  async remove(branch: Branch) {
    try {
      await this.api.delete(`/api/bank/branches/${branch.id}`);
      this.toast.success('Branch deleted successfully');
      this.confirmDelete.set(null);
      await this.reload();
    } catch {
      this.toast.error('Failed to delete branch');
    }
  }

  async downloadQr(branch: Branch) {
    try {
      const url = `${window.location.origin}/RateService/${branch.id}`;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: '#0e4480', light: '#FFFFFF' },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${branch.name.replace(/[^a-zA-Z0-9]/g, '_')}_QR_Code.png`;
      a.click();
      this.toast.success(`QR Code downloaded for ${branch.name}`);
    } catch {
      this.toast.error('Failed to generate QR code');
    }
  }
}
