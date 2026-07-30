'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  Brain,
  TrendingUp,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
  Target,
} from 'lucide-react';
import { KnowledgeTracer } from '@/lib/tracing/engine';

const tracer = new KnowledgeTracer({
  forgettingRate: 0.1,
  learningRate: 0.3,
  priorMastery: 0.1,
  responseTimeWeight: 0.05,
  minObservations: 3,
});

const DEMO_CONCEPTS = ['concept-1', 'concept-2', 'concept-3'];
const DEMO_CONCEPT_KEYS: Record<string, string> = {
  'concept-1': 'tracing.demoConcept1',
  'concept-2': 'tracing.demoConcept2',
  'concept-3': 'tracing.demoConcept3',
};

const MASTERY_COLORS: Record<string, string> = {
  novice: 'bg-red-500',
  developing: 'bg-orange-500',
  proficient: 'bg-yellow-500',
  advanced: 'bg-green-500',
  mastered: 'bg-blue-500',
};

export function TracingDashboard() {
  const { t } = useI18n();
  const [studentId] = useState(() => `student-${Date.now()}`);
  const [snapshot, setSnapshot] = useState(() => tracer.getSnapshot(studentId, DEMO_CONCEPTS));
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);

  // Re-translate the demo concept labels when locale changes.
  const demoLabels = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const [id, key] of Object.entries(DEMO_CONCEPT_KEYS)) {
      map[id] = t(key);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const simulateLearning = () => {
    for (const conceptId of DEMO_CONCEPTS) {
      tracer.recordObservation(studentId, conceptId, {
        timestamp: Date.now() - Math.random() * 86400000 * 3,
        type: 'practice',
        outcome: Math.random() > 0.3 ? 'correct' : 'incorrect',
        score: Math.random(),
        duration: Math.random() * 600,
      });
    }
    setSnapshot(tracer.getSnapshot(studentId, DEMO_CONCEPTS));
  };

  const simulateMastery = () => {
    for (const conceptId of DEMO_CONCEPTS) {
      for (let i = 0; i < 5; i++) {
        tracer.recordObservation(studentId, conceptId, {
          timestamp: Date.now() - (5 - i) * 86400000,
          type: 'quiz',
          outcome: i >= 1 ? 'correct' : i === 0 ? 'incorrect' : 'correct',
          score: 0.5 + i * 0.1,
          duration: 120 + Math.random() * 60,
        });
      }
    }
    setSnapshot(tracer.getSnapshot(studentId, DEMO_CONCEPTS));
  };

  const selectedTrace = selectedConcept ? tracer.getTrace(studentId, selectedConcept) : undefined;
  const selectedPrediction = selectedConcept
    ? tracer.predictPerformance(studentId, selectedConcept)
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Brain className="h-5 w-5 text-muted-foreground shrink-0" />
          <h3 className="text-lg font-semibold truncate">{t('tracing.title')}</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={simulateLearning} className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> {t('tracing.simulateLearning')}
          </Button>
          <Button size="sm" onClick={simulateMastery} className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> {t('tracing.simulateMastery')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('tracing.overallMastery')}</span>
          </div>
          <p className="text-2xl font-bold mt-1">{Math.round(snapshot.overallMastery * 100)}%</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('tracing.mastered')}</span>
          </div>
          <p className="text-2xl font-bold mt-1">
            {snapshot.masteredConcepts}/{snapshot.totalConcepts}
          </p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('tracing.weakConcepts')}</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-destructive">{snapshot.weakConcepts.length}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="truncate">{t('tracing.needReview')}</span>
          </div>
          <p className="text-2xl font-bold mt-1 text-amber-500">
            {snapshot.recommendedReview.length}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
        {/* Concept Mastery List */}
        <Card className="p-4">
          <h4 className="text-sm font-medium mb-3">{t('tracing.conceptMastery')}</h4>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {snapshot.traces.map((trace) => {
                const level = tracer.getMasteryLevel(trace.mastery);
                return (
                  <div
                    key={trace.conceptId}
                    className={cn(
                      'p-3 rounded-lg border cursor-pointer transition-all',
                      selectedConcept === trace.conceptId && 'ring-2 ring-primary',
                    )}
                    onClick={() => setSelectedConcept(trace.conceptId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-sm truncate">
                          {demoLabels[trace.conceptId] || trace.conceptId}
                        </span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {level}
                        </Badge>
                      </div>
                      <span
                        className={cn(
                          'text-sm font-bold shrink-0',
                          trace.mastery >= 0.7
                            ? 'text-green-500'
                            : trace.mastery >= 0.4
                              ? 'text-amber-500'
                              : 'text-red-500',
                        )}
                      >
                        {Math.round(trace.mastery * 100)}%
                      </span>
                    </div>
                    {/* Mastery bar */}
                    <div className="w-full h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', MASTERY_COLORS[level])}
                        style={{ width: `${trace.mastery * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                      <span>{t('tracing.attempts', { n: trace.attempts })}</span>
                      <span>{t('tracing.correct', { n: trace.successes })}</span>
                      <span>
                        {t('tracing.confidence', { pct: Math.round(trace.confidence * 100) })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        {/* Prediction Panel */}
        <Card className="p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1">
            <Target className="h-4 w-4" />
            {t('tracing.performancePrediction')}
          </h4>
          {selectedPrediction && selectedTrace ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">
                  {t('tracing.predictedCorrectness')}
                </span>
                <p className="text-xl font-bold mt-1">
                  {Math.round(selectedPrediction.predictedCorrectness * 100)}%
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  {t('tracing.predictedConfidence')}
                </span>
                <p className="font-medium">{Math.round(selectedPrediction.confidence * 100)}%</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  {t('tracing.nextReviewInterval')}
                </span>
                <p className="font-medium">
                  {t('tracing.nextReviewIntervalValue', {
                    n: selectedPrediction.nextReviewInterval,
                  })}
                </p>
              </div>
              <Separator />
              <div>
                <span className="text-muted-foreground text-xs">{t('tracing.forgettingCurve')}</span>
                <div className="flex items-end gap-0.5 h-12 mt-2">
                  {selectedPrediction.forgettingCurve.map((val, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-primary/30 rounded-t"
                      style={{ height: `${val * 100}%` }}
                      title={`${i * 24}h: ${Math.round(val * 100)}%`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                  <span>{t('tracing.now')}</span>
                  <span>{t('tracing.sevenDays')}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t('tracing.selectConcept')}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
