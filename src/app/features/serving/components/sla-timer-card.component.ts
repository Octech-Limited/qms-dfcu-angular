import { Component, Input } from '@angular/core';
import { UiCard, UiCardContent } from '../../../shared/ui/ui';

@Component({
  selector: 'app-sla-timer-card',
  imports: [UiCard, UiCardContent],
  template: `
    @if (slaTimeRemaining !== null) {
      <ui-card
        [class]="
          'border-2 ' +
          (slaExceeded
            ? 'border-red-500 bg-red-50'
            : slaInGracePeriod
              ? 'border-primary bg-primary/5'
              : 'border-green-500 bg-green-50')
        "
      >
        <ui-card-content class="pt-6">
          <div class="flex items-center justify-center">
            <div class="text-center">
              <p class="mb-1 text-sm font-medium text-muted-foreground">
                {{
                  slaExceeded ? 'SLA Exceeded' : slaInGracePeriod ? 'Grace Period' : 'SLA Timer'
                }}
              </p>
              <div
                class="text-5xl font-bold"
                [class.text-red-600]="slaExceeded"
                [class.text-primary]="slaInGracePeriod && !slaExceeded"
                [class.text-green-600]="!slaExceeded && !slaInGracePeriod"
              >
                {{ displayTime }}
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {{
                  slaExceeded
                    ? 'Time over SLA limit'
                    : slaInGracePeriod
                      ? 'Grace period before SLA starts'
                      : 'SLA time remaining'
                }}
              </p>
            </div>
          </div>
        </ui-card-content>
      </ui-card>
    }
  `,
})
export class SlaTimerCardComponent {
  @Input() slaTimeRemaining: number | null = null;
  @Input() slaExceeded = false;
  @Input() slaInGracePeriod = false;

  get displayTime() {
    if (this.slaTimeRemaining === null) return '';
    const minutes = Math.floor(this.slaTimeRemaining / 60);
    const seconds = this.slaTimeRemaining % 60;
    const clock = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return this.slaExceeded ? `+${clock}` : clock;
  }
}
