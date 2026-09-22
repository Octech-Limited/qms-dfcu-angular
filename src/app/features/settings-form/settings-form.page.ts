import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Building2, LoaderCircle, LucideAngularModule } from 'lucide-angular';
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
  selector: 'app-settings-form',
  imports: [
    FormsModule,
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
      <ui-card class="w-full max-w-xl">
        <ui-card-header>
          <div
            class="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <lucide-angular [img]="buildingIcon" class="size-5"></lucide-angular>
          </div>
          <ui-card-title>Initial settings</ui-card-title>
          <ui-card-description
            >Configure your organisation before using Q Simplified.</ui-card-description
          >
        </ui-card-header>
        <ui-card-content>
          <form class="grid gap-4 sm:grid-cols-2" (ngSubmit)="save()">
            @for (field of fields; track field.name) {
              <label class="grid gap-2 text-sm font-medium" [class.sm:col-span-2]="field.wide">
                {{ field.label }}
                <input
                  class="glass-input h-9 w-full rounded-md border px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
                  [type]="field.type"
                  [placeholder]="field.placeholder"
                  [(ngModel)]="this[field.name]"
                  [name]="field.name"
                  required
                />
              </label>
            }
            <button uiBtn extraClass="sm:col-span-2 w-full" [disabled]="saving">
              @if (saving) {
                <lucide-angular [img]="loaderIcon" class="size-4 animate-spin"></lucide-angular>
                Saving...
              } @else {
                Save settings
              }
            </button>
          </form>
        </ui-card-content>
      </ui-card>
    </div>
  `,
})
export class SettingsFormPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  companyName = '';
  email = '';
  contact = '';
  address = '';
  notificationText = 'Welcome';
  password = '';
  saving = false;
  readonly buildingIcon = Building2;
  readonly loaderIcon = LoaderCircle;
  readonly fields: {
    name: 'companyName' | 'email' | 'contact' | 'address' | 'notificationText' | 'password';
    label: string;
    placeholder: string;
    type: string;
    wide?: boolean;
  }[] = [
    {
      name: 'companyName',
      label: 'Company name',
      placeholder: 'Enter company name',
      type: 'text',
      wide: true,
    },
    { name: 'email', label: 'Email', placeholder: 'admin@example.com', type: 'email' },
    { name: 'contact', label: 'Contact', placeholder: 'Phone number', type: 'tel' },
    { name: 'address', label: 'Address', placeholder: 'Company address', type: 'text', wide: true },
    {
      name: 'notificationText',
      label: 'Notification text',
      placeholder: 'Welcome message',
      type: 'text',
      wide: true,
    },
    {
      name: 'password',
      label: 'Admin password',
      placeholder: 'Create a secure password',
      type: 'password',
      wide: true,
    },
  ];

  async save() {
    this.saving = true;
    try {
      await this.api.post('/api/bank/settings', {
        companyType: 'bank',
        companyName: this.companyName,
        email: this.email,
        contact: this.contact,
        address: this.address,
        notificationText: this.notificationText,
        password: this.password,
        timezone: 'Africa/Kampala',
      });
      this.toast.show('Settings saved');
      await this.router.navigateByUrl('/adminLoginLocal');
    } catch {
      this.toast.error('Failed to save settings');
    } finally {
      this.saving = false;
    }
  }
}
