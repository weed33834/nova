'use client';

import { cn } from '@/lib/utils';

/**
 * Single primitive — base shimmer block. The previous version used only
 * Tailwind's `animate-pulse`, which felt "stock shadcn". The new
 * `.nova-skeleton` class (defined in `globals.css`) sweeps a soft gradient
 * left-to-right, which reads as a more polished loading affordance while
 * staying cheap to render (transform-only, no layout thrash).
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('nova-skeleton rounded-md', className)} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border/40 p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <div className="pt-2 flex gap-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonClassroomGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-x-5 sm:gap-y-7">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2.5">
          <Skeleton className="aspect-[16/10] rounded-xl w-full" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton placeholder that mirrors the new mobile horizontal classroom card
 * (thumbnail on the left, info on the right). Prevents the layout from
 * collapsing when the list re-mounts during a search.
 */
export function SkeletonClassroomRow() {
  return (
    <div className="flex gap-3 sm:block items-stretch rounded-2xl ring-1 ring-border/40 bg-white/65 dark:bg-slate-900/45 px-2.5 py-2.5 sm:ring-0 sm:bg-transparent sm:px-0 sm:py-0">
      <Skeleton className="w-[120px] sm:w-full aspect-[16/9] rounded-lg sm:rounded-xl shrink-0" />
      <div className="flex-1 flex flex-col justify-center gap-2 sm:mt-2.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
