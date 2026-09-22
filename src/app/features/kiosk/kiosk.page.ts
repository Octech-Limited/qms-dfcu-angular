import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { LogOut, LucideAngularModule, User } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { validateUgandanPhoneNumber } from '../../core/phone';
import { ToastService } from '../../core/toast.service';
import { UiButton, UiQueueSpinner } from '../../shared/ui/ui';

type SubSub = { id: string; name: string };
type SubItem = { id: string; name: string; subSubMenuItems?: SubSub[] };
type Queue = {
  id: string;
  status?: number;
  menuItem: { name: string; subMenuItems?: SubItem[] };
};
type SettingsData = { companyName?: string; logoImage?: string | null };
type BranchData = { id: string; name: string };
type Ad = {
  id: string;
  name?: string;
  image?: string | null;
  video?: string | null;
  youtubeUrl?: string | null;
  isLive?: boolean;
};

type Step = 'pickLanguage' | 'phone' | 'queues' | 'subqueues' | 'subsubqueues';

@Component({
  selector: 'app-kiosk',
  imports: [FormsModule, LucideAngularModule, UiButton, UiQueueSpinner],
  template: `
    @if (loading()) {
      <div class="flex min-h-screen items-center justify-center">
        <ui-queue-spinner size="lg" [dotCount]="12" />
      </div>
    } @else {
      <div
        class="app-backdrop relative flex min-h-screen items-center justify-center p-6 md:p-10"
      >
        @if (showAdsOverlay() && currentAd() && enableAds()) {
          <div
            class="fixed inset-0 z-50 cursor-pointer bg-primary"
            (click)="dismissAds()"
          >
            @if (currentAd()!.youtubeUrl) {
              <iframe
                [src]="youtubeEmbed(currentAd()!.youtubeUrl!, !!currentAd()!.isLive)"
                class="h-full w-full"
                frameborder="0"
                allow="autoplay; encrypted-media"
                allowfullscreen
              ></iframe>
            } @else if (currentAd()!.video) {
              <video
                [src]="currentAd()!.video!"
                class="h-full w-full object-contain"
                autoplay
                muted
                playsinline
                (ended)="onVideoEnded()"
                (play)="isVideoPlaying.set(true)"
                (pause)="isVideoPlaying.set(false)"
              ></video>
            } @else if (currentAd()!.image) {
              <div class="flex h-full w-full items-center justify-center">
                <img
                  [src]="currentAd()!.image!"
                  [alt]="currentAd()!.name || 'Advertisement'"
                  class="max-h-full max-w-full object-contain"
                />
              </div>
            }
          </div>
        }

        <div class="flex w-full max-w-7xl flex-col gap-8">
          <div class="glass rounded-2xl border p-12">
            <div class="mb-8 flex items-center justify-between">
              <div class="flex items-center">
                @if (settings()?.logoImage) {
                  <div class="rounded-lg bg-primary px-4 py-2">
                    <img
                      [src]="settings()!.logoImage!"
                      alt="Company Logo"
                      class="h-[100px] w-auto max-w-[180px] object-contain"
                    />
                  </div>
                } @else {
                  <div
                    class="flex h-44 w-44 items-center justify-center rounded-full bg-primary"
                  >
                    <span class="text-4xl font-bold text-white">HFB</span>
                  </div>
                }
              </div>
              <div class="flex items-center">
                <img
                  src="/octech.jpg"
                  alt="OcTech Logo"
                  class="h-[100px] w-[180px] cursor-pointer object-contain"
                  (click)="onOctechClick()"
                />
              </div>
            </div>
            <div class="text-center">
              <h1 class="text-8xl font-bold uppercase text-primary">WELCOME</h1>
            </div>
          </div>

          <div class="w-full">
            @if (step() === 'pickLanguage' && enableLanguageSelect()) {
              <div class="glass rounded-2xl border p-12">
                <div class="mb-10 text-center">
                  <h2 class="mb-4 text-5xl font-bold text-primary">
                    Choose your language
                  </h2>
                  <p class="text-2xl font-medium text-muted-foreground">
                    Select one option to continue
                  </p>
                </div>
                <div class="mx-auto flex max-w-4xl flex-col gap-6">
                  @for (lang of customerLanguageOptions(); track lang) {
                    <button
                      type="button"
                      class="h-32 rounded-2xl border-2 border-primary bg-white text-3xl font-bold text-primary shadow-lg transition-colors hover:bg-white"
                      (click)="pickCustomerLanguage(lang)"
                    >
                      {{ lang }}
                    </button>
                  }
                </div>
              </div>
            }

            @if (step() === 'phone' && enableSMS()) {
              <div class="glass rounded-2xl border p-12">
                <div class="mb-8 text-center">
                  <h2 class="mb-4 text-5xl font-bold text-primary">
                    Enter your phone number
                  </h2>
                  <p class="text-2xl font-medium text-muted-foreground">
                    Please enter your phone number to continue
                  </p>
                </div>
                <form class="space-y-8" (ngSubmit)="submitPhone()">
                  <div class="space-y-6">
                    <label class="block text-3xl font-bold text-primary" for="phone"
                      >Phone Number</label
                    >
                    <input
                      id="phone"
                      type="tel"
                      class="glass-input h-24 w-full rounded-md border border-primary/30 px-4 text-center text-5xl font-bold text-primary outline-none placeholder:text-muted-foreground focus:ring-4 focus:ring-ring/30"
                      [(ngModel)]="phoneNumber"
                      name="phone"
                      placeholder="Enter your phone number"
                    />
                  </div>
                  <div class="space-y-4">
                    @if (enableLanguageSelect()) {
                      <button
                        type="button"
                        uiBtn
                        variant="secondary"
                        extraClass="w-full h-20 text-2xl font-bold"
                        (click)="backToLanguage()"
                      >
                        Back to language
                      </button>
                    }
                    <button
                      type="submit"
                      uiBtn
                      extraClass="w-full h-20 text-2xl font-bold"
                      [disabled]="!phoneNumber.trim()"
                    >
                      Continue
                    </button>
                  </div>
                </form>
              </div>
            }

            @if (step() === 'queues') {
              <div class="glass rounded-2xl border p-12">
                <div class="mb-10 text-center">
                  <div
                    class="mb-8 inline-block rounded-xl bg-primary px-10 py-5 text-primary-foreground shadow-sm"
                  >
                    <span class="text-3xl font-bold"
                      >Please Select your Preferred Service</span
                    >
                  </div>
                  <p class="text-2xl font-medium text-muted-foreground">
                    {{ customerLabel() }}
                  </p>
                </div>
                <div class="flex flex-col gap-6">
                  @for (queue of queues(); track queue.id) {
                    <button
                      type="button"
                      class="h-32 rounded-2xl border-2 border-primary bg-primary text-3xl font-bold text-primary-foreground shadow-lg"
                      (click)="selectQueue(queue)"
                    >
                      {{ queue.menuItem.name }}
                    </button>
                  } @empty {
                    <p class="py-8 text-center text-2xl text-muted-foreground">
                      Loading queues...
                    </p>
                  }
                </div>
                @if (enableSMS() || enableLanguageSelect()) {
                  <div class="mt-10 text-center">
                    <button
                      type="button"
                      class="rounded-md bg-gray-500 px-16 py-6 text-2xl font-bold text-white"
                      (click)="goBack()"
                    >
                      Back
                    </button>
                  </div>
                }
              </div>
            }

            @if (step() === 'subqueues' && selectedQueue(); as queue) {
              <div class="glass rounded-2xl border p-12">
                <div class="mb-10 text-center">
                  <div
                    class="mb-8 inline-block rounded-xl bg-primary px-10 py-5 text-primary-foreground shadow-sm"
                  >
                    <span class="text-3xl font-bold"
                      >{{ queue.menuItem.name }} Options</span
                    >
                  </div>
                  <p class="text-2xl font-medium text-muted-foreground">
                    {{ customerLabel() }}
                  </p>
                </div>
                <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  @for (sub of queue.menuItem.subMenuItems || []; track sub.id) {
                    <button
                      type="button"
                      class="min-h-28 h-auto break-words whitespace-normal rounded-2xl border-[3px] border-primary bg-primary px-4 py-4 text-2xl font-bold text-primary-foreground shadow-md"
                      (click)="selectSub(sub)"
                    >
                      {{ sub.name }}
                    </button>
                  } @empty {
                    <div class="col-span-full py-8 text-center">
                      <p class="text-2xl text-muted-foreground">
                        No sub-items available for this service.
                      </p>
                    </div>
                  }
                </div>
                <div class="mt-10 flex justify-center">
                  <button
                    type="button"
                    class="rounded-md bg-gray-500 px-16 py-6 text-2xl font-bold text-white"
                    (click)="goBack()"
                  >
                    Back
                  </button>
                </div>
              </div>
            }

            @if (step() === 'subsubqueues' && selectedQueue() && selectedSub(); as sub) {
              <div class="glass rounded-2xl border p-12">
                <div class="mb-10 text-center">
                  <div
                    class="mb-8 inline-block rounded-xl bg-primary px-10 py-5 text-primary-foreground shadow-sm"
                  >
                    <span class="text-3xl font-bold">{{ sub.name }} Options</span>
                  </div>
                  <p class="text-2xl font-medium text-muted-foreground">
                    {{ customerLabel() }}
                  </p>
                </div>
                <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  @for (item of sub.subSubMenuItems || []; track item.id || $index) {
                    <button
                      type="button"
                      class="min-h-28 h-auto break-words whitespace-normal rounded-2xl border-[3px] border-primary bg-primary px-4 py-4 text-2xl font-bold text-primary-foreground shadow-md"
                      (click)="selectSubSub(item)"
                    >
                      {{ item.name }}
                    </button>
                  } @empty {
                    <div class="col-span-full py-8 text-center">
                      <p class="text-2xl text-muted-foreground">
                        No sub-sub-items available for this service.
                      </p>
                    </div>
                  }
                </div>
                <div class="mt-10 flex justify-center">
                  <button
                    type="button"
                    class="rounded-md bg-gray-500 px-16 py-6 text-2xl font-bold text-white"
                    (click)="goBack()"
                  >
                    Back
                  </button>
                </div>
              </div>
            }
          </div>
        </div>

        @if (showTicketDialog()) {
          <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div class="w-full max-w-md rounded-xl border bg-white p-6 text-foreground shadow-xl">
              <h3 class="text-center text-2xl font-semibold text-primary">
                Ticket Created Successfully!
              </h3>
              <div class="py-6 text-center">
                <div class="mb-4 text-lg text-foreground">Your ticket number is:</div>
                <div class="rounded-lg bg-primary/10 p-4 text-4xl font-bold text-primary">
                  {{ ticketNumber() }}
                </div>
                @if (ticketSmsLine()) {
                  <p class="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
                    {{ ticketSmsLine() }}
                  </p>
                }
                <p class="mt-4 text-sm text-muted-foreground">
                  This dialog will close automatically in 5 seconds
                </p>
              </div>
            </div>
          </div>
        }

        @if (creating()) {
          <div class="fixed inset-0 z-[55] flex items-center justify-center bg-black/40">
            <ui-queue-spinner size="lg" [dotCount]="12" />
          </div>
        }

        @if (showStaffMenu()) {
          <div class="fixed bottom-6 left-6 z-50">
            <div class="relative">
              <button
                type="button"
                class="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg"
                (click)="staffPanelOpen.update((v) => !v)"
                aria-label="Staff menu"
              >
                <lucide-angular [img]="icons.User" class="size-6 text-primary-foreground"></lucide-angular>
              </button>
              @if (staffPanelOpen()) {
                <div
                  class="absolute bottom-16 left-0 w-72 rounded-lg border bg-white p-3 text-foreground shadow-lg"
                >
                  <div class="mb-2 px-1 text-sm font-semibold">
                    {{ branch()?.name || 'Branch' }}
                  </div>
                  <div class="my-2 border-t"></div>
                  <label class="flex items-center justify-between px-1 py-1.5 text-sm">
                    <span>Enable SMS</span>
                    <input
                      type="checkbox"
                      class="size-4"
                      [checked]="enableSMS()"
                      (change)="toggleSMS(($any($event.target)).checked)"
                    />
                  </label>
                  <label class="flex items-center justify-between px-1 py-1.5 text-sm">
                    <span>Enable Ads</span>
                    <input
                      type="checkbox"
                      class="size-4"
                      [checked]="enableAds()"
                      (change)="toggleAds(($any($event.target)).checked)"
                    />
                  </label>
                  <label class="flex items-center justify-between gap-2 px-1 py-1.5 text-sm">
                    <span>Language select</span>
                    <input
                      type="checkbox"
                      class="size-4"
                      [checked]="enableLanguageSelect()"
                      (change)="toggleLanguageSelect(($any($event.target)).checked)"
                    />
                  </label>
                  @if (enableLanguageSelect()) {
                    <div class="mt-2 rounded-md border p-3">
                      <p class="mb-3 text-xs text-muted-foreground">
                        English is always offered to customers. Add languages from your
                        audio folders.
                      </p>
                      <label class="mb-2 flex items-center gap-2 text-sm">
                        <input type="checkbox" class="size-4" checked disabled />
                        English
                      </label>
                      @for (lang of audioLanguages(); track lang) {
                        <label class="mb-2 flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            class="size-4"
                            [checked]="selectedLanguages().includes(lang)"
                            (change)="
                              toggleAudioLanguage(lang, ($any($event.target)).checked)
                            "
                          />
                          {{ lang }}
                        </label>
                      }
                    </div>
                  }
                  <div class="my-2 border-t"></div>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                    (click)="logout()"
                  >
                    <lucide-angular [img]="icons.LogOut" class="size-4"></lucide-angular>
                    Logout
                  </button>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class KioskPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly platform = inject(PLATFORM_ID);
  private readonly sanitizer = inject(DomSanitizer);

  readonly icons = { User, LogOut };

  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly step = signal<Step>('phone');
  readonly queues = signal<Queue[]>([]);
  readonly selectedQueue = signal<Queue | null>(null);
  readonly selectedSub = signal<SubItem | null>(null);
  readonly settings = signal<SettingsData | null>(null);
  readonly branch = signal<BranchData | null>(null);
  readonly branchId = signal<string | null>(null);

  readonly enableSMS = signal(true);
  readonly enableLanguageSelect = signal(false);
  readonly enableAds = signal(true);
  readonly audioLanguages = signal<string[]>([]);
  readonly selectedLanguages = signal<string[]>(['English']);
  readonly customerLanguage = signal<string | null>(null);

  readonly ads = signal<Ad[]>([]);
  readonly showAdsOverlay = signal(false);
  readonly currentAdIndex = signal(0);
  readonly isVideoPlaying = signal(false);
  readonly showStaffMenu = signal(false);
  readonly staffPanelOpen = signal(false);
  readonly showTicketDialog = signal(false);
  readonly ticketNumber = signal('');
  readonly ticketSmsLine = signal<string | null>(null);

  phoneNumber = '';
  private logoClicks = 0;
  private languagePrefsHydrated = false;
  private lastActivity = Date.now();
  private inactivityTimer: ReturnType<typeof setInterval> | null = null;
  private adRotateTimer: ReturnType<typeof setTimeout> | null = null;
  private staffHideTimer: ReturnType<typeof setTimeout> | null = null;
  private ticketCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private youtubeCache = new Map<string, SafeResourceUrl>();

  readonly customerLanguageOptions = computed(() => {
    const langs = this.selectedLanguages().filter(
      (l) => l === 'English' || this.audioLanguages().includes(l),
    );
    const set = new Set(langs.length > 0 ? langs : ['English']);
    set.add('English');
    return Array.from(set).sort((a, b) => {
      if (a === 'English') return -1;
      if (b === 'English') return 1;
      return a.localeCompare(b);
    });
  });

  readonly currentAd = computed(() => {
    const list = this.ads();
    if (!list.length) return null;
    return list[this.currentAdIndex() % list.length] ?? null;
  });

  async ngOnInit() {
    if (!isPlatformBrowser(this.platform)) return;

    const savedSms = localStorage.getItem('kioskEnableSMS');
    const smsEnabled = savedSms !== null ? savedSms === 'true' : true;
    if (savedSms !== null) this.enableSMS.set(smsEnabled);

    const savedLang = localStorage.getItem('kioskEnableLanguageSelect');
    const langEnabled = savedLang === 'true';
    if (savedLang !== null) this.enableLanguageSelect.set(langEnabled);

    const savedAds = localStorage.getItem('kioskEnableAds');
    if (savedAds !== null) this.enableAds.set(savedAds === 'true');

    if (langEnabled) this.step.set('pickLanguage');
    else if (!smsEnabled) this.step.set('queues');
    else this.step.set('phone');

    await Promise.all([this.checkSession(), this.fetchSettings(), this.fetchQueues()]);
    if (this.enableLanguageSelect()) await this.loadAudioLanguages();

    this.inactivityTimer = setInterval(() => {
      const idle = Date.now() - this.lastActivity;
      if (
        idle >= 600_000 &&
        this.ads().length > 0 &&
        !this.showAdsOverlay() &&
        this.enableAds()
      ) {
        this.setAdsOverlay(true);
      }
    }, 1000);
  }

  ngOnDestroy() {
    if (this.inactivityTimer) clearInterval(this.inactivityTimer);
    if (this.adRotateTimer) clearTimeout(this.adRotateTimer);
    if (this.staffHideTimer) clearTimeout(this.staffHideTimer);
    if (this.ticketCloseTimer) clearTimeout(this.ticketCloseTimer);
  }

  @HostListener('window:mousedown')
  @HostListener('window:mousemove')
  @HostListener('window:keypress')
  @HostListener('window:scroll')
  @HostListener('window:touchstart')
  @HostListener('window:click')
  onActivity() {
    this.lastActivity = Date.now();
    if (this.showAdsOverlay()) this.showAdsOverlay.set(false);
  }

  customerLabel() {
    const phone = this.phoneNumber.trim()
      ? `Customer: ${this.phoneNumber}`
      : 'Guest Customer';
    const lang =
      this.enableLanguageSelect() && this.customerLanguage()
        ? ` · ${this.customerLanguage()}`
        : '';
    return `${phone}${lang}`;
  }

  youtubeEmbed(url: string, isLive: boolean): SafeResourceUrl {
    const key = `${url}|${isLive}`;
    const cached = this.youtubeCache.get(key);
    if (cached) return cached;
    const id = this.youtubeId(url);
    const embed = id
      ? isLive
        ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${id}`
        : `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0`
      : '';
    const safe = this.sanitizer.bypassSecurityTrustResourceUrl(embed);
    this.youtubeCache.set(key, safe);
    return safe;
  }

  private youtubeId(url: string): string | null {
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
    return match && match[2].length === 11 ? match[2] : null;
  }

  dismissAds() {
    this.showAdsOverlay.set(false);
    this.lastActivity = Date.now();
  }

  private setAdsOverlay(show: boolean) {
    this.showAdsOverlay.set(show);
    if (show) this.scheduleAdRotate();
  }

  onVideoEnded() {
    this.isVideoPlaying.set(false);
    const next = (this.currentAdIndex() + 1) % Math.max(this.ads().length, 1);
    this.currentAdIndex.set(next);
  }

  private scheduleAdRotate() {
    if (this.adRotateTimer) clearTimeout(this.adRotateTimer);
    if (!this.showAdsOverlay() || !this.ads().length) return;
    const ad = this.currentAd();
    if (ad?.video && this.isVideoPlaying()) return;
    if (ad?.youtubeUrl && ad?.isLive) return;
    this.adRotateTimer = setTimeout(() => {
      this.currentAdIndex.set((this.currentAdIndex() + 1) % this.ads().length);
      this.scheduleAdRotate();
    }, 5000);
  }

  private async checkSession() {
    try {
      const session = await this.api.get<{
        isLoggedIn?: boolean;
        kioskUsername?: string;
        branchId?: string;
      }>('/api/kiosk-session');
      if (!session.isLoggedIn || !session.kioskUsername) {
        location.href = '/kioskLogin';
        return;
      }
      const id = session.branchId;
      if (!id) {
        this.toast.error('Session error: Branch ID not found. Please login again.');
        location.href = '/kioskLogin';
        return;
      }
      this.branchId.set(id);
      localStorage.setItem('kioskBranchId', id);
      await this.fetchBranch(id);
      this.loading.set(false);
    } catch {
      location.href = '/kioskLogin';
    }
  }

  private async fetchBranch(id: string) {
    try {
      const data = await this.api.get<BranchData>(`/api/bank/branches/${id}`);
      this.branch.set(data);
      await this.fetchAds(id);
    } catch {
      /* ignore */
    }
  }

  private async fetchAds(branchId: string) {
    try {
      const data = await this.api.get<Ad[]>('/api/bank/ads', { branchId });
      this.ads.set(Array.isArray(data) ? data : []);
      this.scheduleAdRotate();
    } catch {
      this.ads.set([]);
    }
  }

  private async fetchSettings() {
    try {
      this.settings.set(await this.api.get<SettingsData>('/api/bank/settings'));
    } catch {
      /* ignore */
    }
  }

  private async fetchQueues() {
    try {
      const data = await this.api.get<Queue[]>('/api/bank/queues');
      this.queues.set(
        (data || []).filter((q) => q.status === undefined || q.status === 1),
      );
    } catch {
      this.toast.error('Failed to load queues');
    }
  }

  private async loadAudioLanguages() {
    try {
      const data = await this.api.get<{ languages: string[] }>('/api/kiosk/audio-languages');
      const langs = Array.isArray(data.languages) ? data.languages : [];
      this.audioLanguages.set(langs);
      let saved: string[] = [];
      try {
        const raw = localStorage.getItem('kioskSelectedLanguages');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            saved = parsed.filter((x: unknown) => typeof x === 'string');
          }
        }
      } catch {
        /* ignore */
      }
      const allowed = new Set(['English', ...langs]);
      const extras = saved.filter((x) => x !== 'English' && allowed.has(x));
      this.selectedLanguages.set(['English', ...extras]);
      this.languagePrefsHydrated = true;
    } catch {
      this.toast.error('Failed to load language list');
      this.languagePrefsHydrated = false;
    }
  }

  private persistSelectedLanguages() {
    if (!this.enableLanguageSelect() || !this.languagePrefsHydrated) return;
    localStorage.setItem(
      'kioskSelectedLanguages',
      JSON.stringify(this.selectedLanguages()),
    );
  }

  private ticketLanguage(): string {
    if (!this.enableLanguageSelect()) return 'English';
    return this.customerLanguage()?.trim() || 'English';
  }

  pickCustomerLanguage(lang: string) {
    this.customerLanguage.set(lang);
    this.step.set(this.enableSMS() ? 'phone' : 'queues');
  }

  backToLanguage() {
    this.customerLanguage.set(null);
    this.step.set('pickLanguage');
  }

  submitPhone() {
    if (this.phoneNumber.trim()) {
      const validation = validateUgandanPhoneNumber(this.phoneNumber);
      if (!validation.isValid) {
        this.toast.error(validation.error || 'Please enter a valid phone number');
        return;
      }
      this.phoneNumber = validation.normalizedNumber;
    }
    this.step.set('queues');
  }

  selectQueue(queue: Queue) {
    this.selectedQueue.set(queue);
    this.selectedSub.set(null);
    this.step.set('subqueues');
  }

  selectSub(sub: SubItem) {
    if (!sub?.id || !sub.name) {
      this.toast.error('Invalid sub-item selected');
      return;
    }
    const clean: SubItem = {
      id: sub.id,
      name: sub.name,
      subSubMenuItems: sub.subSubMenuItems || [],
    };
    this.selectedSub.set(clean);
    if (clean.subSubMenuItems && clean.subSubMenuItems.length > 0) {
      this.step.set('subsubqueues');
    } else {
      void this.createForSub(clean);
    }
  }

  selectSubSub(item: SubSub) {
    if (!item?.id) {
      this.toast.error('Please select a valid sub-sub-queue');
      return;
    }
    void this.createForSubSub(item);
  }

  goBack() {
    const current = this.step();
    if (current === 'subsubqueues') {
      this.step.set('subqueues');
    } else if (current === 'subqueues') {
      this.step.set('queues');
    } else if (current === 'queues') {
      if (this.enableSMS()) this.step.set('phone');
      else if (this.enableLanguageSelect()) {
        this.customerLanguage.set(null);
        this.step.set('pickLanguage');
      }
    } else if (current === 'phone' && this.enableLanguageSelect()) {
      this.customerLanguage.set(null);
      this.step.set('pickLanguage');
    }
  }

  private resetFlow() {
    this.phoneNumber = '';
    this.selectedQueue.set(null);
    this.selectedSub.set(null);
    this.ticketSmsLine.set(null);
    this.customerLanguage.set(null);
    if (this.enableLanguageSelect()) this.step.set('pickLanguage');
    else if (this.enableSMS()) this.step.set('phone');
    else this.step.set('queues');
  }

  private async createForSub(sub: SubItem) {
    const queue = this.selectedQueue();
    const branchId = this.branchId();
    if (!queue?.id || !sub?.id || !branchId) {
      this.toast.error('Please select a queue and sub-queue');
      return;
    }
    await this.createTicket({
      queueId: queue.id,
      subItemId: sub.id,
      issueDescription: `${queue.menuItem.name} - ${sub.name}`,
      phoneNumber: this.phoneNumber || undefined,
      branchId,
      language: this.ticketLanguage(),
    });
  }

  private async createForSubSub(subSub: SubSub) {
    const queue = this.selectedQueue();
    const sub = this.selectedSub();
    const branchId = this.branchId();
    if (!queue?.id || !sub?.id || !subSub?.id || !branchId) {
      this.toast.error('Please select a queue and sub-queue');
      return;
    }
    await this.createTicket({
      queueId: queue.id,
      subItemId: sub.id,
      subSubItemId: subSub.id,
      issueDescription: `${queue.menuItem.name} - ${sub.name} - ${subSub.name}`,
      phoneNumber: this.phoneNumber || undefined,
      branchId,
      language: this.ticketLanguage(),
    });
  }

  private async createTicket(body: Record<string, unknown>) {
    this.creating.set(true);
    try {
      const result = await this.api.post<{
        success: boolean;
        data: { ticketNo: string; smsDeferred?: boolean };
        error?: string;
      }>('/api/bank/ticket', body);
      this.ticketNumber.set(result.data.ticketNo);
      this.ticketSmsLine.set(
        result.data.smsDeferred
          ? 'An SMS confirmation is being sent in the background. If it does not arrive, your ticket number is still valid.'
          : null,
      );
      this.showTicketDialog.set(true);
      this.toast.success('Ticket created successfully!');
      if (this.ticketCloseTimer) clearTimeout(this.ticketCloseTimer);
      this.ticketCloseTimer = setTimeout(() => {
        this.showTicketDialog.set(false);
        this.resetFlow();
      }, 5000);
    } catch (err: unknown) {
      let message = 'Failed to create ticket';
      if (err && typeof err === 'object' && 'error' in err) {
        const body = (err as { error?: { error?: string } }).error;
        if (body?.error) message = body.error;
      }
      this.toast.error(message);
    } finally {
      this.creating.set(false);
    }
  }

  onOctechClick() {
    this.logoClicks++;
    if (this.logoClicks >= 5) {
      this.showStaffMenu.set(true);
      this.logoClicks = 0;
      if (this.staffHideTimer) clearTimeout(this.staffHideTimer);
      this.staffHideTimer = setTimeout(
        () => {
          this.showStaffMenu.set(false);
          this.staffPanelOpen.set(false);
        },
        5 * 60 * 1000,
      );
    }
  }

  toggleSMS(checked: boolean) {
    this.enableSMS.set(checked);
    localStorage.setItem('kioskEnableSMS', String(checked));
    if (!checked && this.step() === 'phone') {
      this.step.set(this.enableLanguageSelect() ? 'pickLanguage' : 'queues');
      if (this.enableLanguageSelect()) this.customerLanguage.set(null);
    }
    if (checked && !this.enableLanguageSelect() && this.step() === 'queues') {
      this.step.set('phone');
    }
  }

  toggleAds(checked: boolean) {
    this.enableAds.set(checked);
    localStorage.setItem('kioskEnableAds', String(checked));
    if (!checked) this.showAdsOverlay.set(false);
  }

  async toggleLanguageSelect(checked: boolean) {
    this.enableLanguageSelect.set(checked);
    localStorage.setItem('kioskEnableLanguageSelect', String(checked));
    if (!checked) {
      this.languagePrefsHydrated = false;
      this.selectedLanguages.set(['English']);
      localStorage.setItem('kioskSelectedLanguages', JSON.stringify(['English']));
      this.customerLanguage.set(null);
      this.step.set(this.enableSMS() ? 'phone' : 'queues');
    } else {
      this.customerLanguage.set(null);
      this.step.set('pickLanguage');
      await this.loadAudioLanguages();
    }
  }

  toggleAudioLanguage(lang: string, checked: boolean) {
    if (lang === 'English') return;
    const prev = this.selectedLanguages();
    this.selectedLanguages.set(
      checked
        ? prev.includes(lang)
          ? prev
          : [...prev, lang]
        : prev.filter((l) => l !== lang),
    );
    this.persistSelectedLanguages();
  }

  async logout() {
    try {
      await this.api.post('/api/kiosk-logout');
      localStorage.removeItem('kioskBranchId');
      location.href = '/kioskLogin';
    } catch {
      this.toast.error('Failed to logout');
    }
  }
}
