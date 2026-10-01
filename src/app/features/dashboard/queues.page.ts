import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  LucideAngularModule,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-angular';
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

type SubSub = { id?: string; name: string; priority: boolean };
type Sub = {
  id?: string;
  name: string;
  priority: boolean;
  subSubMenuItems: SubSub[];
};
type Branch = { id: string; name: string };
type Queue = {
  id: string;
  status?: number;
  branchIds?: string[];
  menuItem: { name: string; subMenuItems: Sub[] };
};

@Component({
  selector: 'app-queues',
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
        <h2 class="text-xl font-bold tracking-tight">Queue Management</h2>
        <button uiBtn (click)="openCreate()">
          <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
          Add Queue Menu
        </button>
      </div>

      <div class="relative max-w-md">
        <lucide-angular
          [img]="icons.Search"
          class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
        ></lucide-angular>
        <input
          class="h-9 w-full rounded-md border border-input bg-background pl-10 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="Search queues..."
          [(ngModel)]="searchQuery"
          (ngModelChange)="currentPage.set(1)"
        />
      </div>

      @if (loading()) {
        <div class="flex min-h-[200px] items-center justify-center">
          <ui-queue-spinner size="lg" [dotCount]="12" />
        </div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          @for (queue of pageRows(); track queue.id) {
            <ui-card class="gap-4 overflow-hidden py-4">
              <ui-card-header class="flex flex-row items-center justify-between space-y-0 pb-2">
                <div class="flex-1">
                  <ui-card-title class="text-lg font-semibold">{{
                    queue.menuItem.name
                  }}</ui-card-title>
                  <p class="mt-1 text-xs text-muted-foreground">{{ branchLabel(queue) }}</p>
                  <div class="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      role="switch"
                      class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                      [class.bg-primary]="(queue.status ?? 1) === 1"
                      [class.bg-input]="(queue.status ?? 1) !== 1"
                      [attr.aria-checked]="(queue.status ?? 1) === 1"
                      (click)="toggleStatus(queue)"
                    >
                      <span
                        class="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                        [class.translate-x-4]="(queue.status ?? 1) === 1"
                      ></span>
                    </button>
                    <span
                      class="text-xs"
                      [class.text-green-600]="(queue.status ?? 1) === 1"
                      [class.text-gray-500]="(queue.status ?? 1) !== 1"
                      >{{ (queue.status ?? 1) === 1 ? 'Active' : 'Inactive' }}</span
                    >
                  </div>
                </div>
                <div class="flex space-x-2">
                  <button uiBtn size="icon" (click)="openEdit(queue)">
                    <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                  </button>
                  <button uiBtn size="icon" variant="destructive" (click)="confirmDelete.set(queue)">
                    <lucide-angular [img]="icons.Trash2" class="size-4"></lucide-angular>
                  </button>
                </div>
              </ui-card-header>
              <ui-card-content>
                <div class="space-y-3">
                  <h4 class="text-sm font-medium text-muted-foreground">Sub Items:</h4>
                  <div class="space-y-2">
                    @for (sub of queue.menuItem.subMenuItems; track sub.id || $index) {
                      <div class="space-y-1">
                        <div class="text-sm font-medium text-gray-700">
                          • {{ sub.name
                          }}{{
                            !sub.subSubMenuItems.length && sub.priority ? ' (Priority)' : ''
                          }}
                        </div>
                        @if (sub.subSubMenuItems.length) {
                          <ul class="ml-4 space-y-1">
                            @for (child of sub.subSubMenuItems; track child.id || $index) {
                              <li class="text-xs text-gray-600">
                                - {{ child.name }}{{ child.priority ? ' (Priority)' : '' }}
                              </li>
                            }
                          </ul>
                        }
                      </div>
                    }
                  </div>
                </div>
              </ui-card-content>
            </ui-card>
          } @empty {
            <p class="col-span-full text-center text-muted-foreground">
              No queues available. Create one to get started.
            </p>
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
            class="glass max-h-[90vh] w-full max-w-[525px] overflow-hidden rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
            (ngSubmit)="save()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ editing() ? 'Edit' : 'Create' }} Queue Menu
              </h3>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeDialog()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
              <div class="space-y-4 rounded-xl border p-4">
                <label class="grid gap-2 text-sm font-medium">
                  Menu Item Name
                  <input
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    name="menuName"
                    [(ngModel)]="formName"
                    placeholder="e.g., Teller Services"
                    required
                  />
                </label>
                <div class="grid gap-2 text-sm font-medium">
                  Select Branches
                  <div class="max-h-32 space-y-2 overflow-y-auto rounded-md border p-2 font-normal">
                    @for (branch of branches(); track branch.id) {
                      <label class="flex items-center gap-2 text-sm">
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
                <div class="space-y-4">
                  <div class="text-sm font-medium">Sub Items</div>
                  @for (sub of formSubs; track $index; let i = $index) {
                    <div class="space-y-3 rounded-lg border p-3">
                      <div class="flex gap-2">
                        <input
                          class="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          [(ngModel)]="sub.name"
                          [name]="'sub-' + i"
                          placeholder="e.g., Deposit"
                        />
                        <button uiBtn type="button" variant="ghost" size="sm" (click)="removeSub(i)">
                          <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
                        </button>
                      </div>
                      @if (!sub.subSubMenuItems.length) {
                        <label class="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            class="size-4 accent-primary"
                            [(ngModel)]="sub.priority"
                            [name]="'sub-priority-' + i"
                          />
                          Priority
                        </label>
                      }
                      <div class="ml-4 space-y-2">
                        <div class="flex items-center justify-between">
                          <span class="text-sm text-muted-foreground">Sub-Sub Items</span>
                          <button
                            uiBtn
                            type="button"
                            variant="outline"
                            size="sm"
                            (click)="addSubSub(i)"
                          >
                            <lucide-angular [img]="icons.Plus" class="size-3"></lucide-angular>
                            Add Sub-Sub Item
                          </button>
                        </div>
                        @for (child of sub.subSubMenuItems; track $index; let j = $index) {
                          <div class="flex gap-2">
                            <input
                              class="h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                              [(ngModel)]="child.name"
                              [name]="'subsub-' + i + '-' + j"
                              placeholder="e.g., Cash Deposit"
                            />
                            <label class="flex items-center gap-2 whitespace-nowrap px-2 text-xs">
                              <input
                                type="checkbox"
                                class="size-4 accent-primary"
                                [(ngModel)]="child.priority"
                                [name]="'subsub-priority-' + i + '-' + j"
                              />
                              Priority
                            </label>
                            <button
                              uiBtn
                              type="button"
                              variant="ghost"
                              size="sm"
                              (click)="removeSubSub(i, j)"
                            >
                              <lucide-angular [img]="icons.X" class="size-3"></lucide-angular>
                            </button>
                          </div>
                        }
                      </div>
                    </div>
                  }
                  <button uiBtn type="button" variant="outline" size="sm" (click)="addSub()">
                    <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
                    Add Sub Item
                  </button>
                </div>
              </div>
            </div>
            <button uiBtn class="mt-4 w-full" [disabled]="!selectedBranches().length">
              {{ editing() ? 'Update' : 'Create' }} Queue Menu
            </button>
          </form>
        </div>
      }

      @if (confirmDelete(); as queue) {
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
              This action cannot be undone. This will permanently delete the queue and all its menu
              items.
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn variant="outline" (click)="confirmDelete.set(null)">Cancel</button>
              <button uiBtn variant="destructive" (click)="remove(queue)">Delete</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class QueuesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Plus, Search, Pencil, Trash2, X };
  readonly queues = signal<Queue[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly selectedBranches = signal<string[]>([]);
  readonly loading = signal(false);
  readonly dialogOpen = signal(false);
  readonly editing = signal<Queue | null>(null);
  readonly confirmDelete = signal<Queue | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = 9;

  searchQuery = '';
  formName = '';
  formSubs: Sub[] = [];

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.queues();
    return this.queues().filter(
      (queue) =>
        queue.menuItem.name.toLowerCase().includes(q) ||
        this.branchLabel(queue).toLowerCase().includes(q) ||
        queue.menuItem.subMenuItems.some((sub) => sub.name.toLowerCase().includes(q)),
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
    await Promise.all([this.reload(), this.loadBranches()]);
  }

  branchLabel(queue: Queue) {
    const ids = queue.branchIds ?? [];
    if (!ids.length) return 'All branches';
    const names = this.branches();
    return ids.map((id) => names.find((branch) => branch.id === id)?.name ?? id).join(', ');
  }

  toggleBranch(id: string) {
    const current = this.selectedBranches();
    this.selectedBranches.set(
      current.includes(id) ? current.filter((branchId) => branchId !== id) : [...current, id],
    );
  }

  async loadBranches() {
    try {
      const data = await this.api.get<Branch[]>('/api/bank/branches');
      this.branches.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Failed to fetch branches');
    }
  }

  async reload() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Queue[]>('/api/bank/queues');
      this.queues.set(Array.isArray(data) ? data : []);
    } catch {
      this.toast.error('Failed to fetch queues');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editing.set(null);
    this.formName = '';
    this.formSubs = [];
    this.selectedBranches.set([]);
    this.dialogOpen.set(true);
  }

  openEdit(queue: Queue) {
    this.editing.set(queue);
    this.selectedBranches.set([...(queue.branchIds ?? [])]);
    this.formName = queue.menuItem.name;
    this.formSubs = (queue.menuItem.subMenuItems || []).map((sub) => ({
      id: sub.id,
      name: sub.name,
      priority: sub.subSubMenuItems?.length ? false : !!sub.priority,
      subSubMenuItems: (sub.subSubMenuItems || []).map((child) => ({
        id: child.id,
        name: child.name,
        priority: !!child.priority,
      })),
    }));
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
    this.editing.set(null);
  }

  addSub() {
    this.formSubs = [...this.formSubs, { name: '', priority: false, subSubMenuItems: [] }];
  }

  removeSub(index: number) {
    this.formSubs = this.formSubs.filter((_, i) => i !== index);
  }

  addSubSub(index: number) {
    this.formSubs = this.formSubs.map((sub, i) =>
      i === index
        ? {
            ...sub,
            priority: false,
            subSubMenuItems: [...sub.subSubMenuItems, { name: '', priority: false }],
          }
        : sub,
    );
  }

  removeSubSub(subIndex: number, childIndex: number) {
    this.formSubs = this.formSubs.map((sub, i) =>
      i === subIndex
        ? {
            ...sub,
            subSubMenuItems: sub.subSubMenuItems.filter((_, j) => j !== childIndex),
          }
        : sub,
    );
  }

  payload() {
    return {
      branchIds: this.selectedBranches(),
      menuItem: {
        name: this.formName.trim(),
        subMenuItems: this.formSubs
          .filter((sub) => sub.name.trim())
          .map((sub) => ({
            id: sub.id,
            name: sub.name.trim(),
            priority: sub.subSubMenuItems.length ? false : !!sub.priority,
            subSubMenuItems: sub.subSubMenuItems
              .filter((child) => child.name.trim())
              .map((child) => ({
                id: child.id,
                name: child.name.trim(),
                priority: !!child.priority,
              })),
          })),
      },
    };
  }

  async save() {
    if (!this.formName.trim()) {
      this.toast.error('Menu item name is required');
      return;
    }
    if (!this.selectedBranches().length) {
      this.toast.error('Select at least one branch');
      return;
    }
    try {
      const editing = this.editing();
      if (editing) {
        await this.api.put(`/api/bank/queues/${editing.id}`, {
          ...this.payload(),
          status: editing.status ?? 1,
        });
        this.toast.success('Queue updated successfully');
      } else {
        await this.api.post('/api/bank/queues', this.payload());
        this.toast.success('Queue created successfully');
      }
      this.closeDialog();
      await this.reload();
    } catch (error: unknown) {
      const payload = (error as HttpErrorResponse)?.error as { message?: string; error?: string };
      this.toast.error(
        `Failed to ${this.editing() ? 'update' : 'create'} queue: ${
          payload?.message || payload?.error || 'Unknown error'
        }`,
      );
    }
  }

  async toggleStatus(queue: Queue) {
    const current = queue.status ?? 1;
    const next = current === 1 ? 0 : 1;
    try {
      await this.api.put(`/api/bank/queues/${queue.id}`, {
        status: next,
        menuItem: queue.menuItem,
      });
      this.toast.success(`Queue ${next === 1 ? 'activated' : 'deactivated'} successfully`);
      await this.reload();
    } catch {
      this.toast.error('Failed to update queue status');
    }
  }

  async remove(queue: Queue) {
    try {
      await this.api.delete(`/api/bank/queues/${queue.id}`);
      this.toast.success('Queue deleted successfully');
      this.confirmDelete.set(null);
      await this.reload();
    } catch (error: unknown) {
      const payload = (error as HttpErrorResponse)?.error as { message?: string; error?: string };
      this.toast.error(payload?.error || payload?.message || 'Failed to delete queue');
    }
  }
}
