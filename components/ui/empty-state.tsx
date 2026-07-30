'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

export interface EmptyStateProps {
  /** The visual hero of the empty state. A Lucide icon or a small illustration. */
  icon?: LucideIcon;
  /** Optional small emoji or symbol rendered inside a colored disc. */
  glyph?: string;
  /** Heading (already-translated string). */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** Optional primary action slot (button, link, etc.). */
  action?: React.ReactNode;
  /** Optional secondary action slot. */
  secondaryAction?: React.ReactNode;
  /** Visual size — `sm` for inline (e.g. search empty), `md` for section, `lg` for hero. */
  size?: 'sm' | 'md' | 'lg';
  /** Color theme for the icon disc. */
  tone?: 'muted' | 'brand' | 'success' | 'warning' | 'info';
  className?: string;
}

const toneClass: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  muted: 'bg-muted text-muted-foreground ring-border/40',
  brand:
    'bg-gradient-to-br from-pink-100 to-rose-100 dark:from-pink-900/30 dark:to-rose-900/30 text-pink-600 dark:text-pink-300 ring-pink-200/60 dark:ring-pink-800/60',
  success:
    'bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 text-emerald-600 dark:text-emerald-300 ring-emerald-200/60 dark:ring-emerald-800/60',
  warning:
    'bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 text-amber-600 dark:text-amber-300 ring-amber-200/60 dark:ring-amber-800/60',
  info: 'bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30 text-sky-600 dark:text-sky-300 ring-sky-200/60 dark:ring-sky-800/60',
};

const sizeConfig = {
  sm: {
    wrap: 'py-6 px-4',
    disc: 'size-10',
    icon: 'size-5',
    title: 'text-sm',
    desc: 'text-xs',
  },
  md: {
    wrap: 'py-10 px-6',
    disc: 'size-14',
    icon: 'size-7',
    title: 'text-base',
    desc: 'text-sm',
  },
  lg: {
    wrap: 'py-14 px-8',
    disc: 'size-20',
    icon: 'size-10',
    title: 'text-xl',
    desc: 'text-[15px]',
  },
} as const;

/**
 * A single visual language for every "nothing here" surface in the app.
 *
 * Previously each place (search empty, no classrooms, no error patterns,
 * missing knowledge graph nodes, etc.) wrote its own `text-center py-8
 * text-muted-foreground` block, which made the app feel inconsistent —
 * different padding, different icon sizes, sometimes a button, sometimes
 * not. This component is the canonical empty state.
 */
export function EmptyState({
  icon: Icon,
  glyph,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  tone = 'muted',
  className,
}: EmptyStateProps) {
  const cfg = sizeConfig[size];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center text-center w-full',
        cfg.wrap,
        className,
      )}
    >
      {/* Visual hero — circular disc with a soft gradient + ring */}
      <div
        className={cn(
          'mb-4 inline-flex items-center justify-center rounded-full ring-1 shadow-sm',
          toneClass[tone],
          cfg.disc,
        )}
        aria-hidden="true"
      >
        {Icon ? <Icon className={cfg.icon} /> : glyph ? <span className="text-2xl">{glyph}</span> : null}
      </div>

      <h3 className={cn('font-semibold text-foreground/90', cfg.title)}>{title}</h3>
      {description && (
        <p
          className={cn(
            'mt-1.5 text-muted-foreground/80 max-w-sm leading-relaxed',
            cfg.desc,
          )}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-col sm:flex-row items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </motion.div>
  );
}
