import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Eye, EyeOff, LoaderCircle, LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardDescription,
  UiCardHeader,
  UiCardTitle,
} from '../../shared/ui/ui';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    RouterLink,
    LucideAngularModule,
    UiButton,
    UiCard,
    UiCardHeader,
    UiCardTitle,
    UiCardDescription,
    UiCardContent,
  ],
  template: `
    <div class="app-login-bg flex min-h-screen items-center justify-center bg-cover bg-center p-6">
      <ui-card class="w-[350px] max-w-full">
        <ui-card-header class="justify-items-center text-center">
          @if (logoImage()) {
            <div class="mb-2 flex items-center justify-center rounded-lg bg-primary px-4 py-2">
              <img
                [src]="logoImage()"
                alt="Company logo"
                class="h-16 w-auto max-w-[200px] object-contain"
              />
            </div>
          }
          <ui-card-title>{{ title }}</ui-card-title>
          <ui-card-description>{{ description }}</ui-card-description>
        </ui-card-header>
        <ui-card-content>
          <form class="space-y-4" (ngSubmit)="submit()">
            <label class="grid gap-2 text-sm font-medium">
              {{ mode === 'admin' ? 'Admin email' : 'Username' }}
              <input
                class="glass-input h-9 w-full rounded-md border px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
                [(ngModel)]="username"
                name="username"
                autocomplete="username"
                [placeholder]="mode === 'admin' ? 'Enter your email' : 'Enter your username'"
                required
              />
            </label>
            <label class="grid gap-2 text-sm font-medium">
              Password
              <span class="relative">
                <input
                  class="glass-input h-9 w-full rounded-md border px-3 pr-10 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="password"
                  name="password"
                  autocomplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <button
                  uiBtn
                  type="button"
                  variant="ghost"
                  size="icon"
                  extraClass="absolute right-0 top-0 text-muted-foreground hover:text-foreground"
                  (click)="showPassword.set(!showPassword())"
                  [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                >
                  <lucide-angular
                    [img]="showPassword() ? icons.EyeOff : icons.Eye"
                    class="size-4"
                  ></lucide-angular>
                </button>
              </span>
            </label>
            <button uiBtn extraClass="w-full" type="submit" [disabled]="loading()">
              @if (loading()) {
                <lucide-angular
                  [img]="icons.LoaderCircle"
                  class="size-4 animate-spin"
                ></lucide-angular>
                Logging in...
              } @else {
                Sign in
              }
            </button>
            <a class="block text-center text-sm text-primary hover:underline" routerLink="/"
              >Back to home</a
            >
          </form>
        </ui-card-content>
      </ui-card>
    </div>
  `,
})
export class LoginPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  mode = 'user';
  title = 'User Login';
  description = 'Enter your credentials to log in';
  username = '';
  password = '';
  loading = signal(false);
  showPassword = signal(false);
  logoImage = signal<string | null>(null);
  readonly icons = { Eye, EyeOff, LoaderCircle };

  ngOnInit() {
    this.mode = String(this.route.snapshot.data['mode'] || 'user');
    void this.loadLogo();
    this.title =
      this.mode === 'admin'
        ? 'Admin Login'
        : this.mode === 'teller'
          ? 'Teller Login'
          : this.mode === 'kiosk'
            ? 'Kiosk Login'
            : this.mode === 'display'
              ? 'Hall Display Login'
              : 'User Login';
    this.description =
      this.mode === 'teller'
        ? 'Sign in to start serving customers'
        : this.mode === 'kiosk'
          ? 'Enter the kiosk credentials'
          : this.mode === 'display'
            ? 'Enter the hall display credentials'
            : 'Enter your credentials to log in';
  }

  private async loadLogo() {
    try {
      const settings = await this.api.get<{ logoImage?: string | null }>('/api/bank/settings');
      const logo = settings?.logoImage;
      this.logoImage.set(typeof logo === 'string' && logo ? logo : null);
    } catch {
      this.logoImage.set(null);
    }
  }

  async submit() {
    this.loading.set(true);
    try {
      const path =
        this.mode === 'teller'
          ? '/api/bank/tellerLogin'
          : this.mode === 'kiosk'
            ? '/api/bank/kiosk-login'
            : this.mode === 'display'
              ? '/api/bank/display-login'
              : '/api/bank/login';
      await this.api.post(path, {
        username: this.username,
        email: this.username,
        password: this.password,
        isAdminLogin: this.mode === 'admin',
      });
      const dest =
        this.mode === 'teller'
          ? '/serving'
          : this.mode === 'kiosk'
            ? '/kioskDisplay'
            : this.mode === 'display'
              ? '/hallDisplay'
              : '/dashboard/home';
      await this.router.navigateByUrl(dest);
    } catch (error: unknown) {
      const err = error as { error?: { error?: string } };
      this.toast.error(err.error?.error || 'Login failed');
    } finally {
      this.loading.set(false);
    }
  }
}
