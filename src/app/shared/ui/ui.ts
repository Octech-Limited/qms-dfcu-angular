import { Component, Input } from '@angular/core';
import { BrnButton } from '@spartan-ng/brain/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

@Component({
  selector: '[uiBtn]',
  standalone: true,
  hostDirectives: [BrnButton],
  template: `<ng-content />`,
  host: {
    '[class]': 'classes',
    '[attr.disabled]': 'disabled ? "" : null',
    '[attr.aria-disabled]': 'disabled',
  },
})
export class UiButton {
  @Input() variant: NonNullable<VariantProps<typeof buttonVariants>['variant']> = 'default';
  @Input() size: NonNullable<VariantProps<typeof buttonVariants>['size']> = 'default';
  @Input() disabled = false;
  @Input() extraClass = '';
  get classes() {
    return cn(buttonVariants({ variant: this.variant, size: this.size }), this.extraClass);
  }
}

@Component({
  selector: 'ui-card',
  standalone: true,
  template: `<ng-content />`,
  host: { '[class]': 'classes' },
})
export class UiCard {
  @Input() class = '';
  get classes() {
    return cn(
      'glass flex w-full flex-col gap-6 rounded-xl border py-6 text-card-foreground',
      this.class,
    );
  }
}

@Component({
  selector: 'ui-card-header',
  standalone: true,
  template: `<ng-content />`,
  host: { '[class]': 'classes' },
})
export class UiCardHeader {
  @Input() class = '';
  get classes() {
    return cn('grid auto-rows-min items-start gap-1.5 px-6', this.class);
  }
}

@Component({
  selector: 'ui-card-title',
  standalone: true,
  template: `<ng-content />`,
  host: { '[class]': 'classes' },
})
export class UiCardTitle {
  @Input() class = '';
  get classes() {
    return cn('block font-semibold leading-none', this.class);
  }
}

@Component({
  selector: 'ui-card-description',
  standalone: true,
  template: `<ng-content />`,
  host: { '[class]': 'classes' },
})
export class UiCardDescription {
  @Input() class = '';
  get classes() {
    return cn('block text-sm text-muted-foreground', this.class);
  }
}

@Component({
  selector: 'ui-card-content',
  standalone: true,
  template: `<ng-content />`,
  host: { '[class]': 'classes' },
})
export class UiCardContent {
  @Input() class = '';
  get classes() {
    return cn('block px-6', this.class);
  }
}

@Component({
  selector: 'ui-card-footer',
  standalone: true,
  template: `<ng-content />`,
  host: { '[class]': 'classes' },
})
export class UiCardFooter {
  @Input() class = '';
  get classes() {
    return cn('flex items-center px-6', this.class);
  }
}

@Component({
  selector: 'ui-queue-spinner',
  standalone: true,
  template: `
    <div [class]="containerClass" role="status" aria-label="Loading">
      @for (dot of dots; track dot) {
        <span class="queue-spinner-dot absolute rounded-full bg-primary" [class]="dotClass"></span>
      }
      <span class="sr-only">Loading...</span>
    </div>
  `,
})
export class UiQueueSpinner {
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() dotCount = 8;

  get dots() {
    return Array.from({ length: this.dotCount }, (_, index) => index);
  }

  get containerClass() {
    return cn(
      'relative',
      `queue-spinner-n${this.dotCount}`,
      this.size === 'sm' ? 'size-8' : this.size === 'lg' ? 'size-16' : 'size-12',
    );
  }

  get dotClass() {
    const size = this.size === 'sm' ? 'size-1' : this.size === 'lg' ? 'size-3' : 'size-2';
    return `queue-spinner-dot absolute rounded-full bg-primary ${size}`;
  }
}
