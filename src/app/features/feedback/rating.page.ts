import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CheckCircle2, LucideAngularModule, Star } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ratingHeaders } from '../../core/public-config';
import { formatInEat } from '../../core/timezone';
import { ToastService } from '../../core/toast.service';
import {
  UiButton,
  UiCard,
  UiCardContent,
  UiCardDescription,
  UiCardHeader,
  UiCardTitle,
} from '../../shared/ui/ui';

type Ticket = {
  id?: string;
  ticketNo: string;
  issueDescription: string;
  ticketStatus: string;
  rating?: number | null;
  ratingComment?: string | null;
  createdAt: string;
};

@Component({
  selector: 'app-rating',
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
    <div class="min-h-screen bg-gray-100 py-8">
      @if (loading()) {
        <div class="flex min-h-[60vh] items-center justify-center">
          <div class="text-center">
            <div
              class="mx-auto mb-4 size-12 animate-spin rounded-full border-b-2 border-primary"
            ></div>
            <p class="text-muted-foreground">Loading ticket information...</p>
          </div>
        </div>
      } @else if (error()) {
        <div class="flex min-h-[60vh] items-center justify-center p-6">
          <ui-card class="w-full max-w-md">
            <ui-card-header>
              <ui-card-title class="text-center text-red-600">Error</ui-card-title>
            </ui-card-header>
            <ui-card-content class="space-y-4 text-center">
              <p class="text-muted-foreground">{{ error() }}</p>
              <button uiBtn extraClass="w-full" (click)="goHome()">Go Home</button>
            </ui-card-content>
          </ui-card>
        </div>
      } @else if (!ticket()) {
        <div class="flex min-h-[60vh] items-center justify-center p-6">
          <ui-card class="w-full max-w-md">
            <ui-card-header>
              <ui-card-title class="text-center">Ticket Not Found</ui-card-title>
            </ui-card-header>
            <ui-card-content class="space-y-4 text-center">
              <p class="text-muted-foreground">The requested ticket could not be found.</p>
              <button uiBtn extraClass="w-full" (click)="goHome()">Go Home</button>
            </ui-card-content>
          </ui-card>
        </div>
      } @else if (ticket()?.rating) {
        <div class="mx-auto flex max-w-2xl items-center justify-center px-4">
          <ui-card class="w-full">
            <ui-card-header class="text-center">
              <ui-card-title
                class="flex items-center justify-center text-3xl font-bold text-green-600"
              >
                <lucide-angular [img]="icons.CheckCircle2" class="mr-2 size-8"></lucide-angular>
                Thank You for Your Feedback!
              </ui-card-title>
              <ui-card-description class="text-lg">
                Your feedback helps us improve our service quality
              </ui-card-description>
            </ui-card-header>
            <ui-card-content class="space-y-6">
              <div class="rounded-lg bg-gray-50 p-6">
                <h3 class="mb-4 text-center font-semibold text-gray-800">Your Service Summary</h3>
                <div class="space-y-2 text-sm text-gray-600">
                  <div class="flex justify-between">
                    <span class="font-medium">Ticket Number:</span>
                    <span>{{ ticket()?.ticketNo }}</span>
                  </div>
                  <div class="flex justify-between gap-4">
                    <span class="font-medium">Service:</span>
                    <span class="text-right">{{ ticket()?.issueDescription }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="font-medium">Your Rating:</span>
                    <div class="flex items-center">
                      @for (n of stars; track n) {
                        <lucide-angular
                          [img]="icons.Star"
                          [size]="16"
                          [color]="(ticket()?.rating || 0) >= n ? '#facc15' : '#d1d5db'"
                          [class]="
                            (ticket()?.rating || 0) >= n ? 'fill-yellow-400' : 'fill-transparent'
                          "
                        ></lucide-angular>
                      }
                      <span class="ml-2">({{ ticket()?.rating }}/5)</span>
                    </div>
                  </div>
                  @if (ticket()?.ratingComment) {
                    <div class="mt-3">
                      <span class="font-medium">Your Comment:</span>
                      <p class="mt-1 rounded border bg-white p-2 text-gray-700">
                        "{{ ticket()?.ratingComment }}"
                      </p>
                    </div>
                  }
                </div>
              </div>

              <div class="rounded-lg bg-primary/10 p-6">
                <h3 class="mb-3 text-center font-semibold text-primary">Need Further Assistance?</h3>
                <div class="space-y-2 text-center text-sm text-primary/80">
                  <p>
                    If you have any questions or need additional support, please reach out to us:
                  </p>
                  <p><span class="font-medium">Phone:</span> 0800 222000 </p>
                  <p><span class="font-medium">WhatsApp:</span> +256776 760760</p>
                  <p>
                    <span class="font-medium">Email:</span> customercare&#64;dfcugroup.com
                  </p>
                  <p><span class="font-medium">Hours:</span> Monday - Friday, 8:00 AM - 5:00 PM</p>
                </div>
              </div>
            </ui-card-content>
          </ui-card>
        </div>
      } @else {
        <div class="mx-auto max-w-2xl px-4">
          <ui-card class="shadow-lg">
            <ui-card-header class="text-center">
              <ui-card-title class="text-3xl font-bold text-primary"
                >Rate Your Experience</ui-card-title
              >
              <ui-card-description class="text-lg">
                Help us improve our service by sharing your feedback
              </ui-card-description>
            </ui-card-header>
            <ui-card-content>
              <div class="mb-6 rounded-lg bg-gray-50 p-4">
                <h3 class="mb-2 font-semibold text-gray-800">Ticket Information</h3>
                <div class="space-y-1 text-sm text-gray-600">
                  <p>
                    <span class="font-medium">Ticket Number:</span> {{ ticket()?.ticketNo }}
                  </p>
                  <p>
                    <span class="font-medium">Service:</span> {{ ticket()?.issueDescription }}
                  </p>
                  <p>
                    <span class="font-medium">Status:</span> {{ ticket()?.ticketStatus }}
                  </p>
                  <p>
                    <span class="font-medium">Date:</span>
                    {{ formatDate(ticket()?.createdAt) }}
                  </p>
                </div>
              </div>

              <form class="space-y-6" (ngSubmit)="submit()">
                <div class="space-y-3">
                  <p class="text-lg font-medium">How would you rate your experience?</p>
                  <div class="flex justify-center gap-2">
                    @for (n of stars; track n) {
                      <button
                        type="button"
                        class="rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-primary"
                        (click)="rating = n"
                        [attr.aria-label]="n + ' stars'"
                      >
                        <lucide-angular
                          [img]="icons.Star"
                          [size]="48"
                          [color]="rating >= n ? '#facc15' : '#d1d5db'"
                          [class]="rating >= n ? 'fill-yellow-400' : 'fill-transparent'"
                        ></lucide-angular>
                      </button>
                    }
                  </div>
                  <p class="text-center text-sm text-muted-foreground">{{ ratingLabel() }}</p>
                </div>

                <div class="space-y-3">
                  <label class="text-lg font-medium" for="comment"
                    >Additional Comments (Optional)</label
                  >
                  <textarea
                    id="comment"
                    class="min-h-[100px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                    [(ngModel)]="comment"
                    name="comment"
                    maxlength="500"
                    placeholder="Tell us more about your experience..."
                  ></textarea>
                  <p class="text-right text-sm text-muted-foreground">
                    {{ comment.length }}/500 characters
                  </p>
                </div>

                <div class="flex justify-center">
                  <button
                    uiBtn
                    type="submit"
                    extraClass="px-8 py-3 text-lg h-auto"
                    [disabled]="submitting() || rating === 0"
                  >
                    {{ submitting() ? 'Submitting...' : 'Submit Rating' }}
                  </button>
                </div>
              </form>
            </ui-card-content>
          </ui-card>
        </div>
      }

      @if (showSuccess()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div class="mb-2 flex items-center justify-center text-2xl font-semibold text-green-600">
              <lucide-angular [img]="icons.CheckCircle2" class="mr-2 size-8"></lucide-angular>
              Thank You!
            </div>
            <p class="text-center text-lg">
              Thank you for your feedback! Your rating has been submitted successfully.
            </p>
          </div>
        </div>
      }
    </div>
  `,
})
export class RatingPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  id = '';
  rating = 0;
  comment = '';
  readonly stars = [1, 2, 3, 4, 5];
  readonly icons = { CheckCircle2, Star };

  ticket = signal<Ticket | null>(null);
  loading = signal(true);
  submitting = signal(false);
  showSuccess = signal(false);
  error = signal<string | null>(null);

  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    await this.fetchTicket();
  }

  formatDate(value?: string) {
    return formatInEat(value, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  ratingLabel() {
    if (this.rating === 0) return 'Click a star to rate';
    if (this.rating === 1) return 'Poor';
    if (this.rating === 2) return 'Fair';
    if (this.rating === 3) return 'Good';
    if (this.rating === 4) return 'Very Good';
    return 'Excellent';
  }

  goHome() {
    void this.router.navigateByUrl('/');
  }

  async fetchTicket() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const ticket = await this.api.get<Ticket>(`/api/bank/ratings/ticket/${this.id}`, undefined, {
        headers: ratingHeaders(),
      });
      this.ticket.set(ticket);
      if (ticket.rating) this.rating = ticket.rating;
      if (ticket.ratingComment) this.comment = ticket.ratingComment;
    } catch (error: unknown) {
      const err = error as { error?: { error?: string } };
      this.error.set(err.error?.error || 'Failed to load ticket information');
      this.ticket.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async submit() {
    if (this.rating === 0) {
      this.toast.error('Please select a rating');
      return;
    }
    if (this.ticket()?.rating) {
      this.toast.error('Rating has already been submitted for this ticket');
      return;
    }
    this.submitting.set(true);
    try {
      await this.api.post(
        `/api/bank/ratings/ticket/${this.id}`,
        { rating: this.rating, ratingComment: this.comment.trim() || null },
        { headers: ratingHeaders() }
      );
      this.showSuccess.set(true);
      setTimeout(() => {
        this.showSuccess.set(false);
        window.location.reload();
      }, 3000);
    } catch (error: unknown) {
      const err = error as { error?: { error?: string } };
      this.toast.error(err.error?.error || 'Failed to submit rating');
    } finally {
      this.submitting.set(false);
    }
  }
}
