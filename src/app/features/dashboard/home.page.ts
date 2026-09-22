import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
} from 'chart.js';
import { ArrowRightCircle, CheckSquare, Clock3, LucideAngularModule, Users } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { UiCard, UiCardContent, UiCardHeader, UiCardTitle } from '../../shared/ui/ui';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
);

@Component({
  selector: 'app-dashboard-home',
  imports: [LucideAngularModule, UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Dashboard Overview</h2>
        <p class="text-sm text-muted-foreground">Monitor today's queue activity in real time.</p>
      </div>
      @if (branches().length) {
        <select
          class="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:ring-2 focus:ring-ring/40"
          [value]="branchId()"
          (change)="onBranch($event)"
        >
          @for (branch of branches(); track branch.id) {
            <option [value]="branch.id">{{ branch.name }}</option>
          }
        </select>
      }
    </div>
    <div class="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      @for (card of cards(); track card.label) {
        <ui-card class="gap-0">
          <ui-card-header class="flex flex-row items-center justify-between space-y-0 pb-2">
            <ui-card-title class="text-sm font-medium">{{ card.label }}</ui-card-title>
            <lucide-angular [img]="card.icon" class="size-4 text-muted-foreground"></lucide-angular>
          </ui-card-header>
          <ui-card-content>
            <div class="text-2xl font-bold">{{ card.value }}</div>
            <p class="text-xs text-muted-foreground">{{ card.note }}</p>
          </ui-card-content>
        </ui-card>
      }
    </div>
    <ui-card>
      <ui-card-header><ui-card-title>Tickets Per Hour</ui-card-title></ui-card-header>
      <ui-card-content class="h-80">
        <canvas #chartCanvas></canvas>
      </ui-card-content>
    </ui-card>
  `,
})
export class DashboardHomePage implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private readonly platform = inject(PLATFORM_ID);
  readonly stats = signal<{
    totalTickets: number;
    ticketsServed: number;
    waitingTickets: number;
    inProgressTickets: number;
    ticketsPerHour: number[];
  } | null>(null);
  readonly branches = signal<{ id: string; name: string }[]>([]);
  readonly branchId = signal('');
  private chart?: Chart;

  cards() {
    const stats = this.stats();
    return [
      {
        label: 'Total Tickets',
        value: stats?.totalTickets ?? 0,
        note: "Today's total",
        icon: Users,
      },
      {
        label: 'Tickets Served',
        value: stats?.ticketsServed ?? 0,
        note: 'Completed tickets',
        icon: CheckSquare,
      },
      {
        label: 'Waiting Tickets',
        value: stats?.waitingTickets ?? 0,
        note: 'Not Served',
        icon: Clock3,
      },
      {
        label: 'In Progress',
        value: stats?.inProgressTickets ?? 0,
        note: 'Serving',
        icon: ArrowRightCircle,
      },
    ];
  }

  async ngAfterViewInit() {
    try {
      this.branches.set(await this.api.get('/api/bank/branches'));
    } catch {
      this.branches.set([]);
    }
    this.branchId.set(this.session.session().branchId || this.branches()[0]?.id || '');
    await this.load();
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }

  async onBranch(event: Event) {
    this.branchId.set((event.target as HTMLSelectElement).value);
    await this.load();
  }

  private async load() {
    const branchId = this.branchId();
    if (!branchId) return;
    const stats = await this.api.get<NonNullable<ReturnType<typeof this.stats>>>(
      '/api/bank/dashboard',
      { branchId },
    );
    this.stats.set(stats);
    const el = this.canvas()?.nativeElement;
    if (!el || !isPlatformBrowser(this.platform)) return;
    this.chart?.destroy();
    const styles = getComputedStyle(document.documentElement);
    const borderColor = styles.getPropertyValue('--primary').trim() || '#0e4480';
    const backgroundColor =
      styles.getPropertyValue('--primary-200').trim() || 'rgba(14,68,128,0.12)';
    this.chart = new Chart(el, {
      type: 'line',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => String(i)),
        datasets: [
          {
            label: 'Tickets / hour',
            data: stats.ticketsPerHour,
            borderColor,
            backgroundColor,
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Hour of Day' }, grid: { display: false } },
          y: { display: false, beginAtZero: true, grid: { display: false } },
        },
      },
    });
  }
}
