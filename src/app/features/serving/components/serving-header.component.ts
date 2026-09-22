import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BarChart3, LucideAngularModule } from 'lucide-angular';
import { UiButton } from '../../../shared/ui/ui';
import type { ActiveCounter } from '../types';

@Component({
  selector: 'app-serving-header',
  imports: [RouterLink, LucideAngularModule, UiButton],
  template: `
    <div class="mb-8 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">
          @if (activeCounter) {
            Managing {{ activeCounter.queue.name || 'Queue' }} at Counter
            {{ activeCounter.counterNumber }}
          } @else {
            Serving Console
          }
        </h2>
        <p class="text-sm text-muted-foreground">Serve customers and manage your counter</p>
      </div>
      <a uiBtn variant="outline" routerLink="/serving/reports" class="gap-2">
        <lucide-angular [img]="icons.BarChart3" class="size-4"></lucide-angular>
        Reports
      </a>
    </div>
  `,
})
export class ServingHeaderComponent {
  @Input() activeCounter: ActiveCounter | null = null;
  readonly icons = { BarChart3 };
}
