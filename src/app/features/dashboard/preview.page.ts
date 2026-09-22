import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Maximize2, Minimize2 } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { UiButton } from '../../shared/ui/ui';
import { HallDisplayViewComponent } from '../hall/hall-display-view.component';

type Branch = { id: string; name: string };

@Component({
  selector: 'app-preview',
  imports: [FormsModule, LucideAngularModule, UiButton, HallDisplayViewComponent],
  template: `
    <div class="-m-4 flex min-h-[calc(100vh-4rem)] flex-col md:-m-6">
      <div
        class="flex flex-wrap items-center justify-end gap-2 bg-primary px-4 py-3 text-primary-foreground"
      >
        <select
          class="h-9 w-[220px] rounded-md border-0 bg-primary-foreground px-3 text-sm text-primary outline-none disabled:opacity-60"
          [(ngModel)]="selectedBranch"
          [disabled]="loadingBranches() || branches().length === 0"
        >
          @if (!branches().length) {
            <option value="">Select branch</option>
          }
          @for (branch of branches(); track branch.id) {
            <option [value]="branch.id">{{ branch.name }}</option>
          }
        </select>
        <button
          uiBtn
          size="sm"
          variant="outline"
          extraClass="gap-2 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          [disabled]="!selectedBranch"
          (click)="toggleFullscreen()"
        >
          @if (isFullscreen()) {
            <lucide-angular [img]="icons.Minimize2" class="size-4"></lucide-angular>
            Exit fullscreen
          } @else {
            <lucide-angular [img]="icons.Maximize2" class="size-4"></lucide-angular>
            Fullscreen
          }
        </button>
      </div>

      <div class="min-h-0 flex-1 px-5 pb-5 pt-4">
        <div
          #previewContainer
          class="relative h-[calc(100vh-8.5rem)] w-full overflow-hidden rounded-md border border-border bg-background"
        >
          @if (isFullscreen()) {
            <div class="absolute right-3 top-3 z-[60] flex items-center gap-2">
              <select
                class="h-9 w-[200px] rounded-md border border-input bg-background px-3 text-sm"
                [(ngModel)]="selectedBranch"
                [disabled]="branches().length === 0"
              >
                @for (branch of branches(); track branch.id) {
                  <option [value]="branch.id">{{ branch.name }}</option>
                }
              </select>
              <button uiBtn size="sm" variant="secondary" class="gap-2 shadow" (click)="toggleFullscreen()">
                <lucide-angular [img]="icons.Minimize2" class="size-4"></lucide-angular>
                Exit fullscreen
              </button>
            </div>
          }

          @if (selectedBranch) {
            <app-hall-display-view
              [branchId]="selectedBranch"
              [preview]="true"
              [fillParent]="true"
              [sessionLabel]="selectedBranchName()"
            />
          } @else {
            <div class="flex h-full items-center justify-center text-lg text-muted-foreground">
              {{
                loadingBranches()
                  ? 'Loading branches…'
                  : 'Select a branch to preview its hall display'
              }}
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class PreviewPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly platform = inject(PLATFORM_ID);

  @ViewChild('previewContainer') previewContainer?: ElementRef<HTMLDivElement>;

  readonly icons = { Maximize2, Minimize2 };
  readonly branches = signal<Branch[]>([]);
  readonly loadingBranches = signal(true);
  readonly isFullscreen = signal(false);
  selectedBranch = '';

  private onFullscreenChange = () => {
    this.isFullscreen.set(!!document.fullscreenElement);
  };

  selectedBranchName() {
    return this.branches().find((b) => b.id === this.selectedBranch)?.name || 'Preview';
  }

  async ngOnInit() {
    if (!isPlatformBrowser(this.platform)) return;
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    try {
      const data = await this.api.get<Branch[]>('/api/bank/branches');
      this.branches.set(Array.isArray(data) ? data : []);
      if (data?.length) this.selectedBranch = data[0].id;
    } catch {
      this.branches.set([]);
    } finally {
      this.loadingBranches.set(false);
    }
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platform)) {
      document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    }
  }

  async toggleFullscreen() {
    const el = this.previewContainer?.nativeElement;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }
}
