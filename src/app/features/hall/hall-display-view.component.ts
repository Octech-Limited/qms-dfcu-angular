import {
  Component,
  computed,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  SimpleChanges,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { cssColor, removeDynamicCss, setDynamicCss } from '../../core/csp-nonce';
import {
  ArrowRight,
  Facebook,
  Instagram,
  Link2,
  Linkedin,
  LucideAngularModule,
  User,
  Volume2,
  VolumeX,
  Youtube,
} from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { XTwitter, socialPlatformIcon } from '../../core/social-icons';
import { eatCalendarDate, getEatParts } from '../../core/timezone';
import { ToastService } from '../../core/toast.service';
import { RealtimeService, type RealtimeEvent } from '../../core/realtime.service';
import { getCountryByCode } from '../dashboard/countries';
import { AdCarouselComponent } from './ad-carousel.component';

type Ticket = {
  id: string;
  ticketNo: string;
  ticketStatus: string;
  language?: string;
  callAgain?: boolean;
  counterId?: string | null;
  createdAt?: string;
  counter?: { counterNumber?: number; id?: string } | null;
};

type Rate = {
  id: string;
  currencyCode: string;
  countryCode?: string;
  buyingRate: number;
  sellingRate: number;
};

type Social = { id: string; platform: string; handle: string };

type Settings = {
  companyName?: string | null;
  logoImage?: string | null;
  notificationText?: string | null;
};

type AnnouncementType = {
  id: string;
  name: string;
  backgroundColor: string;
  textColor: string;
};

type MarqueeItem = {
  id: string;
  text: string;
  typeInfo?: AnnouncementType;
};

type QueuedTicket = Ticket & {
  announcementId?: string;
  audioFiles?: string[];
};

const HALL_AUDIO_EXT = 'opus';

function hallAudioFile(baseName: string) {
  return `${baseName}.${HALL_AUDIO_EXT}`;
}

function counterClips(counterNumberStr: string): string[] {
  const s = counterNumberStr.trim();
  if (!s) return [];
  if (/^\d{2}$/.test(s)) {
    return s[0] === '0' ? [hallAudioFile(s[1])] : [hallAudioFile(s)];
  }
  return s.split('').map((c) => hallAudioFile(c));
}

/**
 * Ticket audio clips. For English, multi-digit suffixes use compound number files
 * (e.g. A10 → A.opus + 10.opus) instead of digit-by-digit 1 + 0.
 */
function ticketNumberClips(ticketNo: string, language: string): string[] {
  const raw = ticketNo.trim();
  if (!raw) return [];

  const match = raw.match(/^([A-Za-z]*)(\d+)$/);
  if (!match) {
    return raw.split('').map((c) => hallAudioFile(c.toUpperCase()));
  }

  const letters = match[1] || '';
  const digits = match[2] || '';
  const letterClips = letters.split('').map((c) => hallAudioFile(c.toUpperCase()));

  const useEnglishCompounds = language === 'English' || language.startsWith('English');
  if (useEnglishCompounds) {
    const value = Number.parseInt(digits, 10);
    if (Number.isFinite(value) && value >= 0 && value <= 99) {
      return [...letterClips, hallAudioFile(String(value))];
    }
  }

  return [...letterClips, ...digits.split('').map((d) => hallAudioFile(d))];
}

function buildAudioFiles(
  ticketNo: string,
  counterNumStr: string,
  attemptNumber: number,
  language = 'English',
) {
  const first = attemptNumber % 2 === 1;
  const ticketClips = ticketNumberClips(ticketNo, language);
  const counters = counterClips(counterNumStr);
  return first
    ? [
        hallAudioFile('alert'),
        hallAudioFile('TicketNumber'),
        ...ticketClips,
        hallAudioFile('To counter'),
        ...counters,
      ]
    : [
        hallAudioFile('TicketNumber'),
        ...ticketClips,
        hallAudioFile('To counter'),
        ...counters,
      ];
}

@Component({
  selector: 'app-hall-display-view',
  imports: [LucideAngularModule, AdCarouselComponent],
  template: `
    <div
      class="relative flex flex-col bg-background"
      [class.h-full]="fillParent"
      [class.w-full]="fillParent"
      [class.h-screen]="!fillParent"
    >
      @if (alertVisible()) {
        <div
          class="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md border border-border bg-background p-4 shadow-md"
        >
          <p class="text-center text-5xl font-bold text-foreground">{{ alertMessage() }}</p>
        </div>
      }

      <header
        class="flex shrink-0 items-center justify-between border-b-4 border-primary-foreground/20 bg-primary p-4 text-primary-foreground"
      >
        <div
          class="flex h-14 min-w-[8rem] items-center gap-3 rounded-md px-1"
        >
          <div
            class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white text-2xl font-black text-primary"
          >
            Q
          </div>
          <div class="min-w-0">
            <h2 class="truncate text-lg font-bold leading-tight">Q Simplified</h2>
            <p class="text-xs text-primary-foreground/70">Queue Management</p>
          </div>
        </div>
        <div class="flex flex-1 items-center justify-center gap-2">
          @for (part of [hours(), minutes(), seconds()]; track $index) {
            <div class="w-20">
              <div
                class="relative flex h-20 w-full items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white"
              >
                <div class="text-3xl font-bold text-primary">{{ part }}</div>
              </div>
            </div>
          }
        </div>
        <div class="relative flex items-center gap-4">
          @if (!preview) {
            <div class="flex items-center gap-2 text-primary-foreground">
              @if (soundOn() && soundLocked()) {
                <span class="animate-pulse text-xs font-medium">Tap anywhere to activate sound</span>
              }
              <lucide-angular
                [img]="soundOn() ? icons.Volume2 : icons.VolumeX"
                class="size-6"
              ></lucide-angular>
              <button
                type="button"
                role="switch"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-primary-foreground/40 transition-colors"
                [class.bg-white]="soundOn()"
                [class.bg-primary-foreground/20]="!soundOn()"
                [attr.aria-checked]="soundOn()"
                aria-label="Announcement sound"
                (click)="toggleSound()"
              >
                <span
                  class="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform"
                  [class.translate-x-5]="soundOn()"
                  [class.bg-primary]="soundOn()"
                  [class.bg-white]="!soundOn()"
                ></span>
              </button>
            </div>
          }
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-full border border-primary-foreground/30 bg-primary-foreground/15"
            (click)="menuOpen.set(!menuOpen())"
          >
            <lucide-angular [img]="icons.User" class="size-4"></lucide-angular>
          </button>
          @if (menuOpen()) {
            <div
              class="absolute right-0 top-10 z-50 min-w-48 rounded-md border bg-white p-2 text-foreground shadow-md"
            >
              <div class="px-2 py-1.5 text-sm font-semibold">{{ displayLabel() }}</div>
              <div class="my-1 h-px bg-border"></div>
              <label class="flex cursor-pointer items-center justify-between gap-4 px-2 py-2 text-sm">
                <span>Enable audio</span>
                <button
                  type="button"
                  role="switch"
                  class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                  [class.bg-primary]="enableVideoAudio()"
                  [class.bg-input]="!enableVideoAudio()"
                  [attr.aria-checked]="enableVideoAudio()"
                  (click)="enableVideoAudio.update((v) => !v); initializeAudioContext()"
                >
                  <span
                    class="pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform"
                    [class.translate-x-4]="enableVideoAudio()"
                  ></span>
                </button>
              </label>
              @if (!preview && logout) {
                <div class="my-1 h-px bg-border"></div>
                <button
                  type="button"
                  class="w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                  (click)="logout()"
                >
                  Logout
                </button>
              }
            </div>
          }
        </div>
      </header>

      <main class="flex min-h-0 flex-grow gap-4 overflow-hidden">
        @if (hasQms()) {
          <section
            class="glass-opaque flex w-1/5 flex-col overflow-hidden rounded-none border bg-background"
          >
            <div class="flex-1 overflow-auto p-4 pb-0">
              <h2 class="mb-3 pt-2 text-2xl font-bold">Serving Tickets</h2>
              <table class="w-full text-left">
                <thead>
                  <tr class="text-muted-foreground">
                    <th class="pb-2 font-medium">Ticket</th>
                    <th class="pb-2 text-center font-medium"></th>
                    <th class="pb-2 font-medium">Counter</th>
                  </tr>
                </thead>
                <tbody class="text-5xl font-extrabold md:text-6xl">
                  @for (ticket of serving(); track ticket.id) {
                    <tr>
                      <td class="py-2">{{ ticket.ticketNo }}</td>
                      <td class="py-2 text-center text-primary">
                        <lucide-angular
                          [img]="icons.ArrowRight"
                          class="mx-auto size-6"
                        ></lucide-angular>
                      </td>
                      <td class="py-2">{{ ticket.counter?.counterNumber ?? 'N/A' }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td
                        colspan="3"
                        class="py-4 text-center text-base font-normal text-muted-foreground"
                      >
                        No tickets
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="border-t-2 border-gray-200">
              <h3 class="px-4 pb-2 pt-3 text-2xl font-extrabold text-gray-700">
                Upcoming Tickets
              </h3>
              @if (upcoming().length === 0) {
                <div
                  class="flex h-48 items-center justify-center bg-muted/50 text-2xl text-muted-foreground"
                >
                  No upcoming tickets
                </div>
              } @else {
                <div class="h-48 overflow-hidden bg-accent/50 p-2">
                  <div class="upcoming-grid grid h-full grid-rows-3 gap-2">
                    @for (cell of upcomingCells(); track cell.ticket.id; let i = $index) {
                      <div
                        class="upcoming-cell-{{ i }} flex h-full items-center justify-center rounded-lg border-2 border-primary-foreground/30 bg-primary shadow-md"
                      >
                        <span
                          class="text-5xl font-bold text-primary-foreground drop-shadow-md"
                          >{{ cell.ticket.ticketNo }}</span
                        >
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <section class="overflow-hidden bg-primary" [class]="hasQms() ? 'w-[62%]' : 'w-2/3'">
          @if (branchId) {
            <app-ad-carousel
              [branchId]="branchId"
              [enableAudio]="enableVideoAudio() && !isAnnouncing()"
            />
          }
        </section>

        <aside
          class="flex min-h-0 flex-col gap-4 overflow-hidden"
          [class]="hasQms() ? 'w-[18%]' : 'w-1/3'"
        >
          <div
            class="glass-opaque min-h-0 flex-1 overflow-auto rounded-none border bg-background p-4"
          >
            <h2 class="mb-3 pt-2 text-2xl font-bold">Exchange Rates</h2>
            <table class="w-full text-left">
              <thead>
                <tr class="text-muted-foreground">
                  @if (!hasQms()) {
                    <th class="pb-2 font-medium">Flag</th>
                  }
                  <th class="pb-2 font-medium">Currency</th>
                  <th class="pb-2 font-medium">Buy</th>
                  <th class="pb-2 font-medium">Sell</th>
                </tr>
              </thead>
              <tbody class="text-2xl font-extrabold md:text-3xl">
                @for (rate of rates(); track rate.id) {
                  <tr>
                    @if (!hasQms()) {
                      <td class="py-2">{{ flagFor(rate.countryCode) }}</td>
                    }
                    <td class="py-2">{{ rate.currencyCode }}</td>
                    <td class="py-2">{{ rate.buyingRate }}</td>
                    <td class="py-2">{{ rate.sellingRate }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td
                      [attr.colspan]="hasQms() ? 3 : 4"
                      class="py-4 text-center text-base font-normal text-muted-foreground"
                    >
                      No exchange rates available
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (socials().length > 0) {
            @if (currentSocial(); as social) {
              <div
                class="relative z-10 mt-auto mb-1.5 flex w-full shrink-0 items-center justify-center bg-primary px-3 text-white"
                [class.h-24]="social.handle.length <= 12"
                [class.min-h-24]="social.handle.length <= 12"
                [class.h-20]="social.handle.length > 12"
                [class.min-h-20]="social.handle.length > 12"
              >
                <div
                  class="flex max-w-full items-center justify-center gap-3"
                  [class.gap-4]="social.handle.length <= 12"
                >
                  <lucide-angular
                    [img]="socialPlatformIcon(social.platform)"
                    [size]="socialIconSize(social.handle)"
                    color="#ffffff"
                    class="shrink-0 text-white"
                  ></lucide-angular>
                  <span
                    class="max-w-full truncate font-bold text-white"
                    [class.text-4xl]="social.handle.length <= 12"
                    [class.text-2xl]="social.handle.length > 12"
                    [title]="social.handle"
                    >{{ social.handle }}</span
                  >
                </div>
              </div>
            }
          }
        </aside>
      </main>

      <footer class="shrink-0 overflow-hidden bg-primary pb-2 text-primary-foreground">
        <div class="hall-marquee">
          @if (currentMarquee().typeInfo; as type) {
            <div class="hall-marquee-type">
              <span>{{ type.name }}</span>
            </div>
          }
          <div class="hall-marquee-scroll">
            <div
              class="hall-marquee-inner"
              [attr.data-key]="currentMarquee().id + '-' + marqueeIndex()"
            >
              <span class="hall-marquee-text">{{
                currentMarquee().text || 'Welcome to our service'
              }}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  `,
  styles: [
    `
      .hall-marquee {
        width: 100%;
        display: flex;
        align-items: stretch;
        position: relative;
        background-color: var(--primary);
        height: 5rem;
        overflow: hidden;
      }
      .hall-marquee-type {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 10rem;
        padding: 0 1.5rem;
        font-size: 2.25rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.2);
      }
      .hall-marquee-type::after {
        content: '';
        position: absolute;
        right: -1.5rem;
        top: 0;
        width: 0;
        height: 0;
        border-top: 2.5rem solid transparent;
        border-bottom: 2.5rem solid transparent;
        border-left: 1.5rem solid var(--type-color, #fff);
      }
      .hall-marquee-scroll {
        flex: 1;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
      }
      .hall-marquee-inner {
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
        animation: hall-marquee-slide linear infinite;
        animation-duration: var(--marquee-duration, 20s);
        padding-left: 100%;
      }
      .hall-marquee-text {
        font-size: 2rem;
        font-weight: 600;
        line-height: 5rem;
        padding-right: 4rem;
        color: var(--primary-foreground);
      }
      @keyframes hall-marquee-slide {
        from {
          transform: translateX(0%);
        }
        to {
          transform: translateX(-100%);
        }
      }
    `,
  ],
})
export class HallDisplayViewComponent implements OnInit, OnChanges, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly platform = inject(PLATFORM_ID);
  private readonly realtime = inject(RealtimeService);
  private unsubscribeRealtime?: () => void;
  private static nextStyleId = 0;
  private readonly styleId = `hall-layout-css-${HallDisplayViewComponent.nextStyleId++}`;

  constructor() {
    effect(() => setDynamicCss(this.styleId, this.hallLayoutCss()));
  }

  @Input({ required: true }) branchId = '';
  @Input() preview = false;
  @Input() fillParent = false;
  @Input() sessionLabel = '';
  @Input() hallDisplayUsername: string | null = null;
  @Input() logout?: () => void | Promise<void>;

  readonly icons = {
    ArrowRight,
    User,
    Volume2,
    VolumeX,
    Facebook,
    Instagram,
    Linkedin,
    Youtube,
    XTwitter,
    Link2,
  };

  readonly serving = signal<Ticket[]>([]);
  readonly upcoming = signal<Ticket[]>([]);
  readonly rates = signal<Rate[]>([]);
  readonly socials = signal<Social[]>([]);
  readonly socialIndex = signal(0);
  readonly settings = signal<Settings | null>(null);
  readonly hasQms = signal(true);
  /** The user's choice, kept in localStorage so a refresh (e.g. after a network blip) does not reset it. */
  readonly soundOn = signal(false);
  /** True while the browser blocks sound until the next click/tap/key press (autoplay policy). */
  readonly soundLocked = signal(false);
  readonly muted = computed(() => !this.soundOn());
  readonly menuOpen = signal(false);
  readonly enableVideoAudio = signal(false);
  readonly isAnnouncing = signal(false);
  readonly alertVisible = signal(false);
  readonly alertMessage = signal('');
  readonly hours = signal('00');
  readonly minutes = signal('00');
  readonly seconds = signal('00');
  readonly marqueeItems = signal<MarqueeItem[]>([]);
  readonly marqueeIndex = signal(0);

  private pollTimer?: ReturnType<typeof setInterval>;
  private clockTimer?: ReturnType<typeof setInterval>;
  private announceTimer?: ReturnType<typeof setInterval>;
  private socialTimer?: ReturnType<typeof setInterval>;
  private marqueeTimer?: ReturnType<typeof setTimeout>;
  private marqueePoll?: ReturnType<typeof setInterval>;
  private alertTimer?: ReturnType<typeof setTimeout>;
  private languages: string[] = ['English', 'Luganda'];
  private preloaded = new Map<string, Map<string, HTMLAudioElement>>();
  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private previousStates = new Map<
    string,
    { status: string; callAgain: boolean; counterId: string | null }
  >();
  private queue: {
    tickets: QueuedTicket[];
    currentTicketIndex: number;
    currentAnnouncementCount: number;
    isProcessing: boolean;
  } = {
    tickets: [],
    currentTicketIndex: 0,
    currentAnnouncementCount: 0,
    isProcessing: false,
  };

  displayLabel() {
    return (
      this.sessionLabel ||
      this.hallDisplayUsername ||
      (this.preview ? 'Preview' : 'User')
    );
  }

  currentSocial() {
    const list = this.socials();
    if (!list.length) return null;
    return list[this.socialIndex() % list.length] ?? null;
  }

  currentMarquee() {
    const list = this.marqueeItems();
    if (!list.length) return { id: 'fallback', text: 'Welcome to our service', typeInfo: undefined };
    return list[this.marqueeIndex() % list.length] ?? list[0];
  }

  marqueeDuration() {
    const text = this.currentMarquee().text || '';
    if (text.length < 50) return Math.max(text.length * 0.5, 20);
    return Math.max(text.length * 0.35, 20);
  }

  hallLayoutCss() {
    const cols = Math.max(1, Math.ceil(this.upcoming().length / 3));
    const cells = this.upcomingCells()
      .map(
        (cell, index) =>
          `.upcoming-cell-${index}{grid-row:${cell.row};grid-column:${cell.col}}`,
      )
      .join('');
    const type = this.currentMarquee().typeInfo;
    const typeRule = type
      ? `.hall-marquee-type{background-color:${cssColor(type.backgroundColor, 'transparent')};color:${cssColor(type.textColor, '#ffffff')};--type-color:${cssColor(type.backgroundColor, '#ffffff')}}`
      : '';
    const duration = this.marqueeDuration();
    const safeDuration = Number.isFinite(duration) ? Math.min(Math.max(duration, 1), 600) : 20;
    return `.upcoming-grid{grid-template-columns:repeat(${cols},minmax(120px,1fr))}${cells}${typeRule}.hall-marquee-inner{--marquee-duration:${safeDuration}s}`;
  }

  upcomingCells() {
    const tickets = this.upcoming();
    const cells: { ticket: Ticket; row: number; col: number }[] = [];
    tickets.forEach((ticket, index) => {
      cells.push({
        ticket,
        row: (index % 3) + 1,
        col: Math.floor(index / 3) + 1,
      });
    });
    return cells;
  }

  flagFor(code?: string) {
    if (!code) return '';
    return getCountryByCode(code)?.flag || '';
  }

  socialPlatformIcon = socialPlatformIcon;

  socialIconSize(handle: string) {
    return handle.length <= 12 ? 52 : 40;
  }

  socialIcon(platform: string) {
    return socialPlatformIcon(platform);
  }

  toggleSound() {
    const next = !this.soundOn();
    this.soundOn.set(next);
    this.saveSoundPreference(next);
    if (next) {
      // This click is a user gesture, so the browser lets sound start now.
      this.initializeAudioContext();
      this.soundLocked.set(false);
      this.checkSoundUnlocked();
    } else {
      this.currentAudio?.pause();
      this.soundLocked.set(false);
    }
  }

  private static readonly SOUND_KEY = 'qms.hall.soundOn';

  private loadSoundPreference(): boolean {
    try {
      return localStorage.getItem(HallDisplayViewComponent.SOUND_KEY) === '1';
    } catch {
      return false; // storage blocked (private window etc.): fall back to off
    }
  }

  private saveSoundPreference(on: boolean) {
    try {
      localStorage.setItem(HallDisplayViewComponent.SOUND_KEY, on ? '1' : '0');
    } catch {
      /* not persisted, still works for this page load */
    }
  }

  // Browsers differ in which input counts as a "real" interaction for audio, so listen for all the usual ones.
  private readonly unlockEvents = ['pointerdown', 'pointerup', 'mousedown', 'click', 'keydown', 'touchstart', 'touchend'] as const;
  private readonly unlockHandler = () => {
    if (!this.soundOn()) return;
    this.initializeAudioContext();
    this.checkSoundUnlocked();
  };

  /** After a refresh the page has no user gesture yet. Resume on the first one, from anywhere on the screen. */
  private restoreSound() {
    if (this.preview || !this.loadSoundPreference()) return;
    this.soundOn.set(true);
    this.initializeAudioContext();
    this.checkSoundUnlocked();
    this.armUnlock();
  }

  private armUnlock() {
    for (const e of this.unlockEvents) document.addEventListener(e, this.unlockHandler, { passive: true });
  }

  private soundWatch?: ReturnType<typeof setInterval>;

  /**
   * Decides whether the browser is really blocking sound. A just-created audio engine is "suspended" for a
   * moment even when sound is allowed (longer on slow TVs), so only claim "blocked" after a grace period,
   * and clear the hint the moment the engine runs.
   */
  private checkSoundUnlocked() {
    const ctx = this.audioContext;
    if (!ctx) return;
    if (this.soundWatch) clearInterval(this.soundWatch);
    const evaluate = () => {
      if (ctx.state !== 'running') return false;
      this.soundLocked.set(false);
      for (const e of this.unlockEvents) document.removeEventListener(e, this.unlockHandler);
      if (this.soundWatch) clearInterval(this.soundWatch);
      this.soundWatch = undefined;
      return true;
    };
    if (evaluate()) return;
    ctx.onstatechange = () => void evaluate();
    let ticks = 0;
    this.soundWatch = setInterval(() => {
      if (evaluate()) return;
      ticks++;
      if (ticks === 4) this.soundLocked.set(this.soundOn()); // ~2s and still not running: really blocked
      if (ticks >= 20 && this.soundWatch) {
        clearInterval(this.soundWatch); // the next tap re-checks
        this.soundWatch = undefined;
      }
    }, 500);
  }

  initializeAudioContext() {
    if (
      typeof AudioContext === 'undefined' &&
      !(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ) {
      return;
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!this.audioContext) {
      this.audioContext = new Ctx();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
  }

  async ngOnInit() {
    if (!isPlatformBrowser(this.platform)) return;
    this.tickClock();
    this.clockTimer = setInterval(() => this.tickClock(), 1000);
    this.restoreSound();
    if (!this.preview) await this.preloadAudio();
    // Subscribe before the first load so an event that lands while it runs is not lost.
    this.bindRealtime();
    await Promise.all([this.reloadAll(), this.loadMarquee()]);
    // Safety net only: server events drive updates; this catches anything missed.
    this.pollTimer = setInterval(() => void this.reloadAll(), 30_000);
    this.socialTimer = setInterval(() => {
      const n = this.socials().length;
      if (n > 1) this.socialIndex.update((i) => (i + 1) % n);
    }, 5000);
    this.marqueePoll = setInterval(() => void this.loadMarquee(), 300_000);
    this.scheduleMarqueeRotate();
    if (!this.preview) {
      this.announceTimer = setInterval(() => void this.processQueue(), 1000);
    }
  }

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['branchId'] && !changes['branchId'].firstChange && this.branchId) {
      this.previousStates.clear();
      this.queue = {
        tickets: [],
        currentTicketIndex: 0,
        currentAnnouncementCount: 0,
        isProcessing: false,
      };
      this.bindRealtime();
      await this.reloadAll();
    }
  }

  private bindRealtime() {
    this.unsubscribeRealtime?.();
    if (!this.branchId) return;
    this.unsubscribeRealtime = this.realtime.subscribe(
      ['tickets', 'announcements-audio', 'content', 'resync'],
      (events) => this.onRealtime(events),
      this.branchId,
    );
  }

  private onRealtime(events: RealtimeEvent[]) {
    const resync = events.some((e) => e.type === 'resync');
    const tickets = resync || events.some((e) => e.type === 'tickets' || e.type === 'announcements-audio');
    const content = resync || events.some((e) => e.type === 'content' && e.scope !== 'marquee' && e.scope !== 'ads');
    const marquee = resync || events.some((e) => e.type === 'content' && e.scope === 'marquee');
    if (tickets && content) void this.reloadAll();
    else if (tickets) void this.reloadAll('tickets');
    else if (content) void this.reloadAll('content');
    if (marquee) void this.loadMarquee();
  }

  ngOnDestroy() {
    removeDynamicCss(this.styleId);
    for (const e of this.unlockEvents) document.removeEventListener(e, this.unlockHandler);
    if (this.soundWatch) clearInterval(this.soundWatch);
    this.unsubscribeRealtime?.();
    if (this.reloadRetryTimer) clearTimeout(this.reloadRetryTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.announceTimer) clearInterval(this.announceTimer);
    if (this.socialTimer) clearInterval(this.socialTimer);
    if (this.marqueeTimer) clearTimeout(this.marqueeTimer);
    if (this.marqueePoll) clearInterval(this.marqueePoll);
    if (this.alertTimer) clearTimeout(this.alertTimer);
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
  }

  private tickClock() {
    const parts = getEatParts();
    this.hours.set(String(parts.hour).padStart(2, '0'));
    this.minutes.set(String(parts.minute).padStart(2, '0'));
    this.seconds.set(String(parts.second).padStart(2, '0'));
  }

  private scheduleMarqueeRotate() {
    if (this.marqueeTimer) clearTimeout(this.marqueeTimer);
    const items = this.marqueeItems();
    if (items.length <= 1) return;
    const text = this.currentMarquee().text || '';
    let interval = 30000;
    if (text.length >= 100) interval = Math.max(60000, text.length * 600);
    else if (text.length >= 50) interval = 45000;
    this.marqueeTimer = setTimeout(() => {
      this.marqueeIndex.update((i) => (i + 1) % items.length);
      this.scheduleMarqueeRotate();
    }, interval);
  }

  private async loadMarquee() {
    try {
      const [announcements, types] = await Promise.all([
        this.api.get<
          { id: string; text: string; type?: string | null; isActive: boolean }[]
        >('/api/bank/announcements'),
        this.api.get<AnnouncementType[]>('/api/bank/announcement-types').catch(() => []),
      ]);
      const typeMap = new Map((types || []).map((t) => [t.id, t]));
      const resolveType = (value: string | null | undefined) => {
        if (!value) return undefined;
        return (
          typeMap.get(value) ||
          (types || []).find((t) => t.name === value) ||
          undefined
        );
      };
      const active = (announcements || [])
        .filter((a) => a.isActive)
        .map((a) => ({
          id: a.id,
          text: a.text,
          typeInfo: resolveType(a.type),
        }));
      this.marqueeItems.set(
        active.length
          ? active
          : [
              {
                id: 'fallback',
                text: this.settings()?.notificationText || 'Welcome to our service',
              },
            ],
      );
      this.scheduleMarqueeRotate();
    } catch {
      this.marqueeItems.set([
        {
          id: 'fallback',
          text: this.settings()?.notificationText || 'Welcome to our service',
        },
      ]);
    }
  }

  private async reloadAll(scope: 'all' | 'tickets' | 'content' = 'all') {
    if (!this.branchId) return;
    const today = eatCalendarDate();
    const wantTickets = scope !== 'content';
    const wantContent = scope !== 'tickets';
    try {
      const [ticketData, contentData] = await Promise.all([
        wantTickets
          ? Promise.all([
              this.api.get<Ticket[]>('/api/bank/ticket', {
                status: 'Serving',
                branchId: this.branchId,
                date: today,
              }),
              this.api.get<Ticket[]>('/api/bank/ticket', {
                status: 'Hold',
                branchId: this.branchId,
                date: today,
              }),
              this.api.get<Ticket[]>('/api/bank/ticket', {
                status: 'Redirected',
                branchId: this.branchId,
                date: today,
              }),
              this.api.get<Ticket[]>('/api/bank/ticket', {
                status: 'Not Served',
                branchId: this.branchId,
                date: today,
              }),
            ])
          : null,
        wantContent
          ? Promise.all([
              this.api.get<{ kioskUsername?: string | null; hallDisplayUsername?: string | null }>(
                `/api/bank/branches/${this.branchId}`,
              ),
              this.api.get<Rate[]>('/api/bank/exchange-rates'),
              this.api.get<Settings>('/api/bank/settings'),
              this.api.get<Social[]>('/api/bank/social-media'),
            ])
          : null,
      ]);
      if (contentData) {
        const [branch, rates, settings, socials] = contentData;
        this.hasQms.set(!!branch?.kioskUsername);
        this.rates.set(rates || []);
        this.settings.set(settings);
        this.socials.set(socials || []);
      }
      if (!ticketData) {
        this.reloadRetries = 0;
        return;
      }
      const [serving, onHold, redirected, upcoming] = ticketData;
      this.serving.set(serving || []);
      this.upcoming.set(
        [...(upcoming || [])].sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return da - db;
        }),
      );

      if (!this.preview) {
        for (const ticket of serving || []) {
          if (ticket.ticketStatus === 'Serving' && ticket.counterId && ticket.counter) {
            await this.maybeQueueAnnouncement(ticket);
          }
          this.previousStates.set(ticket.id, {
            status: ticket.ticketStatus,
            callAgain: !!ticket.callAgain,
            counterId: ticket.counterId ?? null,
          });
        }
        // Keep Hold / Redirected so resume or claim can start a new announce cycle
        for (const ticket of onHold || []) {
          this.previousStates.set(ticket.id, {
            status: 'Hold',
            callAgain: !!ticket.callAgain,
            counterId: ticket.counterId ?? null,
          });
        }
        for (const ticket of redirected || []) {
          this.previousStates.set(ticket.id, {
            status: 'Redirected',
            callAgain: !!ticket.callAgain,
            counterId: ticket.counterId ?? null,
          });
        }
        const liveIds = new Set([
          ...(serving || []).map((t) => t.id),
          ...(onHold || []).map((t) => t.id),
          ...(redirected || []).map((t) => t.id),
        ]);
        for (const id of [...this.previousStates.keys()]) {
          if (!liveIds.has(id)) this.previousStates.delete(id);
        }
      }
      this.reloadRetries = 0;
    } catch {
      /* keep last good state, but retry soon: with events there is no 3s poll to repair a failed refresh */
      this.scheduleReloadRetry(scope);
    }
  }

  private reloadRetryTimer?: ReturnType<typeof setTimeout>;
  private reloadRetries = 0;

  private scheduleReloadRetry(scope: 'all' | 'tickets' | 'content') {
    if (this.reloadRetryTimer || this.reloadRetries >= 6) return;
    this.reloadRetries++;
    this.reloadRetryTimer = setTimeout(() => {
      this.reloadRetryTimer = undefined;
      void this.reloadAll(scope);
    }, Math.min(1000 * this.reloadRetries, 5000));
  }

  private async maybeQueueAnnouncement(ticket: Ticket) {
    if (!ticket.counterId || !ticket.counter) return;
    const previous = this.previousStates.get(ticket.id);
    try {
      const countData = await this.api.get<{ total: number }>('/api/bank/ticket-announcements', {
        ticketId: ticket.id,
        ticketStatus: ticket.ticketStatus,
      });
      const announcementCount = countData.total || 0;
      const fromHold = previous?.status === 'Hold' && ticket.ticketStatus === 'Serving';
      const fromRedirect =
        previous?.status === 'Redirected' && ticket.ticketStatus === 'Serving';
      const counterChanged =
        ticket.ticketStatus === 'Serving' &&
        !!previous?.counterId &&
        !!ticket.counterId &&
        previous.counterId !== ticket.counterId;
      const shouldReset = fromHold || fromRedirect || counterChanged;
      const isCallAgainReset = !!ticket.callAgain && previous && !previous.callAgain;
      if (announcementCount < 2 || shouldReset || isCallAgainReset) {
        await this.queueTicketAnnouncement(ticket, {
          shouldReset,
          isCallAgainReset,
          fromHold,
          fromRedirect: fromRedirect || counterChanged,
        });
      }
    } catch {
      /* ignore */
    }
  }

  private async queueTicketAnnouncement(
    ticket: Ticket,
    opts?: {
      shouldReset?: boolean;
      isCallAgainReset?: boolean;
      fromHold?: boolean;
      fromRedirect?: boolean;
    },
  ) {
    if (this.preview || !ticket.counter || !this.branchId) return;
    try {
      const previous = this.previousStates.get(ticket.id);
      const isHoldResume =
        !!opts?.fromHold ||
        (previous?.status === 'Hold' && ticket.ticketStatus === 'Serving');
      const isRedirectClaim =
        !!opts?.fromRedirect ||
        (previous?.status === 'Redirected' && ticket.ticketStatus === 'Serving') ||
        (!!previous?.counterId &&
          !!ticket.counterId &&
          previous.counterId !== ticket.counterId &&
          ticket.ticketStatus === 'Serving');
      const isCallAgain = !!ticket.callAgain || !!opts?.isCallAgainReset;
      const isNewCycle = isHoldResume || isRedirectClaim || isCallAgain;

      const completed = await this.api.get<{ total: number }>('/api/bank/ticket-announcements', {
        ticketId: ticket.id,
        status: 'completed',
        ticketStatus: ticket.ticketStatus,
      });
      const currentCount = completed.total || 0;
      const queuedCount = this.queue.tickets.filter((t) => t.id === ticket.id).length;
      const maxQueueEntries = 2;

      // New cycle (unhold / redirect-claim / call-again) always gets a fresh pair
      if (queuedCount >= maxQueueEntries) return;
      if (!isNewCycle && currentCount >= 2) return;

      let announcementType: 'initial' | 'call_again' | 'hold_resume' = 'initial';
      if (isCallAgain) announcementType = 'call_again';
      else if (isHoldResume) announcementType = 'hold_resume';
      // Redirect claim uses initial (new counter serving the ticket)

      // Start attempt numbers so the first clip of this pair includes the alert tone
      const baseAttempt = isNewCycle
        ? currentCount % 2 === 0
          ? currentCount + 1
          : currentCount + 2
        : currentCount + 1;

      const createAnnouncement = async (attemptNumber: number) => {
        const created = await this.api.post<{ success?: boolean; data?: { id: string } }>(
          '/api/bank/ticket-announcements',
          {
            ticketId: ticket.id,
            ticketNo: ticket.ticketNo,
            branchId: this.branchId,
            counterId: ticket.counterId,
            counterNumber: ticket.counter!.counterNumber,
            announcementType,
            language: ticket.language || 'English',
            attemptNumber,
            status: 'queued',
            ticketStatus: ticket.ticketStatus,
            callAgain: ticket.callAgain,
            previousStatus: previous?.status || null,
            hallDisplayId: this.hallDisplayUsername || null,
          },
        );
        if (!created?.data?.id) return null;
        const lang = this.resolveLang(ticket.language);
        return {
          ...ticket,
          announcementId: created.data.id,
          audioFiles: buildAudioFiles(
            ticket.ticketNo,
            String(ticket.counter!.counterNumber),
            attemptNumber,
            lang,
          ),
        } satisfies QueuedTicket;
      };

      const needed = maxQueueEntries - queuedCount;
      const pair: QueuedTicket[] = [];
      for (let i = 0; i < needed; i++) {
        const entry = await createAnnouncement(baseAttempt + i);
        if (entry) pair.push(entry);
      }
      if (!pair.length) return;

      if (isNewCycle) {
        // Unhold / redirect-claim / call-again jump to the front
        this.queue.tickets.unshift(...pair);
        if (this.queue.currentTicketIndex > 0) {
          this.queue.currentTicketIndex += pair.length;
        }
      } else {
        this.queue.tickets.push(...pair);
      }
    } catch {
      /* ignore queue errors */
    }
  }

  private async processQueue() {
    if (this.preview) return;
    const q = this.queue;
    if (q.isProcessing || !q.tickets.length || this.muted()) return;
    if (q.currentTicketIndex >= q.tickets.length) {
      q.tickets = [];
      q.currentTicketIndex = 0;
      q.currentAnnouncementCount = 0;
      return;
    }
    const ticket = q.tickets[q.currentTicketIndex];
    if (!ticket.counter || !ticket.announcementId) {
      q.currentTicketIndex++;
      return;
    }

    q.isProcessing = true;
    this.isAnnouncing.set(true);
    const language = this.resolveLang(ticket.language);

    try {
      await this.api.put(`/api/bank/ticket-announcements/${ticket.announcementId}`, {
        status: 'playing',
        playStartedAt: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }

    let attemptNumber = 1;
    try {
      const ann = await this.api.get<{ attemptNumber?: number; data?: { attemptNumber?: number } }>(
        `/api/bank/ticket-announcements/${ticket.announcementId}`,
      );
      attemptNumber = ann.data?.attemptNumber ?? ann.attemptNumber ?? 1;
    } catch {
      /* ignore */
    }

    let counterNumberStr = String(ticket.counter.counterNumber ?? '');
    try {
      const fresh = await this.api.get<Ticket>(`/api/bank/ticket/${ticket.id}`);
      if (fresh.counter?.counterNumber != null) {
        counterNumberStr = String(fresh.counter.counterNumber);
      }
    } catch {
      /* ignore */
    }

    this.showAlert(
      `Ticket ${ticket.ticketNo} - Proceed to Counter ${counterNumberStr}`,
    );

    // Rebuild clip list with refreshed counter; English uses compound number files (10–99)
    const filesToPlay = buildAudioFiles(
      ticket.ticketNo,
      counterNumberStr,
      attemptNumber,
      language,
    );

    const start = Date.now();
    let ok = true;
    try {
      for (const file of filesToPlay) {
        await this.playAudio(file, language);
      }
    } catch (error) {
      ok = false;
      try {
        await this.api.put(`/api/bank/ticket-announcements/${ticket.announcementId}`, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch {
        /* ignore */
      }
    }

    if (ok) {
      try {
        await this.api.put(`/api/bank/ticket-announcements/${ticket.announcementId}`, {
          status: 'completed',
          playCompletedAt: new Date().toISOString(),
          duration: Date.now() - start,
        });
      } catch {
        /* ignore */
      }
      try {
        const done = await this.api.get<{ total: number }>('/api/bank/ticket-announcements', {
          ticketId: ticket.id,
          ticketStatus: ticket.ticketStatus,
          status: 'completed',
        });
        if ((done.total || 0) >= 2 && ticket.callAgain) {
          await this.api.put(`/api/bank/ticket/${ticket.id}`, { callAgain: false });
          this.serving.update((rows) =>
            rows.map((t) => (t.id === ticket.id ? { ...t, callAgain: false } : t)),
          );
        }
      } catch {
        this.toast.error('Failed to update ticket status.');
      }
    }

    q.currentTicketIndex++;
    q.currentAnnouncementCount = 0;
    q.isProcessing = false;
    this.isAnnouncing.set(false);
  }

  private showAlert(message: string) {
    this.alertMessage.set(message);
    this.alertVisible.set(true);
    if (this.alertTimer) clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => this.alertVisible.set(false), 5000);
  }

  private resolveLang(raw?: string) {
    const primary = (raw || 'English').split(',')[0].trim();
    if (this.languages.includes(primary)) return primary;
    if (this.languages.includes('English')) return 'English';
    return this.languages[0] || 'English';
  }

  private async preloadAudio() {
    try {
      const data = await this.api.get<{ languages: string[] }>('/api/kiosk/audio-languages');
      const dirs = Array.isArray(data.languages) ? data.languages : [];
      this.languages = Array.from(new Set(['English', 'Luganda', ...dirs]));
    } catch {
      this.languages = ['English', 'Luganda'];
    }
    const baseFiles = [
      'alert',
      'TicketNumber',
      'To counter',
      ...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
    ];
    // English has compound clips 10–99 (e.g. A10 → "ten")
    const englishCompounds = Array.from({ length: 90 }, (_, i) => String(i + 10));

    for (const lang of this.languages) {
      const map = new Map<string, HTMLAudioElement>();
      this.preloaded.set(lang, map);
      const names =
        lang === 'English' ? [...baseFiles, ...englishCompounds] : baseFiles;
      for (const name of names) {
        const file = hallAudioFile(name);
        try {
          const audio = new Audio(`/audio/${lang}/${file}`);
          await new Promise<void>((resolve) => {
            audio.addEventListener('canplaythrough', () => resolve(), { once: true });
            audio.addEventListener('error', () => resolve(), { once: true });
            setTimeout(() => resolve(), 3000);
          });
          map.set(file, audio);
        } catch {
          /* ignore */
        }
      }
    }
  }

  private playAudio(fileName: string, language: string) {
    if (this.muted() || this.preview) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
      }
      let audio = this.preloaded.get(language)?.get(fileName);
      if (!audio) audio = new Audio(`/audio/${language}/${fileName}`);
      else audio.currentTime = 0;
      this.currentAudio = audio;
      audio.onended = () => {
        this.currentAudio = null;
        resolve();
      };
      audio.onerror = () => {
        this.currentAudio = null;
        reject(new Error(`Failed to play ${language}/${fileName}`));
      };
      audio.play().then(
        () => {
          // Playing worked, so sound is not blocked, whatever an earlier attempt said.
          if (this.soundLocked()) this.soundLocked.set(false);
        },
        (e) => {
          this.currentAudio = null;
          if ((e as DOMException)?.name === 'NotAllowedError') {
            this.soundLocked.set(true);
            this.armUnlock();
          }
          reject(e);
        }
      );
    });
  }
}
