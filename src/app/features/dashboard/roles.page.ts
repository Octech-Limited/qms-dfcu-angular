import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Loader2, LucideAngularModule, Pencil, Plus, Search, Trash2, X } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
  UiQueueSpinner,
} from '../../shared/ui/ui';

const MENU_ITEMS = [
  'Branches',
  'Users',
  'Roles',
  'Queues',
  'ExchangeRates',
  'Socials',
  'Announcements',
  'Ads',
  'Settings',
  'Sessions',
  'Logs',
  'AuditLogs',
  'Serving',
  'Preview',
] as const;

const PERMISSION_LABELS: Record<string, string> = {
  Serving: 'Serving dashboard',
  Preview: 'Hall display preview',
};

type Role = {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
};

@Component({
  selector: 'app-roles',
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
        <h2 class="text-xl font-bold tracking-tight">User Roles and Permissions</h2>
        <button uiBtn (click)="openCreate()">
          <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
          Add Role
        </button>
      </div>

      <div class="relative max-w-md">
        <lucide-angular
          [img]="icons.Search"
          class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
        ></lucide-angular>
        <input
          class="h-9 w-full rounded-md border border-input bg-background pl-10 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="Search roles..."
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

      @if (loading() && roles().length === 0) {
        <div class="flex h-64 items-center justify-center">
          <ui-queue-spinner size="lg" [dotCount]="12" />
        </div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          @for (role of pageRows(); track role.id) {
            <ui-card class="gap-4 py-4">
              <ui-card-header class="flex flex-row items-center justify-between space-y-0 pb-2">
                <ui-card-title>{{ role.name }}</ui-card-title>
                <div class="flex space-x-2">
                  <button uiBtn size="icon" (click)="openEdit(role)">
                    <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                  </button>
                  <button uiBtn size="icon" variant="destructive" (click)="remove(role)">
                    <lucide-angular [img]="icons.Trash2" class="size-4"></lucide-angular>
                  </button>
                </div>
              </ui-card-header>
              <ui-card-content>
                <div class="space-y-2">
                  <h4 class="font-semibold">Permissions:</h4>
                  <div class="grid grid-cols-2 gap-2 text-sm">
                    @for (key of permissionKeys(role); track key) {
                      <div class="flex items-center space-x-2">
                        <div class="size-2 rounded-full bg-primary"></div>
                        <span>{{ labelFor(key) }}</span>
                      </div>
                    }
                  </div>
                </div>
              </ui-card-content>
            </ui-card>
          }
        </div>
        @if (totalPages() > 1) {
          <div class="mt-6 flex items-center justify-between text-sm">
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

      @if (dialogOpen()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="closeDialog()"
        >
          <form
            class="glass max-h-[90vh] w-full max-w-[525px] overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
            (ngSubmit)="save()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ editing() ? 'Edit Role' : 'Create New Role' }}
              </h3>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeDialog()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="space-y-4 py-2">
              <label class="grid gap-2 text-sm font-medium">
                Role Name
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="name"
                  [(ngModel)]="formName"
                  required
                />
              </label>
              <div class="space-y-4">
                <div class="text-sm font-medium">Permissions</div>
                <div class="grid grid-cols-2 gap-4">
                  @for (item of menuItems; track item) {
                    <label class="flex cursor-pointer items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        class="size-4 accent-primary"
                        [checked]="!!formPermissions[item]"
                        (change)="togglePermission(item, $event)"
                      />
                      <span>{{ labelFor(item) }}</span>
                    </label>
                  }
                </div>
                @if (!editing()) {
                  <p class="text-sm text-gray-500">
                    {{
                      hasAnyPermission()
                        ? 'At least one permission selected'
                        : 'Please select at least one permission'
                    }}
                  </p>
                }
              </div>
              <button
                uiBtn
                class="w-full"
                [disabled]="saving() || (!editing() && !hasAnyPermission())"
              >
                @if (saving()) {
                  <lucide-angular
                    [img]="icons.Loader2"
                    class="size-4 animate-spin"
                  ></lucide-angular>
                }
                {{ editing() ? 'Update' : 'Create' }} Role
              </button>
            </div>
          </form>
        </div>
      }
    </div>
  `,
})
export class RolesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Plus, Search, X, Pencil, Trash2, Loader2 };
  readonly menuItems = MENU_ITEMS;
  readonly roles = signal<Role[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly dialogOpen = signal(false);
  readonly editing = signal<Role | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = 12;

  searchQuery = '';
  formName = '';
  formPermissions: Record<string, boolean> = this.emptyPermissions();

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.roles();
    return this.roles().filter((role) => role.name.toLowerCase().includes(q));
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

  emptyPermissions() {
    return Object.fromEntries(MENU_ITEMS.map((item) => [item, false])) as Record<string, boolean>;
  }

  labelFor(key: string) {
    return PERMISSION_LABELS[key] || key;
  }

  permissionKeys(role: Role) {
    return Object.entries(role.permissions || {})
      .filter(([, value]) => value)
      .map(([key]) => key);
  }

  hasAnyPermission() {
    return Object.values(this.formPermissions).some(Boolean);
  }

  togglePermission(item: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.formPermissions = { ...this.formPermissions, [item]: checked };
  }

  async reload() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Role[]>('/api/bank/roles');
      this.roles.set(
        Array.isArray(data)
          ? data.map((role) => ({
              ...role,
              permissions:
                typeof role.permissions === 'string'
                  ? (JSON.parse(role.permissions as unknown as string) as Record<string, boolean>)
                  : role.permissions || {},
            }))
          : [],
      );
    } catch {
      this.toast.error('Failed to fetch roles');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editing.set(null);
    this.formName = '';
    this.formPermissions = this.emptyPermissions();
    this.dialogOpen.set(true);
  }

  openEdit(role: Role) {
    this.editing.set(role);
    this.formName = role.name;
    this.formPermissions = {
      ...this.emptyPermissions(),
      ...role.permissions,
    };
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
    this.editing.set(null);
  }

  async save() {
    if (!this.editing() && !this.hasAnyPermission()) {
      this.toast.error('Please select at least one permission before creating a role.');
      return;
    }
    this.saving.set(true);
    try {
      const body = { name: this.formName, permissions: this.formPermissions };
      const editing = this.editing();
      if (editing) {
        await this.api.put(`/api/bank/roles/${editing.id}`, body);
        this.toast.success('Role updated');
      } else {
        await this.api.post('/api/bank/roles', body);
        this.toast.success('Role created');
      }
      this.closeDialog();
      await this.reload();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string } })?.error?.error || 'Failed to save role';
      this.toast.error(message);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(role: Role) {
    this.loading.set(true);
    try {
      await this.api.delete(`/api/bank/roles/${role.id}`);
      await this.reload();
    } catch {
      this.toast.error('Failed to delete role');
      this.loading.set(false);
    }
  }
}
