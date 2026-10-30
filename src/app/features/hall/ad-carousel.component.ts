import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../core/api.service';
import { RealtimeService } from '../../core/realtime.service';
import { eatNow } from '../../core/timezone';

type Ad = {
  id: string;
  name?: string;
  image?: string | null;
  video?: string | null;
  youtubeUrl?: string | null;
  isLive?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  branchIds?: string[];
  branches?: { id: string }[];
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
  selector: 'app-ad-carousel',
  template: `
    <div class="relative flex h-full w-full items-center justify-center overflow-hidden bg-primary">
      @if (loading()) {
        <p class="text-2xl font-semibold text-primary-foreground">Loading ads...</p>
      } @else if (!ads().length) {
        <p class="text-2xl font-semibold text-primary-foreground">
          No ads available for this branch
        </p>
      } @else if (current(); as ad) {
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
            class="max-h-full max-w-full"
            autoplay
            playsinline
            muted
            (loadeddata)="applyAudio()"
            (play)="applyAudio()"
            (ended)="advance()"
          ></video>
        } @else {
          <img
            [src]="ad.image || '/placeholder.svg'"
            [alt]="ad.name || 'Advertisement'"
            class="max-h-full max-w-full object-contain"
          />
        }
      }
    </div>
  `,
})
export class AdCarouselComponent implements OnInit, OnChanges, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly platform = inject(PLATFORM_ID);
  private readonly sanitizer = inject(DomSanitizer);

  @Input({ required: true }) branchId = '';
  @Input()
  set enableAudio(value: boolean) {
    this._enableAudio = Boolean(value);
    if (isPlatformBrowser(this.platform)) {
      setTimeout(() => this.applyAudio(), 50);
    }
  }
  get enableAudio() {
    return this._enableAudio;
  }
  private _enableAudio = false;

  @ViewChild('videoEl') videoEl?: ElementRef<HTMLVideoElement>;
  @ViewChild('ytFrame') ytFrame?: ElementRef<HTMLIFrameElement>;

  readonly loading = signal(true);
  readonly ads = signal<Ad[]>([]);
  readonly index = signal(0);

  private readonly realtime = inject(RealtimeService);
  private unsubscribeRealtime?: () => void;
  private pollTimer?: ReturnType<typeof setInterval>;
  private imageTimer?: ReturnType<typeof setTimeout>;
  private ytPlayer: { destroy: () => void; mute: () => void; unMute: () => void } | null = null;
  private ytReady = false;
  private embedCache = new Map<string, SafeResourceUrl>();

  current() {
    const list = this.ads();
    if (!list.length) return null;
    return list[this.index() % list.length] ?? null;
  }

  ngOnInit() {
    if (!isPlatformBrowser(this.platform)) return;
    this.loadYtApi();
    void this.fetchAds(true);
    this.bindRealtime();
    // Safety net only: ad edits arrive as server events.
    this.pollTimer = setInterval(() => void this.fetchAds(false), 60_000);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['branchId'] && !changes['branchId'].firstChange && this.branchId) {
      this.index.set(0);
      this.bindRealtime();
      void this.fetchAds(true);
    }
    if (changes['branchId']) {
      this.scheduleAdvance();
    }
  }

  private bindRealtime() {
    this.unsubscribeRealtime?.();
    if (!this.branchId) return;
    this.unsubscribeRealtime = this.realtime.subscribe(
      ['content', 'resync'],
      (events) => {
        if (events.some((e) => e.type === 'resync' || e.scope === 'ads' || e.scope === 'branch')) {
          void this.fetchAds(false);
        }
      },
      this.branchId,
    );
  }

  ngOnDestroy() {
    this.unsubscribeRealtime?.();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.imageTimer) clearTimeout(this.imageTimer);
    this.destroyYt();
  }

  youtubeEmbed(ad: Ad): SafeResourceUrl | null {
    if (!ad.youtubeUrl) return null;
    const key = `${ad.youtubeUrl}|${!!ad.isLive}`;
    const cached = this.embedCache.get(key);
    if (cached) return cached;
    const id = this.youtubeId(ad.youtubeUrl);
    if (!id) return null;
    const origin = window.location.origin;
    const url = ad.isLive
      ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&loop=1&playlist=${id}&enablejsapi=1&origin=${origin}`
      : `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&enablejsapi=1&origin=${origin}`;
    const safe = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.embedCache.set(key, safe);
    return safe;
  }

  advance() {
    const n = this.ads().length;
    if (n > 1) this.index.update((i) => (i + 1) % n);
    this.scheduleAdvance();
    setTimeout(() => this.applyAudio(), 50);
  }

  onYouTubeLoad() {
    const ad = this.current();
    if (!ad?.youtubeUrl) return;
    void this.ensureYtApi().then(() => {
      const iframe = this.ytFrame?.nativeElement;
      if (!iframe || !window.YT?.Player) return;
      this.destroyYt();
      try {
        this.ytPlayer = new window.YT.Player(iframe, {
          events: {
            onStateChange: (event) => {
              if (!ad.isLive && event.data === window.YT!.PlayerState.ENDED) this.advance();
            },
            onReady: () => this.applyAudio(),
          },
        });
      } catch {
        /* ignore */
      }
    });
  }

  private scheduleAdvance() {
    if (this.imageTimer) clearTimeout(this.imageTimer);
    const ad = this.current();
    if (!ad) return;
    if (ad.youtubeUrl && ad.isLive) return;
    if (ad.video || ad.youtubeUrl) return;
    if (ad.image) {
      this.imageTimer = setTimeout(() => this.advance(), 5000);
    }
  }

  applyAudio() {
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
    if (this.ytPlayer) {
      try {
        if (this.enableAudio) this.ytPlayer.unMute();
        else this.ytPlayer.mute();
      } catch {
        /* ignore */
      }
    }
  }

  private ensureYtApi() {
    return new Promise<void>((resolve) => {
      if (!isPlatformBrowser(this.platform)) {
        resolve();
        return;
      }
      if (window.YT?.Player) {
        this.ytReady = true;
        resolve();
        return;
      }
      this.loadYtApi();
      const poll = setInterval(() => {
        if (window.YT?.Player) {
          this.ytReady = true;
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

  private destroyYt() {
    if (this.ytPlayer) {
      try {
        this.ytPlayer.destroy();
      } catch {
        /* ignore */
      }
      this.ytPlayer = null;
    }
  }

  private youtubeId(url: string): string | null {
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
    return match && match[2].length === 11 ? match[2] : null;
  }

  private loadYtApi() {
    if (window.YT?.Player) {
      this.ytReady = true;
      return;
    }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = () => {
      this.ytReady = true;
    };
    const check = setInterval(() => {
      if (window.YT?.Player) {
        this.ytReady = true;
        clearInterval(check);
      }
    }, 200);
  }

  private async fetchAds(initial: boolean) {
    if (!this.branchId) return;
    if (initial) this.loading.set(true);
    try {
      const data = await this.api.get<Ad[]>('/api/bank/ads', { branchId: this.branchId });
      const now = eatNow().getTime();
      const filtered = (Array.isArray(data) ? data : []).filter((ad) => {
        const ids = ad.branchIds?.length
          ? ad.branchIds
          : (ad.branches || []).map((b) => b.id);
        if (ids.length && !ids.includes(this.branchId)) return false;
        if (ad.validFrom && new Date(ad.validFrom).getTime() > now) return false;
        if (ad.validUntil && new Date(ad.validUntil).getTime() < now) return false;
        return true;
      });
      const prev = this.ads();
      if (JSON.stringify(prev) !== JSON.stringify(filtered)) {
        this.ads.set(filtered);
        if (this.index() >= filtered.length) this.index.set(0);
        this.scheduleAdvance();
      }
    } catch {
      if (initial) this.ads.set([]);
    } finally {
      if (initial) this.loading.set(false);
    }
  }
}
