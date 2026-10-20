import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  GripVertical,
  LucideAngularModule,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-angular';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { UiButton, UiCard, UiCardContent, UiQueueSpinner } from '../../shared/ui/ui';
import { countries, type Country } from './countries';

type Rate = {
  id: string;
  countryName: string;
  countryCode: string;
  currencyCode: string;
  buyingRate: number;
  sellingRate: number;
  displayOrder?: number;
};

@Component({
  selector: 'app-exchange',
  imports: [
    FormsModule,
    DragDropModule,
    LucideAngularModule,
    UiButton,
    UiCard,
    UiCardContent,
    UiQueueSpinner,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-2xl font-bold">Exchange Rates</h1>
        <button uiBtn (click)="openCreate()">
          <lucide-angular [img]="icons.Plus" class="size-4"></lucide-angular>
          Add Rate
        </button>
      </div>

      <ui-card class="gap-0 py-0">
        <ui-card-content class="py-6">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div class="relative">
              <lucide-angular
                [img]="icons.Search"
                class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              ></lucide-angular>
              <input
                class="h-10 w-full rounded-md border-2 border-input bg-card pl-10 pr-9 text-sm font-medium shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                placeholder="Search rates..."
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
              class="flex h-10 w-full rounded-md border-2 border-input bg-card px-3 py-2 text-sm font-medium shadow-sm"
              [(ngModel)]="countryFilter"
              (ngModelChange)="currentPage.set(1)"
            >
              <option value="all">All Countries</option>
              @for (code of countryCodes(); track code) {
                <option [value]="code">{{ countryNameFor(code) }} ({{ code }})</option>
              }
            </select>
            <div class="flex items-center text-sm text-muted-foreground">
              Showing {{ filtered().length }} of {{ rates().length }} rates
            </div>
          </div>
        </ui-card-content>
      </ui-card>

      @if (loading()) {
        <div class="flex h-48 items-center justify-center">
          <ui-queue-spinner size="lg" [dotCount]="12" />
        </div>
      } @else if (rates().length === 0) {
        <p class="text-center text-muted-foreground">No exchange rates available.</p>
      } @else {
        <ui-card class="gap-0 overflow-hidden py-0">
          <div class="overflow-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b">
                  <th class="h-11 w-10 px-4"></th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Country</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Currency</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Buy Rate</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Sell Rate</th>
                  <th class="h-11 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody
                cdkDropList
                [cdkDropListData]="pageRows()"
                (cdkDropListDropped)="onDrop($event)"
                [cdkDropListDisabled]="isFiltered() || reordering()"
              >
                @for (rate of pageRows(); track rate.id) {
                  <tr
                    class="border-t hover:bg-muted/40"
                    cdkDrag
                    [cdkDragData]="rate"
                    [cdkDragDisabled]="isFiltered() || reordering()"
                  >
                    <td class="w-10 cursor-grab px-4 py-3 active:cursor-grabbing">
                      <lucide-angular
                        [img]="icons.GripVertical"
                        class="size-5 text-muted-foreground"
                        cdkDragHandle
                      ></lucide-angular>
                    </td>
                    <td class="px-4 py-3">{{ rate.countryName }}</td>
                    <td class="px-4 py-3">{{ rate.currencyCode }}</td>
                    <td class="px-4 py-3">{{ rate.buyingRate }}</td>
                    <td class="px-4 py-3">{{ rate.sellingRate }}</td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <button uiBtn size="sm" (click)="openEdit(rate)">
                          <lucide-angular [img]="icons.Pencil" class="size-4"></lucide-angular>
                        </button>
                        <button uiBtn size="sm" variant="destructive" (click)="remove(rate)">
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
            class="glass w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
            (ngSubmit)="save()"
          >
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold">
                {{ editing() ? 'Edit Exchange Rate' : 'Add New Exchange Rate' }}
              </h3>
              <button uiBtn type="button" variant="ghost" size="icon" (click)="closeDialog()">
                <lucide-angular [img]="icons.X" class="size-4"></lucide-angular>
              </button>
            </div>
            <div class="space-y-4">
              <label class="grid gap-2 text-sm font-medium">
                Country Name
                <select
                  class="h-10 w-full rounded-md border-2 border-input bg-card p-2 font-medium shadow-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  name="countryName"
                  [(ngModel)]="form.countryName"
                  (ngModelChange)="onCountryChange($event)"
                  required
                >
                  <option value="">Select a country</option>
                  @for (country of countryList; track country.code) {
                    <option [value]="country.name">{{ country.name }}</option>
                  }
                </select>
              </label>
              <div class="grid grid-cols-2 gap-4">
                <label class="grid gap-2 text-sm font-medium">
                  Country Code
                  <input
                    class="h-9 rounded-md border border-input bg-muted px-3 text-sm"
                    [value]="form.countryCode"
                    readonly
                    required
                  />
                </label>
                <label class="grid gap-2 text-sm font-medium">
                  Currency Code
                  <input
                    class="h-9 rounded-md border border-input bg-muted px-3 text-sm"
                    [value]="form.currencyCode"
                    readonly
                    required
                  />
                </label>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <label class="grid gap-2 text-sm font-medium">
                  Buy Rate
                  <input
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    type="number"
                    step="0.0001"
                    name="buyingRate"
                    [(ngModel)]="form.buyingRate"
                    required
                  />
                </label>
                <label class="grid gap-2 text-sm font-medium">
                  Sell Rate
                  <input
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    type="number"
                    step="0.0001"
                    name="sellingRate"
                    [(ngModel)]="form.sellingRate"
                    required
                  />
                </label>
              </div>
              <button uiBtn class="w-full">
                {{ editing() ? 'Update' : 'Create' }} Rate
              </button>
            </div>
          </form>
        </div>
      }

      @if (duplicateError()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          (click)="duplicateError.set(null)"
        >
          <div
            class="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            (click)="$event.stopPropagation()"
          >
            <h3 class="text-lg font-semibold">Duplicate Country Entry</h3>
            <p class="mt-2 text-sm text-muted-foreground">{{ duplicateError() }}</p>
            <div class="mt-6 flex justify-end">
              <button uiBtn (click)="duplicateError.set(null)">OK</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ExchangePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Plus, Search, X, Pencil, Trash2, GripVertical };
  readonly countryList = countries;
  readonly rates = signal<Rate[]>([]);
  readonly loading = signal(true);
  readonly reordering = signal(false);
  readonly dialogOpen = signal(false);
  readonly editing = signal<Rate | null>(null);
  readonly duplicateError = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly itemsPerPage = 10;

  private readonly _searchQuery = signal('');
  get searchQuery() {
    return this._searchQuery();
  }
  set searchQuery(value: string) {
    this._searchQuery.set(value);
  }
  private readonly _countryFilter = signal('all');
  get countryFilter() {
    return this._countryFilter();
  }
  set countryFilter(value: string) {
    this._countryFilter.set(value);
  }
  form = {
    countryName: '',
    countryCode: '',
    currencyCode: '',
    buyingRate: '' as string | number,
    sellingRate: '' as string | number,
  };

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    return this.rates().filter((rate) => {
      const matchesSearch =
        !q ||
        rate.countryName.toLowerCase().includes(q) ||
        rate.currencyCode.toLowerCase().includes(q) ||
        rate.countryCode.toLowerCase().includes(q);
      const matchesCountry =
        this.countryFilter === 'all' || rate.countryCode === this.countryFilter;
      return matchesSearch && matchesCountry;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.itemsPerPage)),
  );

  readonly pageRows = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.filtered().slice(start, start + this.itemsPerPage);
  });

  readonly countryCodes = computed(() =>
    Array.from(new Set(this.rates().map((r) => r.countryCode))),
  );

  isFiltered() {
    return !!this.searchQuery.trim() || this.countryFilter !== 'all';
  }

  countryNameFor(code: string) {
    return this.rates().find((r) => r.countryCode === code)?.countryName || code;
  }

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Rate[]>('/api/bank/exchange-rates');
      this.rates.set(Array.isArray(data) ? data : []);
    } catch {
      this.rates.set([]);
      this.toast.error('Failed to fetch exchange rates');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editing.set(null);
    this.form = {
      countryName: '',
      countryCode: '',
      currencyCode: '',
      buyingRate: '',
      sellingRate: '',
    };
    this.dialogOpen.set(true);
  }

  openEdit(rate: Rate) {
    this.editing.set(rate);
    const country = countries.find((c) => c.name === rate.countryName) || null;
    this.form = {
      countryName: rate.countryName,
      countryCode: country?.code || rate.countryCode,
      currencyCode: country?.currency || rate.currencyCode,
      buyingRate: rate.buyingRate,
      sellingRate: rate.sellingRate,
    };
    this.dialogOpen.set(true);
  }

  closeDialog() {
    this.dialogOpen.set(false);
    this.editing.set(null);
  }

  onCountryChange(name: string) {
    const country: Country | undefined = countries.find((c) => c.name === name);
    this.form.countryName = name;
    this.form.countryCode = country?.code || '';
    this.form.currencyCode = country?.currency || '';
  }

  async save() {
    const body = {
      countryName: this.form.countryName,
      countryCode: this.form.countryCode,
      currencyCode: this.form.currencyCode,
      buyingRate: Number(this.form.buyingRate),
      sellingRate: Number(this.form.sellingRate),
    };
    try {
      const editing = this.editing();
      if (editing) {
        await this.api.put(`/api/bank/exchange-rates/${editing.id}`, body);
        this.toast.success('Exchange rate updated successfully');
      } else {
        await this.api.post('/api/bank/exchange-rates', body);
        this.toast.success('Exchange rate created successfully');
      }
      this.closeDialog();
      await this.reload();
    } catch (error: unknown) {
      const http = error as HttpErrorResponse;
      const payload = http?.error as { error?: string; message?: string } | undefined;
      if (http?.status === 409 || payload?.error === 'DUPLICATE_COUNTRY') {
        this.duplicateError.set(
          payload?.message ||
            'An exchange rate for this country already exists. Each country can only have one exchange rate entry.',
        );
        return;
      }
      this.toast.error(
        payload?.message ||
          payload?.error ||
          `Failed to ${this.editing() ? 'update' : 'create'} exchange rate`,
      );
    }
  }

  async remove(rate: Rate) {
    try {
      await this.api.delete(`/api/bank/exchange-rates/${rate.id}`);
      this.toast.success('Exchange rate deleted successfully');
      await this.reload();
    } catch {
      this.toast.error('Failed to delete exchange rate');
    }
  }

  async onDrop(event: CdkDragDrop<Rate[]>) {
    if (event.previousIndex === event.currentIndex || this.isFiltered()) return;

    const previous = [...this.rates()];
    const pageStart = (this.currentPage() - 1) * this.itemsPerPage;
    const full = [...this.rates()];
    const from = pageStart + event.previousIndex;
    const to = pageStart + event.currentIndex;
    moveItemInArray(full, from, to);
    this.rates.set(full);

    this.reordering.set(true);
    try {
      await this.api.put('/api/bank/exchange-rates/reorder', {
        ids: full.map((r) => r.id),
        rates: full.map((r, index) => ({ id: r.id, displayOrder: index })),
      });
      this.toast.success('Exchange rates reordered successfully');
    } catch {
      this.rates.set(previous);
      this.toast.error('Failed to reorder exchange rates');
    } finally {
      this.reordering.set(false);
    }
  }
}
