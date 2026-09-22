import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BarChart3, Clock3, LucideAngularModule, Users } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { UiButton } from '../../shared/ui/ui';

@Component({
  selector: 'app-landing',
  imports: [LucideAngularModule, UiButton],
  template: `
    <main
      class="flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat p-6"
      style="background-image: url('/bg.jpg')"
    >
      <div class="w-full max-w-6xl space-y-12">
        <header class="space-y-4 bg-transparent text-center">
          <div class="rounded-full bg-primary p-4">
            <h1 class="text-5xl font-bold text-primary-foreground">Q Simplified</h1>
          </div>
          <p class="mx-auto max-w-2xl text-2xl text-white">
            Transform your customer experience with intelligent queue management
          </p>
        </header>

        <section class="grid gap-8 md:grid-cols-3" aria-label="Product features">
          @for (feature of features; track feature.title; let index = $index) {
            <article
              class="relative h-full px-6 py-8 text-white transition-all duration-300"
              [class.-translate-y-2]="hoveredCard() === index"
              (mouseenter)="hoveredCard.set(index)"
              (mouseleave)="hoveredCard.set(null)"
            >
              <div
                class="mb-4 flex justify-center transition-colors duration-300"
                [class.text-primary]="hoveredCard() === index"
                [class.text-white]="hoveredCard() !== index"
              >
                <lucide-angular
                  [img]="feature.icon"
                  class="size-12"
                  [strokeWidth]="2"
                ></lucide-angular>
              </div>
              <h2 class="mb-2 text-center text-xl font-semibold">{{ feature.title }}</h2>
              <p class="text-center text-white">{{ feature.description }}</p>
            </article>
          }
        </section>

        <nav class="mt-12 flex flex-wrap justify-center gap-4" aria-label="QMS portals">
          @for (action of actions; track action.route) {
            <button
              uiBtn
              size="lg"
              [disabled]="isLoading()"
              (click)="navigate(action.route)"
              extraClass="h-auto rounded-full bg-primary px-8 py-6 text-lg text-primary-foreground transition-all duration-300 hover:scale-105"
            >
              {{ isLoading() && action.route === loadingRoute() ? 'Loading...' : action.label }}
            </button>
          }
        </nav>
      </div>
    </main>
  `,
})
export class LandingPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly settings = signal<{ companyType?: string } | null>(null);
  readonly isLoading = signal(false);
  readonly loadingRoute = signal('');
  readonly hoveredCard = signal<number | null>(null);

  readonly features = [
    {
      icon: Users,
      title: 'Smart Crowd Management',
      description: 'Advanced algorithms to organize and optimize customer flow in real-time',
    },
    {
      icon: Clock3,
      title: 'Minimal Wait Times',
      description: 'Smart predictions and resource allocation to reduce customer waiting',
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Comprehensive dashboards with actionable insights for better decision-making',
    },
  ];

  readonly actions = [
    { route: 'dashboard', label: 'Dashboard' },
    { route: '/displayLogin', label: 'Hall Display' },
    { route: '/tellerLogin', label: 'Agent Portal' },
    { route: '/kioskLogin', label: 'Kiosk Display' },
    { route: '/feedback/login', label: 'Feedback Portal' },
  ];

  async ngOnInit() {
    await this.fetchSettings();
  }

  private async fetchSettings() {
    try {
      const settings = await this.api.get<{ companyType?: string }>('/api/bank/settings');
      this.settings.set(settings && Object.keys(settings).length ? settings : null);
      return this.settings();
    } catch {
      this.settings.set(null);
      return null;
    }
  }

  async navigate(route: string) {
    this.loadingRoute.set(route);
    this.isLoading.set(true);
    try {
      if (route !== 'dashboard') {
        await this.router.navigateByUrl(route);
        return;
      }
      const settings = await this.fetchSettings();
      if (!settings) {
        await this.router.navigateByUrl('/settingsForm');
      } else if (settings.companyType === 'Hospital') {
        await this.router.navigateByUrl('/hospital/login');
      } else if (settings.companyType === 'Bank') {
        await this.router.navigateByUrl('/login');
      } else {
        await this.router.navigateByUrl('/settingsForm');
      }
    } finally {
      this.isLoading.set(false);
      this.loadingRoute.set('');
    }
  }
}
