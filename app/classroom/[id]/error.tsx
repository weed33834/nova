'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * Route-level error boundary for the classroom page.
 *
 * Catches rendering errors thrown by `app/classroom/[id]/page.tsx` and its
 * descendants so they don't bubble up to the global ErrorBoundary with a
 * generic "Something went wrong" message.
 *
 * Next.js route error components receive `error` (the caught error, optionally
 * with a `digest` for server errors) and `reset` (a function that re-renders
 * the error boundary's children).
 */
export default function ClassroomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error('[ClassroomError]', error, error.digest ?? '');
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-50 p-8 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-8 text-destructive" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            {t('errors.classroomFailedToLoad')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('errors.classroomFailedToLoadDesc')}</p>
        </div>

        {/* Collapsible error details */}
        {error.message ? (
          <details className="group rounded-md border border-border bg-muted/40 text-left">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground select-none hover:bg-muted/60">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{t('errors.showDetails')}</span>
            </summary>
            <div className="border-t border-border px-4 py-3">
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
                {error.message}
                {error.digest ? `\n\nDigest: ${error.digest}` : ''}
                {error.stack ? `\n\n${error.stack}` : ''}
              </pre>
            </div>
          </details>
        ) : null}

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="default" size="default">
            <RotateCcw className="size-4" />
            {t('errors.retry')}
          </Button>
          <Button asChild variant="outline" size="default">
            <Link href="/">
              <ArrowLeft className="size-4" />
              {t('errors.backToHome')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
