import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Eye, EyeOff, LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { APP_TIMEZONE } from '../../core/timezone';
import { ToastService } from '../../core/toast.service';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardHeader,
  UiCardTitle,
  UiQueueSpinner,
} from '../../shared/ui/ui';

type SettingsForm = {
  companyName: string;
  email: string;
  contact: string;
  address: string;
  timezone: string;
  defaultLanguage: string;
  notificationText: string;
  logoImage: string;
  password: string;
};

@Component({
  selector: 'app-dashboard-settings',
  imports: [
    FormsModule,
    LucideAngularModule,
    UiButton,
    UiCard,
    UiCardHeader,
    UiCardTitle,
    UiCardContent,
    UiQueueSpinner,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <h1 class="text-xl font-bold tracking-tight">Manage company settings</h1>

      @if (loading()) {
        <div class="flex h-48 items-center justify-center">
          <ui-queue-spinner size="lg" [dotCount]="12" />
        </div>
      } @else {
        <form class="flex flex-col gap-8" (ngSubmit)="save()">
          <ui-card class="gap-0 py-0">
            <ui-card-header class="pt-6">
              <ui-card-title>General Information</ui-card-title>
            </ui-card-header>
            <ui-card-content class="space-y-4 pb-6">
              <div class="grid gap-4 md:grid-cols-2">
                <label class="grid gap-2 text-sm font-medium">
                  Company Name
                  <input
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    name="companyName"
                    [(ngModel)]="form.companyName"
                  />
                </label>
                <label class="grid gap-2 text-sm font-medium">
                  Email
                  <input
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    type="email"
                    name="email"
                    [(ngModel)]="form.email"
                  />
                </label>
                <label class="grid gap-2 text-sm font-medium">
                  Contact Number
                  <input
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    name="contact"
                    [(ngModel)]="form.contact"
                  />
                </label>
              </div>
              <label class="grid gap-2 text-sm font-medium">
                Address
                <textarea
                  class="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  name="address"
                  [(ngModel)]="form.address"
                ></textarea>
              </label>
            </ui-card-content>
          </ui-card>

          <ui-card class="gap-0 py-0">
            <ui-card-header class="pt-6">
              <ui-card-title>Localization</ui-card-title>
            </ui-card-header>
            <ui-card-content class="pb-6">
              <div class="grid gap-4 md:grid-cols-2">
                <label class="grid gap-2 text-sm font-medium">
                  Timezone
                  <select
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    name="timezone"
                    [(ngModel)]="form.timezone"
                  >
                    <option [value]="appTimezone">Africa/Kampala (EAT)</option>
                  </select>
                </label>
                <label class="grid gap-2 text-sm font-medium">
                  Default Language
                  <select
                    class="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    name="defaultLanguage"
                    [(ngModel)]="form.defaultLanguage"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </label>
              </div>
            </ui-card-content>
          </ui-card>

          <ui-card class="gap-0 py-0">
            <ui-card-header class="pt-6">
              <ui-card-title>Display Settings</ui-card-title>
            </ui-card-header>
            <ui-card-content class="space-y-4 pb-6">
              <label class="grid gap-2 text-sm font-medium">
                Notification Banner Text
                <textarea
                  class="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  name="notificationText"
                  [(ngModel)]="form.notificationText"
                  placeholder="Enter text to display on the notification banner..."
                ></textarea>
              </label>
              <div class="grid gap-2 text-sm font-medium">
                <span>Logo Image</span>
                <input
                  class="h-9 rounded-md border border-input bg-background px-3 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
                  type="file"
                  accept="image/*"
                  (change)="onLogoChange($event)"
                />
                @if (form.logoImage) {
                  <div class="mt-2">
                    <img
                      [src]="form.logoImage"
                      alt="Company Logo"
                      class="h-[150px] w-[150px] rounded-md object-contain"
                    />
                  </div>
                }
              </div>
            </ui-card-content>
          </ui-card>

          <ui-card class="gap-0 py-0">
            <ui-card-header class="pt-6">
              <ui-card-title>Admin Access</ui-card-title>
            </ui-card-header>
            <ui-card-content class="space-y-2 pb-6">
              <label class="grid gap-2 text-sm font-medium">
                New Admin Password
                <div class="relative">
                  <input
                    class="h-9 w-full rounded-md border border-input bg-background px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    [type]="showPassword() ? 'text' : 'password'"
                    name="password"
                    [(ngModel)]="form.password"
                    placeholder="Enter new password to change"
                    autocomplete="new-password"
                  />
                  <button
                    uiBtn
                    type="button"
                    variant="ghost"
                    size="icon"
                    extraClass="absolute right-0 top-0"
                    (click)="showPassword.update((v) => !v)"
                  >
                    <lucide-angular
                      [img]="showPassword() ? icons.EyeOff : icons.Eye"
                      class="size-4"
                    ></lucide-angular>
                  </button>
                </div>
              </label>
              <p class="text-xs text-muted-foreground">
                Minimum 8 characters with uppercase, lowercase, number, and special character.
                Prohibited: ', ", ;, \`, \\, $, /, &lt;, &gt;
              </p>
            </ui-card-content>
          </ui-card>

          <button uiBtn size="lg" [disabled]="saving()">
            @if (saving()) {
              <ui-queue-spinner size="sm" />
            }
            Save Changes
          </button>
        </form>
      }
    </div>
  `,
})
export class DashboardSettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly icons = { Eye, EyeOff };
  readonly appTimezone = APP_TIMEZONE;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showPassword = signal(false);

  form: SettingsForm = this.emptyForm();

  async ngOnInit() {
    await this.load();
  }

  emptyForm(): SettingsForm {
    return {
      companyName: '',
      email: '',
      contact: '',
      address: '',
      timezone: APP_TIMEZONE,
      defaultLanguage: 'en',
      notificationText: '',
      logoImage: '',
      password: '',
    };
  }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Partial<SettingsForm>>('/api/bank/settings');
      this.form = {
        ...this.emptyForm(),
        companyName: data?.companyName ?? '',
        email: data?.email ?? '',
        contact: data?.contact ?? '',
        address: data?.address ?? '',
        defaultLanguage: data?.defaultLanguage || 'en',
        notificationText: data?.notificationText ?? '',
        logoImage: typeof data?.logoImage === 'string' ? data.logoImage : '',
        password: '',
        timezone: APP_TIMEZONE,
      };
    } catch {
      this.toast.error('Failed to fetch settings. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async onLogoChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const uploaded = await this.api.post<{ url: string }>('/api/bank/settings/images', {
        filename: file.name,
        data,
      });
      this.form.logoImage = uploaded.url;
      this.toast.success('Logo uploaded');
    } catch {
      this.toast.error('Failed to upload logo');
    }
  }

  async save() {
    this.saving.set(true);
    try {
      const body: Record<string, string> = {
        companyName: this.form.companyName,
        email: this.form.email,
        contact: this.form.contact,
        address: this.form.address,
        timezone: APP_TIMEZONE,
        defaultLanguage: this.form.defaultLanguage,
        notificationText: this.form.notificationText,
        logoImage: this.form.logoImage,
      };
      if (this.form.password.trim()) {
        body['password'] = this.form.password.trim();
      }
      await this.api.put('/api/bank/settings', body);
      this.form.password = '';
      this.toast.success('Settings updated successfully.');
      await this.load();
    } catch {
      this.toast.error('Failed to update settings. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
