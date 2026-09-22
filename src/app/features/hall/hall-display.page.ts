import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { HallDisplayViewComponent } from './hall-display-view.component';

type DisplaySession = {
  branchId?: string;
  isLoggedIn?: boolean;
  hallDisplayUsername?: string;
};

@Component({
  selector: 'app-hall-display',
  imports: [HallDisplayViewComponent],
  template: `
    @if (ready()) {
      <app-hall-display-view
        [branchId]="branchId()"
        [preview]="false"
        [hallDisplayUsername]="username()"
        [sessionLabel]="username()"
        [logout]="logoutFn"
      />
    } @else {
      <div class="flex min-h-screen items-center justify-center">
        <div class="text-center text-2xl text-muted-foreground">Checking session...</div>
      </div>
    }
  `,
})
export class HallDisplayPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly platform = inject(PLATFORM_ID);

  readonly branchId = signal('');
  readonly username = signal('');
  readonly ready = signal(false);
  readonly logoutFn = () => this.logout();

  private pollTimer?: ReturnType<typeof setInterval>;

  async ngOnInit() {
    if (!isPlatformBrowser(this.platform)) return;
    await this.fetchSession();
    this.pollTimer = setInterval(() => void this.fetchSession(), 30_000);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async fetchSession() {
    try {
      const session = await this.api.get<DisplaySession>('/api/displaySession');
      if (!session.isLoggedIn || !session.hallDisplayUsername || !session.branchId) {
        location.href = '/displayLogin';
        return;
      }
      this.branchId.set(session.branchId);
      this.username.set(session.hallDisplayUsername);
      this.ready.set(true);
    } catch {
      location.href = '/displayLogin';
    }
  }

  async logout() {
    try {
      await this.api.post('/api/displayLogout');
      this.ready.set(false);
      location.href = '/displayLogin';
    } catch {
      this.toast.error('Failed to logout. Please try again.');
    }
  }
}
