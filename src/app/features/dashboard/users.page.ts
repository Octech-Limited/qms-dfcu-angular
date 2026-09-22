import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Pencil, Plus, Search, Trash2, X } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { UiButton, UiCard, UiCardContent, UiQueueSpinner } from '../../shared/ui/ui';

type Named = { id: string; name: string };
type User = {
  id: string;
  email: string;
  username: string;
  status: boolean;
  role: Named | null;
  branch: Named | null;
};

@Component({
  selector: 'app-users',
  imports: [FormsModule, LucideAngularModule, UiButton, UiCard, UiCardContent, UiQueueSpinner],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-bold tracking-tight">User management</h2>
        <button uiBtn (click)="openCreate()">
          <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
          Add User
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
                placeholder="Search users..."
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
              [(ngModel)]="roleFilter"
              (ngModelChange)="currentPage.set(1)"
            >
              <option value="all">All Roles</option>
              @for (role of roles(); track role.id) {
                <option [value]="role.id">{{ role.name }}</option>
              }
            </select>
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm"
              [(ngModel)]="branchFilter"
              (ngModelChange)="currentPage.set(1)"
            >
              <option value="all">All Branches</option>
              @for (branch of branches(); track branch.id) {
                <option [value]="branch.id">{{ branch.name }}</option>
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
              Showing {{ filtered().length }} of {{ users().length }} users
            </div>
          </div>
        </ui-card-content>
      </ui-card>

      @if (loading()) {
        <div class="flex h-48 items-center justify-center">
          <ui-queue-spinner size="lg" [dotCount]="12" />
        </div>
      } @else if (users().length === 0) {
        <p class="text-center text-gray-500">No users available.</p>
      } @else {
        <ui-card class="gap-0 overflow-hidden py-0">
          <div class="overflow-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b">
                  <th class="h-11 px-4 font-medium text-muted-foreground">Email</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Username</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Role</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Branch</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Status</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (user of pageRows(); track user.id) {
                  <tr class="border-t hover:bg-muted/40">
                    <td class="px-4 py-3">{{ user.email }}</td>
                    <td class="px-4 py-3">{{ user.username }}</td>
                    <td class="px-4 py-3">{{ user.role?.name || 'No Role Assigned' }}</td>
                    <td class="px-4 py-3">{{ user.branch?.name || 'N/A' }}</td>
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                          [class.bg-primary]="user.status"
                          [class.bg-input]="!user.status"
                          [attr.aria-checked]="user.status"
                          (click)="toggleStatus(user)"
                        >
                          <span
                            class="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                            [class.translate-x-4]="user.status"
                          ></span>
                        </button>
                        <span
                          class="text-sm"
                          [class.text-green-600]="user.status"
                          [class.text-gray-500]="!user.status"
                          >{{ user.status ? 'Active' : 'Inactive' }}</span
                        >
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <button uiBtn size="sm" (click)="openEdit(user)">
                          <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                        </button>
                        <button uiBtn size="sm" variant="destructive" (click)="confirmDelete.set(user)">
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
            class="glass w-full max-w-[425px] rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
            (ngSubmit)="save()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">{{ editing() ? 'Edit User' : 'Add User' }}</h3>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeDialog()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="space-y-4">
              <label class="grid gap-2 text-sm font-medium">
                Email
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  type="email"
                  name="email"
                  [(ngModel)]="form.email"
                  required
                />
              </label>
              <label class="grid gap-2 text-sm font-medium">
                Username
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="username"
                  [(ngModel)]="form.username"
                  required
                />
              </label>
              <label class="grid gap-2 text-sm font-medium">
                Role
                <select
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="roleId"
                  [(ngModel)]="form.roleId"
                >
                  <option value="">No role</option>
                  @for (role of roles(); track role.id) {
                    <option [value]="role.id">{{ role.name }}</option>
                  }
                </select>
              </label>
              <label class="grid gap-2 text-sm font-medium">
                Branch
                <select
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  name="branchId"
                  [(ngModel)]="form.branchId"
                >
                  <option value="">No Branch</option>
                  @for (branch of branches(); track branch.id) {
                    <option [value]="branch.id">{{ branch.name }}</option>
                  }
                </select>
              </label>
              <button uiBtn class="w-full">
                {{ editing() ? 'Update User' : 'Create User' }}
              </button>
            </div>
          </form>
        </div>
      }

      @if (confirmDelete(); as user) {
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
              This action cannot be undone. This will permanently delete the user "{{
                user.username || user.email
              }}".
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn variant="outline" (click)="confirmDelete.set(null)">Cancel</button>
              <button uiBtn variant="destructive" (click)="remove(user)">Delete</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Plus, Search, X, Pencil, Trash2 };
  readonly users = signal<User[]>([]);
  readonly roles = signal<Named[]>([]);
  readonly branches = signal<Named[]>([]);
  readonly loading = signal(true);
  readonly dialogOpen = signal(false);
  readonly editing = signal<User | null>(null);
  readonly confirmDelete = signal<User | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = 10;

  searchQuery = '';
  roleFilter = 'all';
  branchFilter = 'all';
  statusFilter = 'all';
  form = { email: '', username: '', roleId: '', branchId: '' };

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    return this.users().filter((user) => {
      const matchesSearch =
        !q ||
        user.email.toLowerCase().includes(q) ||
        user.username?.toLowerCase().includes(q);
      const matchesRole = this.roleFilter === 'all' || user.role?.id === this.roleFilter;
      const matchesBranch = this.branchFilter === 'all' || user.branch?.id === this.branchFilter;
      const matchesStatus =
        this.statusFilter === 'all' ||
        (this.statusFilter === 'active' && user.status) ||
        (this.statusFilter === 'inactive' && !user.status);
      return matchesSearch && matchesRole && matchesBranch && matchesStatus;
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
    await Promise.all([this.reload(), this.loadMeta()]);
  }

  async reload() {
    this.loading.set(true);
    try {
      const data = await this.api.get<User[]>('/api/bank/users');
      this.users.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Failed to fetch users');
    } finally {
      this.loading.set(false);
    }
  }

  async loadMeta() {
    try {
      const [roles, branches] = await Promise.all([
        this.api.get<Named[]>('/api/bank/roles'),
        this.api.get<Named[]>('/api/bank/branches'),
      ]);
      this.roles.set(Array.isArray(roles) ? roles : []);
      this.branches.set(Array.isArray(branches) ? branches : []);
    } catch {
      this.toast.error('Failed to fetch roles or branches');
    }
  }

  openCreate() {
    this.editing.set(null);
    this.form = { email: '', username: '', roleId: '', branchId: '' };
    this.dialogOpen.set(true);
  }

  openEdit(user: User) {
    this.editing.set(user);
    this.form = {
      email: user.email || '',
      username: user.username || '',
      roleId: user.role?.id || '',
      branchId: user.branch?.id || '',
    };
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
    this.editing.set(null);
  }

  payload() {
    return {
      email: this.form.email,
      username: this.form.username,
      role: this.form.roleId || null,
      branch: this.form.branchId || null,
    };
  }

  async save() {
    try {
      const editing = this.editing();
      if (editing) {
        await this.api.put(`/api/bank/users/${editing.id}`, this.payload());
        this.toast.success('User updated');
      } else {
        await this.api.post('/api/bank/users', this.payload());
        this.toast.success('User created');
      }
      this.closeDialog();
      await this.reload();
    } catch (error: unknown) {
      const message =
        (error as { error?: { error?: string; message?: string } })?.error?.error ||
        (error as { error?: { error?: string; message?: string } })?.error?.message ||
        'Failed to save user';
      this.toast.error(message);
    }
  }

  async toggleStatus(user: User) {
    try {
      await this.api.put(`/api/bank/users/${user.id}`, { status: !user.status });
      this.toast.success(`User ${!user.status ? 'activated' : 'deactivated'} successfully`);
      await this.reload();
    } catch {
      this.toast.error('Failed to update user status');
    }
  }

  async remove(user: User) {
    try {
      await this.api.delete(`/api/bank/users/${user.id}`);
      this.toast.success('User deleted');
      this.confirmDelete.set(null);
      await this.reload();
    } catch {
      this.toast.error('Failed to delete user');
    }
  }
}
