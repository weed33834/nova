'use client';

import Link from 'next/link';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * Custom 404 page.
 *
 * Rendered within the root layout, so the I18nProvider is available. However,
 * i18n resources are loaded asynchronously, so on first render the `t()`
 * function may return the raw key. We fall back to English copy in that case so
 * the page is always readable.
 */
export default function NotFound() {
  const { t } = useI18n();

  // Fall back to English when the i18n resource for a key hasn't loaded yet
  // (i18next returns the key itself when no translation is found).
  const tr = (key: string, fallback: string) => {
    const result = t(key);
    return result === key ? fallback : result;
  };

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-8 text-center dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="size-8 text-muted-foreground" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-foreground">
            {tr('errors.pageNotFound', 'Page not found')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr(
              'errors.pageNotFoundDesc',
              "The page you are looking for doesn't exist or has been moved.",
            )}
          </p>
        </div>

        {/* Action */}
        <div className="flex justify-center">
          <Button asChild variant="default" size="default">
            <Link href="/">
              <ArrowLeft className="size-4" />
              {tr('errors.backToHome', 'Back to Home')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
