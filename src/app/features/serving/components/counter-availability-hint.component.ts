import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CheckCircle2, Loader2, LucideAngularModule, XCircle } from 'lucide-angular';
import { ApiService } from '../../../core/api.service';

@Component({
  selector: 'app-counter-availability-hint',
  imports: [LucideAngularModule],
  template: `
    @if (enabled && counterNumber.trim()) {
      @if (checking()) {
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <lucide-angular [img]="icons.Loader2" class="size-4 animate-spin"></lucide-angular>
          <span>Checking availability...</span>
        </div>
      } @else if (result()) {
        <div
          class="flex items-center gap-2 text-sm font-medium"
          [class.text-green-600]="result()!.available"
          [class.text-red-600]="!result()!.available"
        >
          <lucide-angular
            [img]="result()!.available ? icons.CheckCircle2 : icons.XCircle"
            class="size-4 shrink-0"
          ></lucide-angular>
          <span>{{ result()!.message }}</span>
        </div>
      }
    }
  `,
})
export class CounterAvailabilityHintComponent implements OnChanges, OnDestroy {
  private readonly api = inject(ApiService);

  @Input() counterNumber = '';
  @Input() branchId = '';
  @Input() excludeCounterId: string | null = null;
  @Input() enabled = true;
  @Output() statusChange = new EventEmitter<boolean | null>();

  readonly checking = signal(false);
  readonly result = signal<{ available: boolean; message: string } | null>(null);
  readonly icons = { CheckCircle2, Loader2, XCircle };

  private timer?: ReturnType<typeof setTimeout>;
  private requestId = 0;

  ngOnChanges(_changes: SimpleChanges) {
    this.scheduleCheck();
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
    this.requestId++;
  }

  private scheduleCheck() {
    if (this.timer) clearTimeout(this.timer);
    const trimmed = String(this.counterNumber ?? '').trim();
    if (!this.enabled || !this.branchId || !/^[0-9]+$/.test(trimmed)) {
      this.result.set(null);
      this.checking.set(false);
      this.statusChange.emit(null);
      return;
    }

    this.timer = setTimeout(() => void this.runCheck(trimmed), 300);
  }

  private async runCheck(trimmed: string) {
    const id = ++this.requestId;
    this.checking.set(true);
    try {
      const data = await this.api.get<{ available: boolean; message?: string; error?: string }>(
        '/api/bank/counter/check-availability',
        {
          counterNumber: trimmed,
          branchId: this.branchId,
          excludeCounterId: this.excludeCounterId || undefined,
        },
      );
      if (id !== this.requestId) return;
      const available = Boolean(data.available);
      this.result.set({
        available,
        message:
          data.message ||
          (available
            ? `Counter ${trimmed} is available`
            : `Counter ${trimmed} is already taken today`),
      });
      this.statusChange.emit(available);
    } catch {
      if (id !== this.requestId) return;
      this.result.set({
        available: false,
        message: 'Error checking counter availability. Please try again.',
      });
      this.statusChange.emit(false);
    } finally {
      if (id === this.requestId) this.checking.set(false);
    }
  }
}
