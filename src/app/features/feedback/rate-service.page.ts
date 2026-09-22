import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertCircle,
  CheckCircle2,
  LucideAngularModule,
  Search,
  Star,
} from 'lucide-angular';
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

type Branch = { id: string; name: string; address: string };
type Ticket = {
  id: string;
  ticketNo: string;
  issueDescription: string;
  ticketStatus: string;
  rating?: number | null;
  ratingComment?: string | null;
  createdAt: string;
};

@Component({
  selector: 'app-rate-service',
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
      @if (loadingBranch()) {
        <div class="flex min-h-[60vh] items-center justify-center">
          <div class="text-center">
            <div
              class="mx-auto mb-4 size-12 animate-spin rounded-full border-b-2 border-primary"
            ></div>
            <p class="text-muted-foreground">Loading branch information...</p>
          </div>
        </div>
      } @else if (!branch()) {
        <div class="flex min-h-[60vh] items-center justify-center p-6">
          <ui-card class="w-full max-w-md">
            <ui-card-header>
              <ui-card-title class="text-center">Branch Not Found</ui-card-title>
            </ui-card-header>
            <ui-card-content class="space-y-4 text-center">
              <p class="text-muted-foreground">The requested branch could not be found.</p>
              <button uiBtn extraClass="w-full" (click)="goLogin()">Go Back</button>
            </ui-card-content>
          </ui-card>
        </div>
      } @else if (showRatingForm() && ticket()) {
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
              <div class="mb-6 rounded-lg bg-primary/10 p-4">
                <h3 class="mb-1 font-semibold text-primary">{{ branch()?.name }}</h3>
                <p class="text-sm text-primary/80">{{ branch()?.address }}</p>
              </div>

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

              <form class="space-y-6" (ngSubmit)="submitRating()">
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
      } @else {
        <div class="mx-auto flex max-w-md items-center justify-center px-4">
          <ui-card class="w-full shadow-lg">
            <ui-card-header class="text-center">
              <ui-card-title class="flex items-center justify-center text-3xl font-bold text-primary">
                <lucide-angular [img]="icons.Search" class="mr-2 size-8"></lucide-angular>
                Rate Your Service
              </ui-card-title>
              <ui-card-description class="text-lg">
                Enter your ticket number to rate your experience
              </ui-card-description>
            </ui-card-header>
            <ui-card-content>
              <div class="mb-6 rounded-lg bg-primary/10 p-4">
                <h3 class="mb-1 font-semibold text-primary">{{ branch()?.name }}</h3>
                <p class="text-sm text-primary/80">{{ branch()?.address }}</p>
              </div>

              <form class="space-y-6" (ngSubmit)="search()">
                <div class="space-y-3">
                  <label class="text-lg font-medium" for="ticketNumber">Ticket Number</label>
                  <input
                    id="ticketNumber"
                    class="h-12 w-full rounded-md border border-input bg-background px-3 text-lg outline-none focus:ring-2 focus:ring-ring/40"
                    [(ngModel)]="ticketNo"
                    name="ticketNo"
                    placeholder="Enter your ticket number (e.g., A01, B15)"
                    required
                  />
                  <p class="text-sm text-muted-foreground">Only tickets from today can be rated</p>
                </div>

                @if (error()) {
                  <div class="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div class="flex items-center">
                      <lucide-angular
                        [img]="icons.AlertCircle"
                        class="mr-2 size-5 text-red-500"
                      ></lucide-angular>
                      <p class="text-sm text-red-700">{{ error() }}</p>
                    </div>
                  </div>
                }

                <button
                  uiBtn
                  type="submit"
                  extraClass="w-full h-12 text-lg"
                  [disabled]="searching()"
                >
                  @if (searching()) {
                    <span class="flex items-center justify-center gap-2">
                      <span
                        class="size-5 animate-spin rounded-full border-b-2 border-white"
                      ></span>
                      Searching...
                    </span>
                  } @else {
                    Find Ticket
                  }
                </button>
              </form>

              <div class="mt-6 rounded-lg bg-primary/10 p-4">
                <h3 class="mb-2 font-semibold text-primary">Instructions:</h3>
                <ul class="space-y-1 text-sm text-primary/80">
                  <li>• Enter your ticket number exactly as shown on your ticket</li>
                  <li>• Only today's tickets can be rated</li>
                  <li>• Each ticket can only be rated once</li>
                  <li>• Your feedback helps us improve our service</li>
                </ul>
              </div>
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
            <p class="mt-2 text-center text-sm text-muted-foreground">
              The form will reset in 3 seconds for the next customer
            </p>
          </div>
        </div>
      }
    </div>
  `,
})
export class RateServicePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  branchId = '';
  ticketNo = '';
  rating = 0;
  comment = '';
  readonly stars = [1, 2, 3, 4, 5];
  readonly icons = { AlertCircle, CheckCircle2, Search, Star };

  branch = signal<Branch | null>(null);
  ticket = signal<Ticket | null>(null);
  loadingBranch = signal(true);
  searching = signal(false);
  submitting = signal(false);
  showRatingForm = signal(false);
  showSuccess = signal(false);
  error = signal<string | null>(null);

  async ngOnInit() {
    this.branchId = this.route.snapshot.paramMap.get('id') || '';
    try {
      this.branch.set(
        await this.api.get<Branch>(`/api/bank/ratings/branch/${this.branchId}`, undefined, {
          headers: ratingHeaders(),
        })
      );
    } catch {
      this.branch.set(null);
      this.error.set('Branch not found');
    } finally {
      this.loadingBranch.set(false);
    }
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

  goLogin() {
    void this.router.navigateByUrl('/feedback/login');
  }

  resetForm() {
    this.ticketNo = '';
    this.ticket.set(null);
    this.rating = 0;
    this.comment = '';
    this.showRatingForm.set(false);
    this.error.set(null);
  }

  async search() {
    if (!this.ticketNo.trim()) {
      this.toast.error('Please enter a ticket number');
      return;
    }
    this.searching.set(true);
    this.error.set(null);
    try {
      const result = await this.api.get<{
        success: boolean;
        ticket?: Ticket;
        error?: string;
      }>(
        '/api/bank/ratings/ticket/search',
        { ticketNo: this.ticketNo.trim(), branchId: this.branchId },
        { headers: ratingHeaders() }
      );
      if (result.success && result.ticket) {
        if (result.ticket.rating) {
          this.error.set(
            'This ticket already has feedback submitted. Each ticket can only be rated once.'
          );
          this.ticket.set(null);
          this.showRatingForm.set(false);
          return;
        }
        this.ticket.set(result.ticket);
        this.showRatingForm.set(true);
        this.toast.success('Ticket found! Please rate your experience.');
      } else {
        this.error.set('Ticket not found. Please check the ticket number and try again.');
        this.ticket.set(null);
        this.showRatingForm.set(false);
      }
    } catch (error: unknown) {
      const err = error as { error?: { error?: string } };
      this.error.set(err.error?.error || 'Failed to find ticket');
      this.ticket.set(null);
      this.showRatingForm.set(false);
    } finally {
      this.searching.set(false);
    }
  }

  async submitRating() {
    const ticket = this.ticket();
    if (this.rating === 0) {
      this.toast.error('Please select a rating');
      return;
    }
    if (!ticket) {
      this.toast.error('No ticket selected');
      return;
    }
    this.submitting.set(true);
    try {
      await this.api.post(
        `/api/bank/ratings/ticket/${ticket.id}`,
        { rating: this.rating, ratingComment: this.comment.trim() || null },
        { headers: ratingHeaders() }
      );
      this.showSuccess.set(true);
      setTimeout(() => {
        this.showSuccess.set(false);
        this.resetForm();
      }, 3000);
    } catch (error: unknown) {
      const err = error as { error?: { error?: string } };
      this.toast.error(err.error?.error || 'Failed to submit rating');
    } finally {
      this.submitting.set(false);
    }
  }
}
