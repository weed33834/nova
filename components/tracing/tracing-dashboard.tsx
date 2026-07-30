'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { KnowledgeTracer } from '@/lib/tracing/engine';
import type { TraceEntry } from '@/lib/tracing/types';

const TRACER_CONFIG = {
  forgettingRate: 0.1,
  learningRate: 0.3,
  priorMastery: 0.1,
  responseTimeWeight: 0.05,
  minObservations: 3,
};

/**
 * Concept taxonomy tracked by this dashboard.
 *
 * The learning-events API exposes only aggregate classroom stats (views,
 * completions, quiz answers + average score) — it does not model individual
 * concepts. The dashboard therefore tracks a small, stable set of concepts and
 * derives each concept's mastery from the real aggregate stats (see
 * `buildTracerFromStats`). The labels reuse the existing `tracing.demoConcept*`
 * i18n keys so the UI stays fully localized without editing locale files.
 */
const TRACKED_CONCEPTS = ['concept-1', 'concept-2', 'concept-3'];
const CONCEPT_LABEL_KEYS: Record<string, string> = {
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

/**
 * Default classroom scope used when no `classroomId` prop is supplied (e.g. the
 * settings panel renders `<TracingDashboard />` with no context). Events
 * recorded through this dashboard are tagged with the same id, so the
 * fetch → record → refetch loop is self-contained. Callers that render the
 * dashboard inside a real classroom can pass its id to scope the data.
 */
const DEFAULT_CLASSROOM_ID = 'demo';

type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

interface ClassroomStats {
  totalViews: number;
  uniqueViewers: number;
  completions: number;
  quizAnswers: number;
  averageScore: number | null;
}

type ClassroomStatsResponse =
  | { success: true; stats: ClassroomStats }
  | { success: false; errorCode: string; error: string; details?: string };

type LearningVerb =
  | 'viewed'
  | 'completed'
  | 'answered'
  | 'played'
  | 'interacted'
  | 'exported'
  | 'shared'
  | 'generated'
  | 'edited'
  | 'started'
  | 'left';

type LearningObjectType =
  | 'scene'
  | 'slide'
  | 'quiz'
  | 'tts'
  | 'video'
  | 'image'
  | 'classroom'
  | 'element'
  | 'agent';

interface LearningEventPayload {
  classroomId?: string;
  sceneId?: string;
  sessionId?: string;
  verb: LearningVerb;
  objectType?: LearningObjectType;
  objectId?: string;
  result?: {
    score?: number;
    success?: boolean;
    completion?: boolean;
    duration?: number;
    response?: string;
  };
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

/** GET /api/learning-events?classroomId=… → aggregate classroom stats. */
async function fetchClassroomStats(classroomId: string): Promise<ClassroomStats> {
  const url = `/api/learning-events?classroomId=${encodeURIComponent(classroomId)}`;
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as ClassroomStatsResponse | null;
  if (!res.ok || !body || body.success !== true) {
    const msg =
      body && body.success === false
        ? body.error
        : `Failed to load learning data (${res.status})`;
    throw new Error(msg);
  }
  return body.stats;
}

/** POST /api/learning-events — record a single learning event (fire-and-forget). */
async function postLearningEvent(payload: LearningEventPayload): Promise<void> {
  const res = await fetch('/api/learning-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { success?: false; error?: string }
      | null;
    throw new Error(body?.error ?? `Failed to record event (${res.status})`);
  }
}

/**
 * Build a fresh KnowledgeTracer seeded from real aggregate classroom stats.
 *
 * The API only exposes aggregates (no per-event or per-concept breakdown), so
 * we project the aggregates back onto the tracked concepts deterministically:
 *  - quiz answers (+ average score) → the primary mastery signal, distributed
 *    round-robin across concepts using `averageScore` as the success ratio.
 *  - completions → practice successes (finishing a scene/lesson = success).
 *  - views → engagement observations (no mastery impact, enriches history).
 *
 * A new tracer is constructed on every refresh so mastery always reflects the
 * latest server state rather than accumulating locally.
 */
function buildTracerFromStats(
  stats: ClassroomStats,
  studentId: string,
  conceptIds: string[],
): KnowledgeTracer {
  const tracer = new KnowledgeTracer(TRACER_CONFIG);
  if (conceptIds.length === 0) return tracer;

  const now = Date.now();
  const DAY = 86_400_000;

  const avg =
    typeof stats.averageScore === 'number' && Number.isFinite(stats.averageScore)
      ? Math.min(1, Math.max(0, stats.averageScore))
      : 0;

  // Quiz answers — primary mastery signal.
  const quizCount = Math.min(Math.max(0, Math.floor(stats.quizAnswers)), 60);
  const correctCount = Math.round(avg * quizCount);
  for (let i = 0; i < quizCount; i++) {
    const entry: TraceEntry = {
      timestamp: now - (quizCount - i) * (DAY / 4),
      type: 'quiz',
      outcome: i < correctCount ? 'correct' : 'incorrect',
      score: avg,
      duration: 30_000,
    };
    tracer.recordObservation(studentId, conceptIds[i % conceptIds.length], entry);
  }

  // Completions — practice successes.
  const completionCount = Math.min(Math.max(0, Math.floor(stats.completions)), 40);
  for (let i = 0; i < completionCount; i++) {
    const entry: TraceEntry = {
      timestamp: now - (completionCount - i) * (DAY / 2),
      type: 'practice',
      outcome: 'correct',
      score: 1,
      duration: 120_000,
    };
    tracer.recordObservation(studentId, conceptIds[i % conceptIds.length], entry);
  }

  // Views — engagement observations.
  const viewCount = Math.min(Math.max(0, Math.floor(stats.totalViews)), 40);
  for (let i = 0; i < viewCount; i++) {
    const entry: TraceEntry = {
      timestamp: now - (viewCount - i) * (DAY / 6),
      type: 'observation',
      outcome: 'viewed',
      score: 0,
      duration: 0,
    };
    tracer.recordObservation(studentId, conceptIds[i % conceptIds.length], entry);
  }

  return tracer;
}

export function TracingDashboard({ classroomId: classroomIdProp }: { classroomId?: string }) {
  const { t } = useI18n();
  const [studentId] = useState('self');
  const classroomId = classroomIdProp ?? DEFAULT_CLASSROOM_ID;

  const [tracer, setTracer] = useState<KnowledgeTracer>(() => new KnowledgeTracer(TRACER_CONFIG));
  const [snapshot, setSnapshot] = useState(() =>
    new KnowledgeTracer(TRACER_CONFIG).getSnapshot('self', []),
  );
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);

  // Re-translate the concept labels when locale changes.
  const conceptLabels = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const [id, key] of Object.entries(CONCEPT_LABEL_KEYS)) {
      map[id] = t(key);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  /** Fetch classroom stats from the API and recompute mastery via the tracer. */
  const loadStats = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setStatus('loading');
      setError(null);
      try {
        const stats = await fetchClassroomStats(classroomId);
        const hasEvents =
          stats.totalViews > 0 || stats.completions > 0 || stats.quizAnswers > 0;
        const nextTracer = buildTracerFromStats(stats, studentId, TRACKED_CONCEPTS);
        setTracer(nextTracer);
        setSnapshot(nextTracer.getSnapshot(studentId, TRACKED_CONCEPTS));
        setStatus(hasEvents ? 'ready' : 'empty');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load learning data');
        setStatus('error');
      }
    },
    [classroomId, studentId],
  );

  // Load on mount (and whenever the classroom scope changes).
  useEffect(() => {
    void loadStats(true);
  }, [loadStats]);

  /** Record a handful of low-stakes events, then refresh from the server. */
  const recordSampleLearning = useCallback(async () => {
    setRecording(true);
    try {
      const base = { classroomId };
      const events: LearningEventPayload[] = [
        { ...base, verb: 'viewed', objectType: 'scene', objectId: 'concept-1', durationMs: 45000, metadata: { conceptId: 'concept-1' } },
        { ...base, verb: 'viewed', objectType: 'scene', objectId: 'concept-2', durationMs: 30000, metadata: { conceptId: 'concept-2' } },
        { ...base, verb: 'interacted', objectType: 'element', objectId: 'concept-1', durationMs: 12000, metadata: { conceptId: 'concept-1' } },
        {
          ...base,
          verb: 'answered',
          objectType: 'quiz',
          objectId: 'concept-3',
          result: { score: 0.5, success: false, completion: true, duration: 20000 },
          durationMs: 20000,
          metadata: { conceptId: 'concept-3' },
        },
      ];
      await Promise.allSettled(events.map(postLearningEvent));
      await loadStats(false);
    } finally {
      setRecording(false);
    }
  }, [classroomId, loadStats]);

  /** Record a learning curve of quiz answers (improving scores), then refresh. */
  const recordMasteryCurve = useCallback(async () => {
    setRecording(true);
    try {
      const base = { classroomId };
      const scores = [0.4, 0.5, 0.6, 0.7, 0.85];
      const events: LearningEventPayload[] = scores.map((score, i) => {
        const conceptId = TRACKED_CONCEPTS[i % TRACKED_CONCEPTS.length];
        return {
          ...base,
          verb: 'answered',
          objectType: 'quiz',
          objectId: conceptId,
          result: { score, success: score >= 0.6, completion: true, duration: 25000 },
          durationMs: 25000,
          metadata: { conceptId, attempt: i },
        };
      });
      events.push({
        ...base,
        verb: 'completed',
        objectType: 'scene',
        objectId: 'concept-2',
        result: { completion: true, success: true, duration: 180000 },
        durationMs: 180000,
        metadata: { conceptId: 'concept-2' },
      });
      await Promise.allSettled(events.map(postLearningEvent));
      await loadStats(false);
    } finally {
      setRecording(false);
    }
  }, [classroomId, loadStats]);

  const selectedTrace = selectedConcept ? tracer.getTrace(studentId, selectedConcept) : undefined;
  const selectedPrediction = selectedConcept
    ? tracer.predictPerformance(studentId, selectedConcept)
    : undefined;

  const busy = recording || status === 'loading';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Brain className="h-5 w-5 text-muted-foreground shrink-0" />
          <h3 className="text-lg font-semibold truncate">{t('tracing.title')}</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={recordSampleLearning}
            disabled={busy}
            className="gap-1.5"
          >
            {recording ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {t('tracing.simulateLearning')}
          </Button>
          <Button
            size="sm"
            onClick={recordMasteryCurve}
            disabled={busy}
            className="gap-1.5"
          >
            {recording ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5" />
            )}
            {t('tracing.simulateMastery')}
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {status === 'loading' && (
        <Card className="p-8 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading learning data…</span>
        </Card>
      )}

      {/* Error state */}
      {status === 'error' && (
        <Card className="p-6 flex flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Couldn&apos;t load learning data</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadStats(true)}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      )}

      {/* Empty state — no learning events recorded yet */}
      {status === 'empty' && (
        <Card className="p-8 flex flex-col items-center justify-center gap-3 text-center">
          <Brain className="h-6 w-6 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No learning events yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Mastery tracking starts once learning events are recorded for this
              classroom. Record a quiz answer or interaction to begin.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={recordSampleLearning}
            disabled={recording}
            className="gap-1.5"
          >
            {recording ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {t('tracing.simulateLearning')}
          </Button>
        </Card>
      )}

      {/* Ready — real data driven dashboard */}
      {status === 'ready' && (
        <>
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
                              {conceptLabels[trace.conceptId] || trace.conceptId}
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
        </>
      )}
    </div>
  );
}
