import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  PLATFORM_ID,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export type DashboardAd = {
  id: string;
  name?: string;
  image?: string | null;
  video?: string | null;
  youtubeUrl?: string | null;
  isLive?: boolean;
  branchIds?: string[];
};

export type DashboardBranch = {
  id: string;
  name: string;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLIFrameElement,
        opts: {
          events?: {
            onStateChange?: (e: { data: number }) => void;
            onReady?: () => void;
          };
        },
      ) => {
        destroy: () => void;
        mute: () => void;
        unMute: () => void;
      };
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

@Component({
  selector: 'app-dashboard-ad-carousel',
  template: `
    @if (!filteredAds().length) {
      <div class="flex aspect-video items-center justify-center rounded-lg bg-muted">
        <p class="text-muted-foreground">No ads available for this branch</p>
      </div>
    } @else if (current(); as ad) {
      <div class="relative aspect-video overflow-hidden rounded-lg bg-black">
        @if (ad.youtubeUrl && youtubeEmbed(ad); as embed) {
          <iframe
            #ytFrame
            [src]="embed"
            class="h-full w-full border-0"
            allow="autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            (load)="onYouTubeLoad()"
          ></iframe>
        } @else if (ad.video) {
          <video
            #videoEl
            [src]="ad.video"
            class="h-full w-full object-cover"
            autoplay
            playsinline
            muted
            (loadeddata)="syncMute()"
            (ended)="next()"
            (play)="videoPlaying.set(true); syncMute()"
            (pause)="videoPlaying.set(false)"
          ></video>
        } @else {
          <img
            [src]="ad.image || ''"
            [alt]="ad.name || 'Advertisement'"
            class="h-full w-full object-cover"
          />
        }

        <button
          type="button"
          class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-opacity hover:bg-black/75"
          (click)="prev()"
        >
          ←
        </button>
        <button
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-opacity hover:bg-black/75"
          (click)="next()"
        >
          →
        </button>

        <div class="absolute bottom-0 left-0 right-0 bg-primary p-4 text-primary-foreground">
          <p class="font-semibold">{{ ad.name || 'Untitled Ad' }}</p>
          <p class="text-sm opacity-90">Branches: {{ branchNames(ad) }}</p>
        </div>

        <div class="absolute right-4 top-4 flex space-x-1">
          @for (item of filteredAds(); track item.id; let i = $index) {
            <div
              class="size-2 rounded-full"
              [class.bg-white]="i === index()"
              [class.bg-white/50]="i !== index()"
            ></div>
          }
        </div>
      </div>
    }
  `,
})
export class DashboardAdCarouselComponent implements OnChanges, OnDestroy {
  private readonly platform = inject(PLATFORM_ID);
  private readonly sanitizer = inject(DomSanitizer);

  @Input() ads: DashboardAd[] = [];
  @Input() branches: DashboardBranch[] = [];
  @Input() currentBranchId?: string;
  @Input()
  set enableAudio(value: boolean) {
    this._enableAudio = Boolean(value);
    this.queueMuteSync();
  }
  get enableAudio() {
    return this._enableAudio;
  }
  private _enableAudio = false;

  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('ytFrame') ytFrame?: ElementRef<HTMLIFrameElement>;

  readonly index = signal(0);
  readonly videoPlaying = signal(false);
  readonly filteredAds = signal<DashboardAd[]>([]);

  private timer?: ReturnType<typeof setTimeout>;
  private muteTimer?: ReturnType<typeof setTimeout>;
  private ytPlayer?: { destroy: () => void; mute: () => void; unMute: () => void };
  private embedCache = new Map<string, SafeResourceUrl>();

  ngOnChanges(changes: SimpleChanges) {
    if (!isPlatformBrowser(this.platform)) return;
    if (changes['ads'] || changes['currentBranchId']) {
      this.recompute();
      this.index.set(0);
      this.scheduleAdvance();
      this.queueMuteSync();
    }
  }

  ngOnDestroy() {
    this.clearTimer();
    if (this.muteTimer) clearTimeout(this.muteTimer);
    this.destroyYt();
  }

  current() {
    const list = this.filteredAds();
    if (!list.length) return null;
    return list[this.index() % list.length] ?? null;
  }

  prev() {
    const n = this.filteredAds().length;
    if (!n) return;
    this.index.set((this.index() - 1 + n) % n);
    this.scheduleAdvance();
    this.queueMuteSync();
  }

  next() {
    const n = this.filteredAds().length;
    if (!n) return;
    this.index.set((this.index() + 1) % n);
    this.scheduleAdvance();
    this.queueMuteSync();
  }

  branchNames(ad: DashboardAd) {
    const ids = ad.branchIds ?? [];
    const names = ids
      .map((id) => this.branches.find((b) => b.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(', ') : 'All Branches';
  }

  youtubeEmbed(ad: DashboardAd): SafeResourceUrl | null {
    if (!ad.youtubeUrl) return null;
    // Always start muted in the embed URL; mute/unmute is controlled via the YT API.
    const key = `${ad.youtubeUrl}|${!!ad.isLive}`;
    const cached = this.embedCache.get(key);
    if (cached) return cached;
    const id = this.youtubeId(ad.youtubeUrl);
    if (!id) return null;
    const origin = isPlatformBrowser(this.platform) ? window.location.origin : '';
    const base = ad.isLive
      ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${id}&enablejsapi=1&origin=${origin}`
      : `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&enablejsapi=1&origin=${origin}`;
    const safe = this.sanitizer.bypassSecurityTrustResourceUrl(base);
    this.embedCache.set(key, safe);
    return safe;
  }

  onYouTubeLoad() {
    const ad = this.current();
    if (!ad?.youtubeUrl) return;
    this.ensureYtApi().then(() => {
      const iframe = this.ytFrame?.nativeElement;
      if (!iframe || !window.YT?.Player) return;
      this.destroyYt();
      this.ytPlayer = new window.YT.Player(iframe, {
        events: {
          onStateChange: (e) => {
            if (!ad.isLive && e.data === window.YT?.PlayerState.ENDED) this.next();
          },
          onReady: () => this.syncMute(),
        },
      });
    });
  }

  syncMute() {
    const video = this.videoEl?.nativeElement;
    if (video) {
      const muted = !this.enableAudio;
      video.defaultMuted = muted;
      video.muted = muted;
      video.volume = muted ? 0 : 1;
      if (muted) video.setAttribute('muted', '');
      else video.removeAttribute('muted');
      if (this.enableAudio && video.paused) {
        void video.play().catch(() => undefined);
      }
    }
    try {
      if (this.enableAudio) this.ytPlayer?.unMute();
      else this.ytPlayer?.mute();
    } catch {
      /* ignore */
    }
  }

  private queueMuteSync() {
    if (!isPlatformBrowser(this.platform)) return;
    if (this.muteTimer) clearTimeout(this.muteTimer);
    // Wait a tick so ViewChild points at the current <video>/iframe after @if swaps.
    this.muteTimer = setTimeout(() => this.syncMute(), 50);
  }

  private recompute() {
    const filtered = this.ads.filter(
      (ad) =>
        !this.currentBranchId ||
        (Array.isArray(ad.branchIds) && ad.branchIds.includes(this.currentBranchId)),
    );
    this.filteredAds.set(filtered);
  }

  private scheduleAdvance() {
    this.clearTimer();
    this.destroyYt();
    const ad = this.current();
    const n = this.filteredAds().length;
    if (!ad || n <= 1) return;

    if (ad.youtubeUrl && ad.isLive) return;
    if (ad.video) return;
    if (ad.youtubeUrl) return;

    this.timer = setTimeout(() => this.next(), 5000);
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private destroyYt() {
    try {
      this.ytPlayer?.destroy();
    } catch {
      /* ignore */
    }
    this.ytPlayer = undefined;
  }

  private youtubeId(url: string) {
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
    return match && match[2].length === 11 ? match[2] : null;
  }

  private ensureYtApi() {
    return new Promise<void>((resolve) => {
      if (!isPlatformBrowser(this.platform)) {
        resolve();
        return;
      }
      if (window.YT?.Player) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const poll = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(poll);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(poll);
        resolve();
      }, 8000);
    });
  }
}
