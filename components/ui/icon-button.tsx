'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

/**
 * Mobile-aware icon-only button.
 *
 * Replaces the dozen one-off `h-9 w-9 rounded-full ...` patterns that were
 * previously hand-rolled in each component (page header, mobile drawer,
 * settings dialog, etc.). The 11×11 (44px) touch target on `mobile` size
 * and 9×9 (36px) on desktop is the single source of truth for icon-button
 * geometry, so they all feel consistent and meet WCAG 2.5.5.
 *
 *  - size="mobile"  → h-11 w-11  (44px, touch target)
 *  - size="compact" → h-9  w-9   (36px, desktop / dense)
 *  - size="sm"      → h-8  w-8   (32px, pill rows, tags)
 */
export type IconButtonSize = 'mobile' | 'compact' | 'sm';
export type IconButtonVariant = 'ghost' | 'soft' | 'solid' | 'subtle';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `soft` is the default (muted, hover lifts to fg). */
  variant?: IconButtonVariant;
  /** Mobile-first responsive size. */
  size?: IconButtonSize;
  /** Required for a11y — describes what tapping the button does. */
  'aria-label': string;
  /** When true, render as the child element (Radix Slot). */
  asChild?: boolean;
  /** Optional tooltip text — applied as `title` for hover affordance. */
  title?: string;
}

const variantClass: Record<IconButtonVariant, string> = {
  // hover-only background; no ring, blends into the page chrome
  ghost:
    'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-95',
  // same as ghost but with a soft always-on background pill (used for selected state)
  soft:
    'text-muted-foreground/80 hover:text-foreground bg-muted/40 hover:bg-muted/70 active:scale-95',
  // primary accent — used sparingly (FAB, primary action)
  solid:
    'text-primary-foreground bg-primary hover:bg-primary/90 active:scale-95 shadow-sm',
  // very subtle — used for inline actions inside lists (rename / delete)
  subtle:
    'text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 active:scale-95',
};

const sizeClass: Record<IconButtonSize, string> = {
  mobile: 'h-11 w-11', // 44px — mobile touch target
  compact: 'h-9 w-9', // 36px — desktop header buttons
  sm: 'h-8 w-8', // 32px — pill rows, dense lists
};

const radiusClass: Record<IconButtonSize, string> = {
  mobile: 'rounded-xl',
  compact: 'rounded-lg',
  sm: 'rounded-lg',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      className,
      variant = 'ghost',
      size = 'compact',
      asChild = false,
      type,
      ...props
    },
    ref,
  ) {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(
          'shrink-0 inline-flex items-center justify-center transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          'disabled:pointer-events-none disabled:opacity-40',
          'no-select-touch',
          sizeClass[size],
          radiusClass[size],
          variantClass[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
