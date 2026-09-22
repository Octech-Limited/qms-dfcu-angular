import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Building2, LucideAngularModule, MapPin } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ratingHeaders } from '../../core/public-config';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
} from '../../shared/ui/ui';

type Branch = { id: string; name: string; address: string };

@Component({
  selector: 'app-feedback-login',
  imports: [LucideAngularModule, UiButton, UiCard, UiCardHeader, UiCardTitle, UiCardContent],
  template: `
    <div class="min-h-screen bg-gray-100 py-8">
      @if (loading()) {
        <div class="flex min-h-[60vh] items-center justify-center">
          <div class="text-center">
            <div
              class="mx-auto mb-4 size-12 animate-spin rounded-full border-b-2 border-primary"
            ></div>
            <p class="text-muted-foreground">Loading branches...</p>
          </div>
        </div>
      } @else if (error()) {
        <div class="flex min-h-[60vh] items-center justify-center p-6">
          <ui-card class="w-full max-w-md">
            <ui-card-header>
              <ui-card-title class="text-center">Error</ui-card-title>
            </ui-card-header>
            <ui-card-content class="space-y-4 text-center">
              <p class="text-muted-foreground">{{ error() }}</p>
              <button uiBtn extraClass="w-full" (click)="reload()">Try Again</button>
            </ui-card-content>
          </ui-card>
        </div>
      } @else {
        <div class="mx-auto max-w-6xl px-4">
          <div class="mb-8 text-center">
            <div class="mb-4 flex items-center justify-center text-primary">
              <lucide-angular [img]="icons.Building2" class="size-12"></lucide-angular>
            </div>
            <h1 class="mb-2 text-3xl font-bold text-primary">Select Your Branch</h1>
            <p class="text-lg text-muted-foreground">
              Choose your branch to access the feedback system
            </p>
          </div>

          <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            @for (branch of branches(); track branch.id) {
              <ui-card
                class="cursor-pointer transition-shadow hover:shadow-lg"
                (click)="go(branch.id)"
              >
                <ui-card-header>
                  <ui-card-title class="flex items-center text-lg">
                    <lucide-angular
                      [img]="icons.Building2"
                      class="mr-2 size-5 text-primary"
                    ></lucide-angular>
                    {{ branch.name }}
                  </ui-card-title>
                </ui-card-header>
                <ui-card-content>
                  <div class="flex items-start text-sm text-muted-foreground">
                    <lucide-angular
                      [img]="icons.MapPin"
                      class="mr-2 mt-0.5 size-4 shrink-0"
                    ></lucide-angular>
                    <span>{{ branch.address }}</span>
                  </div>
                  <button
                    uiBtn
                    extraClass="w-full mt-4"
                    (click)="go(branch.id); $event.stopPropagation()"
                  >
                    Rate Service
                  </button>
                </ui-card-content>
              </ui-card>
            }
          </div>

          @if (branches().length === 0) {
            <div class="py-12 text-center">
              <lucide-angular
                [img]="icons.Building2"
                class="mx-auto mb-4 size-16 text-muted-foreground/50"
              ></lucide-angular>
              <h3 class="mb-2 text-lg font-medium text-muted-foreground">No Branches Available</h3>
              <p class="text-muted-foreground/80">
                Please contact your administrator to add branches.
              </p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class FeedbackLoginPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  branches = signal<Branch[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  readonly icons = { Building2, MapPin };

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.branches.set(
        await this.api.get<Branch[]>('/api/bank/ratings/branches', undefined, {
          headers: ratingHeaders(),
        })
      );
    } catch {
      this.error.set('Failed to load branches');
    } finally {
      this.loading.set(false);
    }
  }

  reload() {
    void this.load();
  }

  go(id: string) {
    void this.router.navigateByUrl(`/RateService/${id}`);
  }
}
