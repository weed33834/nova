'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';
// global-error replaces the root layout, so it must pull in global styles
// itself — Tailwind classes used below depend on this import.
import './globals.css';

/**
 * Global error boundary — the last line of defense.
 *
 * This component replaces the root `layout.tsx` when it (or anything rendered
 * by it, including providers) throws during render. Because the root layout is
 * bypassed, none of the app providers (ThemeProvider, I18nProvider, …) are
 * available here. The UI is therefore intentionally minimal and uses hardcoded
 * English copy so it can render even when i18n is not initialised.
 *
 * Next.js requires global-error to render its own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error, error.digest ?? '');
  }, [error]);

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-center text-slate-100">
          <div className="w-full max-w-md space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-red-500/15">
                <AlertTriangle className="size-8 text-red-500" />
              </div>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="text-sm text-slate-400">
                An unexpected error occurred. You can try again or reload the page.
              </p>
            </div>

            {/* Collapsible error details */}
            {error.message ? (
              <details className="rounded-md border border-slate-800 bg-slate-900 text-left">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-400 select-none hover:bg-slate-800/60">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Show details</span>
                </summary>
                <div className="border-t border-slate-800 px-4 py-3">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-400">
                    {error.message}
                    {error.digest ? `\n\nDigest: ${error.digest}` : ''}
                    {error.stack ? `\n\n${error.stack}` : ''}
                  </pre>
                </div>
              </details>
            ) : null}

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-100 px-4 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-200"
              >
                <RotateCcw className="size-4" />
                Try again
              </button>
              <button
                type="button"
                onClick={handleReload}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-700 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
              >
                <RefreshCw className="size-4" />
                Reload page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
