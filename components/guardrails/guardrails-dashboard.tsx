'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, Scan, FileWarning } from 'lucide-react';
import {
  checkContentSafety,
  checkHallucinationRisk,
  runAllGuardrails,
} from '@/lib/guardrails/content-safety';
import type { GuardrailResult } from '@/lib/guardrails/types';

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  content_safety: <Shield className="h-4 w-4" />,
  hallucination: <AlertTriangle className="h-4 w-4" />,
  toxicity: <ShieldAlert className="h-4 w-4" />,
  pii_leakage: <FileWarning className="h-4 w-4" />,
  factual_accuracy: <Scan className="h-4 w-4" />,
};

export function GuardrailsDashboard() {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [sourceInput, setSourceInput] = useState('');
  const [results, setResults] = useState<GuardrailResult[]>([]);
  const [hasRun, setHasRun] = useState(false);

  const runCheck = () => {
    if (!input.trim()) return;
    const safetyResults = checkContentSafety(input);
    const hallucinationResult = checkHallucinationRisk(input, sourceInput || undefined);
    setResults([...safetyResults, hallucinationResult]);
    setHasRun(true);
  };

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('guardrails.title')}</h3>
        </div>
        <Button size="sm" onClick={runCheck} className="gap-1.5" disabled={!input.trim()}>
          <Scan className="h-4 w-4" /> {t('guardrails.runCheck')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <label className="text-sm font-medium mb-2 block">{t('guardrails.contentLabel')}</label>
          <Textarea
            placeholder={t('guardrails.contentPlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="h-[200px] resize-none"
          />
        </Card>
        <Card className="p-4">
          <label className="text-sm font-medium mb-2 block">{t('guardrails.sourceLabel')}</label>
          <Textarea
            placeholder={t('guardrails.sourcePlaceholder')}
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            className="h-[200px] resize-none"
          />
        </Card>
      </div>

      {hasRun && (
        <>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2',
                passed > 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : '',
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              {t('guardrails.passed')}: {passed}
            </div>
            <div
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2',
                failed > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : '',
              )}
            >
              <ShieldAlert className="h-4 w-4" />
              {t('guardrails.failed')}: {failed}
            </div>
          </div>

          <ScrollArea className="h-[250px]">
            <div className="space-y-2">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-3 rounded-lg border text-sm',
                    result.passed
                      ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                      : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {TYPE_ICONS[result.type] || <Shield className="h-4 w-4" />}
                      <span className="font-medium">{result.type}</span>
                      <Badge className={cn('text-[10px]', SEVERITY_COLORS[result.severity])}>
                        {result.severity}
                      </Badge>
                      <Badge
                        variant={result.passed ? 'secondary' : 'destructive'}
                        className="text-[10px]"
                      >
                        {result.passed ? t('guardrails.passed') : t('guardrails.failed')}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs mt-1 text-muted-foreground">{result.message}</p>
                  {result.suggestion && (
                    <p className="text-xs mt-0.5 text-amber-600 dark:text-amber-400">
                      {t('guardrails.suggestion')} {result.suggestion}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
