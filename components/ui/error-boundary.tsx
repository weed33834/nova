'use client';

import { Component, useState, useCallback, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, Copy, Check, Bug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

interface Props {
  children?: ReactNode;
  /**
   * Optional custom fallback. When provided it fully replaces the default
   * error UI rendered by this boundary.
   */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

interface ErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

/**
 * Default fallback UI rendered when the ErrorBoundary catches a rendering
 * error. Implemented as a function component so it can use hooks (i18n,
 * clipboard, local UI state) which the class-based ErrorBoundary cannot.
 */
function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleCopy = useCallback(async () => {
    const errorInfo = `Error: ${error.message}\n\nStack trace:\n${error.stack ?? '(no stack available)'}`;
    try {
      await navigator.clipboard.writeText(errorInfo);
    } catch {
      // Fallback for environments without the async clipboard API
      try {
        const textarea = document.createElement('textarea');
        textarea.value = errorInfo;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        toast.error(error.message);
        return;
      }
    }
    setCopied(true);
    toast.success(t('errors.copied'));
    window.setTimeout(() => setCopied(false), 2000);
  }, [error, t]);

  const handleReload = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  return (
    <div
      role="alert"
      className="flex min-h-[320px] w-full flex-col items-center justify-center p-8"
    >
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
            {t('errors.somethingWentWrong')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('errors.somethingWentWrongDesc')}</p>
        </div>

        {/* Collapsible error details — message + stack hidden by default */}
        {error.message ? (
          <details
            open={detailsOpen}
            onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
            className="group rounded-md border border-border bg-muted/40 text-left"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground select-none hover:bg-muted/60">
              <Bug className="size-4 shrink-0" />
              <span>{detailsOpen ? t('errors.hideDetails') : t('errors.showDetails')}</span>
            </summary>
            <div className="border-t border-border px-4 py-3">
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ''}
              </pre>
            </div>
          </details>
        ) : null}

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onReset} variant="default" size="default">
            <RotateCcw className="size-4" />
            {t('errors.tryAgain')}
          </Button>
          <Button onClick={handleReload} variant="outline" size="default">
            <RefreshCw className="size-4" />
            {t('errors.reloadPage')}
          </Button>
          <Button onClick={handleCopy} variant="ghost" size="default">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t('errors.copied') : t('errors.copyError')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const error = this.state.error ?? new Error('Unknown error');
      return <ErrorFallback error={error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}
