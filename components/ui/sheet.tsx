'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { XIcon } from 'lucide-react';

/**
 * Sheet — mobile-first slide-in panel built on Radix Dialog.
 *
 * Unlike the centered Dialog, Sheet slides in from a screen edge (left,
 * right, top, or bottom) and is the foundation for mobile drawer UIs:
 * scene sidebar, chat area, and roundtable bottom sheet.
 */

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0',
        'bg-black/40 supports-backdrop-filter:backdrop-blur-xs',
        'fixed inset-0 z-50 duration-200',
        className,
      )}
      {...props}
    />
  );
}

type SheetSide = 'left' | 'right' | 'top' | 'bottom';

const SIDE_CLASSES: Record<SheetSide, string> = {
  left: cn(
    'data-open:animate-in data-closed:animate-out',
    'data-closed:slide-out-to-left data-open:slide-in-from-left',
    'fixed inset-y-0 left-0 z-50 h-full w-[85vw] max-w-sm',
  ),
  right: cn(
    'data-open:animate-in data-closed:animate-out',
    'data-closed:slide-out-to-right data-open:slide-in-from-right',
    'fixed inset-y-0 right-0 z-50 h-full w-[85vw] max-w-sm',
  ),
  top: cn(
    'data-open:animate-in data-closed:animate-out',
    'data-closed:slide-out-to-top data-open:slide-in-from-top',
    'fixed inset-x-0 top-0 z-50 w-full',
  ),
  bottom: cn(
    'data-open:animate-in data-closed:animate-out',
    'data-closed:slide-out-to-bottom data-open:slide-in-from-bottom',
    'fixed inset-x-0 bottom-0 z-50 w-full rounded-t-2xl',
  ),
};

interface SheetContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content> {
  side?: SheetSide;
  showCloseButton?: boolean;
  /** Whether to apply safe-area padding (default: true for top/bottom) */
  safeArea?: boolean;
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  safeArea,
  ...props
}: SheetContentProps) {
  const applySafeArea = safeArea ?? (side === 'top' || side === 'bottom');

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'bg-background shadow-xl ring-1 ring-foreground/5',
          'flex flex-col gap-0 outline-none duration-300',
          SIDE_CLASSES[side],
          applySafeArea && side === 'top' && 'pt-[var(--safe-area-top)]',
          applySafeArea && side === 'bottom' && 'pb-[var(--safe-area-bottom)]',
          applySafeArea && side === 'left' && 'pl-[var(--safe-area-left)]',
          applySafeArea && side === 'right' && 'pr-[var(--safe-area-right)]',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            asChild
            className="absolute top-3 right-3 z-10"
          >
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <XIcon className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        'flex flex-col gap-1.5 border-b px-4 py-3',
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'mt-auto flex flex-col gap-2 border-t px-4 py-3',
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-base font-semibold leading-none', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Drag handle for bottom sheets — a visual affordance for dragging. */
function SheetDragHandle({ className }: { className?: string }) {
  return (
    <div className="flex justify-center pt-2 pb-1 shrink-0">
      <div
        className={cn(
          'h-1 w-10 rounded-full bg-muted-foreground/30',
          className,
        )}
      />
    </div>
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetDragHandle,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
