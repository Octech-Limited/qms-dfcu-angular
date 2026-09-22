import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule, Pencil, Plus, Search, Trash2, X } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { UiButton, UiCard } from '../../shared/ui/ui';

@Component({
  selector: 'app-crud',
  imports: [FormsModule, LucideAngularModule, UiButton, UiCard],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-2xl font-bold tracking-tight">{{ title }}</h2>
          <p class="text-sm text-muted-foreground">View and manage {{ title.toLowerCase() }}.</p>
        </div>
        @if (!readOnly) {
          <button uiBtn (click)="startCreate()">
            <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
            Add {{ singularTitle }}
          </button>
        }
      </div>
      <ui-card class="gap-0 py-0">
        <div class="border-b p-4">
          <div class="relative max-w-sm">
            <lucide-angular
              [img]="icons.Search"
              class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            ></lucide-angular>
            <input
              class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
              [(ngModel)]="search"
              placeholder="Search {{ title.toLowerCase() }}..."
            />
          </div>
        </div>
        <div class="overflow-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-muted/70">
              <tr>
                @for (col of columns; track col) {
                  <th class="h-11 px-4 font-medium text-muted-foreground">{{ label(col) }}</th>
                }
                @if (!readOnly) {
                  <th class="h-11 px-4 text-right font-medium text-muted-foreground">Actions</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of filteredRows(); track row['id'] || $index) {
                <tr class="border-t transition-colors hover:bg-muted/40">
                  @for (col of columns; track col) {
                    <td class="whitespace-nowrap px-4 py-3">
                      @if (isBoolean(row[col])) {
                        <span
                          class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                          [class.bg-green-100]="row[col]"
                          [class.text-green-700]="row[col]"
                          [class.bg-slate-100]="!row[col]"
                          [class.text-slate-600]="!row[col]"
                          >{{ row[col] ? 'Active' : 'Inactive' }}</span
                        >
                      } @else {
                        {{ display(row, col) }}
                      }
                    </td>
                  }
                  @if (!readOnly) {
                    <td class="whitespace-nowrap px-4 py-3 text-right">
                      <button uiBtn variant="ghost" size="icon" title="Edit" (click)="edit(row)">
                        <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                      </button>
                      <button
                        uiBtn
                        variant="ghost"
                        size="icon"
                        extraClass="text-destructive hover:text-destructive"
                        title="Delete"
                        (click)="remove(row)"
                      >
                        <lucide-angular [img]="icons.Trash2" class="size-4"></lucide-angular>
                      </button>
                    </td>
                  }
                </tr>
              } @empty {
                <tr>
                  <td
                    [attr.colspan]="columns.length + (readOnly ? 0 : 1)"
                    class="h-32 text-center text-muted-foreground"
                  >
                    No {{ title.toLowerCase() }} found.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </ui-card>
      @if (editing()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="editing.set(false)"
        >
          <form
            class="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 shadow-xl"
            (ngSubmit)="save()"
            (click)="$event.stopPropagation()"
          >
            <div class="mb-5 flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold">
                  {{ editId ? 'Edit' : 'Add' }} {{ singularTitle }}
                </h3>
                <p class="text-sm text-muted-foreground">Complete the details below.</p>
              </div>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="editing.set(false)">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="grid gap-4">
              @for (col of fields; track col) {
                <label class="grid gap-2 text-sm font-medium">
                  {{ label(col) }}
                  <input
                    class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    [(ngModel)]="form[col]"
                    [name]="col"
                  />
                </label>
              }
            </div>
            <div class="mt-6 flex justify-end gap-2">
              <button uiBtn type="button" variant="outline" (click)="editing.set(false)">
                Cancel
              </button>
              <button uiBtn>Save changes</button>
            </div>
          </form>
        </div>
      }
    </div>
  `,
})
export class CrudPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  title = '';
  endpoint = '';
  columns: string[] = [];
  fields: string[] = [];
  readOnly = false;
  rows = signal<Record<string, unknown>[]>([]);
  editing = signal(false);
  search = '';
  form: Record<string, unknown> = {};
  editId: string | null = null;
  readonly icons = { Plus, Search, Pencil, Trash2, X };

  get singularTitle() {
    return this.title.endsWith('ies')
      ? `${this.title.slice(0, -3)}y`
      : this.title.endsWith('s')
        ? this.title.slice(0, -1)
        : this.title;
  }

  async ngOnInit() {
    const data = this.route.snapshot.data;
    this.title = String(data['title'] || 'Records');
    this.endpoint = String(data['endpoint']);
    this.columns = (data['columns'] as string[]) || ['id'];
    this.fields = (data['fields'] as string[]) || this.columns;
    this.readOnly =
      this.endpoint.includes('history') ||
      this.endpoint.includes('logs') ||
      this.endpoint.includes('sessions');
    await this.reload();
  }

  display(row: Record<string, unknown>, col: string) {
    const nested = (row['menuItem'] as { name?: string } | undefined)?.name;
    const value = row[col] ?? nested;
    if (typeof value === 'object') return JSON.stringify(value);
    return value as string;
  }

  label(value: string) {
    return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
  }

  isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
  }

  filteredRows() {
    const term = this.search.trim().toLowerCase();
    if (!term) return this.rows();
    return this.rows().filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(term),
      ),
    );
  }

  async reload() {
    const data = await this.api.get<unknown>(this.endpoint);
    this.rows.set(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
  }

  startCreate() {
    this.editId = null;
    this.form = Object.fromEntries(this.fields.map((c) => [c, '']));
    this.editing.set(true);
  }

  edit(row: Record<string, unknown>) {
    this.editId = String(row['id'] || '');
    this.form = { ...row };
    this.editing.set(true);
  }

  payload() {
    const body: Record<string, unknown> = { ...this.form };
    delete body['id'];
    delete body['createdAt'];
    delete body['updatedAt'];
    delete body['password'];
    if (this.form['password']) body['password'] = this.form['password'];
    if (body['status'] === 'true' || body['status'] === 'false')
      body['status'] = body['status'] === 'true';
    if (body['isActive'] === 'true' || body['isActive'] === 'false')
      body['isActive'] = body['isActive'] === 'true';
    if (body['isLive'] === 'true' || body['isLive'] === 'false')
      body['isLive'] = body['isLive'] === 'true';
    if (typeof body['permissions'] === 'string') {
      try {
        body['permissions'] = JSON.parse(String(body['permissions']));
      } catch {
        /* keep string */
      }
    }
    return body;
  }

  async save() {
    try {
      if (this.editId) await this.api.put(`${this.endpoint}/${this.editId}`, this.payload());
      else await this.api.post(this.endpoint, this.payload());
      this.editing.set(false);
      await this.reload();
    } catch {
      this.toast.error('Save failed');
    }
  }

  async remove(row: Record<string, unknown>) {
    if (!row['id']) return;
    await this.api.delete(`${this.endpoint}/${row['id']}`);
    await this.reload();
  }
}
