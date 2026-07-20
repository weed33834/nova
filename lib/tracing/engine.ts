import type {
  KnowledgeTrace,
  TraceEntry,
  TracingConfig,
  TracingSnapshot,
  PredictionResult,
  MasteryLevel,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('KnowledgeTracer');

export const DEFAULT_TRACING_CONFIG: TracingConfig = {
  forgettingRate: 0.1,
  learningRate: 0.3,
  priorMastery: 0.1,
  responseTimeWeight: 0.05,
  minObservations: 3,
};

export class KnowledgeTracer {
  private traces: Map<string, KnowledgeTrace> = new Map();
  private config: TracingConfig;

  constructor(config: Partial<TracingConfig> = {}) {
    this.config = { ...DEFAULT_TRACING_CONFIG, ...config };
  }

  recordObservation(studentId: string, conceptId: string, entry: TraceEntry): KnowledgeTrace {
    const key = `${studentId}:${conceptId}`;
    let trace = this.traces.get(key);

    if (!trace) {
      trace = {
        studentId,
        conceptId,
        mastery: this.config.priorMastery,
        confidence: 0.1,
        attempts: 0,
        successes: 0,
        lastPracticed: Date.now(),
        history: [],
      };
    }

    trace.history.push(entry);
    trace.lastPracticed = entry.timestamp;

    if (entry.type === 'quiz' || entry.type === 'practice') {
      trace.attempts++;
      if (entry.outcome === 'correct') {
        trace.successes++;
      }
    }

    trace.mastery = this.computeMastery(trace);
    trace.confidence = this.computeConfidence(trace);

    this.traces.set(key, trace);
    return trace;
  }

  getTrace(studentId: string, conceptId: string): KnowledgeTrace | undefined {
    const key = `${studentId}:${conceptId}`;
    const trace = this.traces.get(key);
    if (!trace) return undefined;
    return {
      ...trace,
      mastery: this.applyForgettingCurve(trace),
    };
  }

  getAllTraces(studentId: string): KnowledgeTrace[] {
    const studentTraces: KnowledgeTrace[] = [];
    for (const [, trace] of this.traces) {
      if (trace.studentId === studentId) {
        studentTraces.push({
          ...trace,
          mastery: this.applyForgettingCurve(trace),
        });
      }
    }
    return studentTraces;
  }

  getSnapshot(studentId: string, allConceptIds: string[]): TracingSnapshot {
    const traces = this.getAllTraces(studentId);
    const traceMap = new Map(traces.map((t) => [t.conceptId, t]));

    let totalMastery = 0;
    let masteredCount = 0;
    const weakConcepts: string[] = [];
    const recommendedReview: string[] = [];

    for (const conceptId of allConceptIds) {
      const trace = traceMap.get(conceptId);
      const mastery = trace?.mastery ?? this.config.priorMastery;
      totalMastery += mastery;

      if (mastery >= 0.8) {
        masteredCount++;
      } else if (mastery < 0.4) {
        weakConcepts.push(conceptId);
      }

      if (mastery > 0.4 && mastery < 0.8) {
        const daysSincePractice = trace ? (Date.now() - trace.lastPracticed) / 86400000 : 999;
        if (daysSincePractice > 3) {
          recommendedReview.push(conceptId);
        }
      } else if (mastery < 0.4) {
        recommendedReview.push(conceptId);
      }
    }

    const overallMastery = allConceptIds.length > 0 ? totalMastery / allConceptIds.length : 0;

    return {
      studentId,
      traces,
      overallMastery,
      totalConcepts: allConceptIds.length,
      masteredConcepts: masteredCount,
      weakConcepts,
      recommendedReview,
      generatedAt: Date.now(),
    };
  }

  predictPerformance(studentId: string, conceptId: string): PredictionResult {
    const trace = this.getTrace(studentId, conceptId);
    const mastery = trace?.mastery ?? this.config.priorMastery;
    const attempts = trace?.attempts ?? 0;

    const predictedCorrectness = mastery * 0.7 + (attempts > 5 ? 0.15 : attempts * 0.03);
    const confidence = Math.min(0.9, 0.1 + attempts * 0.08);

    const hoursSincePractice = trace ? (Date.now() - trace.lastPracticed) / 3600000 : 0;
    const forgettingCurve = this.computeForgettingCurve(hoursSincePractice);
    const nextReviewInterval = this.computeNextReviewInterval(mastery, attempts);

    return {
      conceptId,
      predictedCorrectness: Math.min(1, Math.max(0, predictedCorrectness)),
      confidence,
      nextReviewInterval,
      forgettingCurve,
    };
  }

  getMasteryLevel(mastery: number): MasteryLevel {
    if (mastery >= 0.9) return 'mastered';
    if (mastery >= 0.75) return 'advanced';
    if (mastery >= 0.55) return 'proficient';
    if (mastery >= 0.3) return 'developing';
    return 'novice';
  }

  private computeMastery(trace: KnowledgeTrace): number {
    if (trace.attempts === 0) return this.config.priorMastery;

    const successRate = trace.successes / trace.attempts;
    const recencyBonus = this.computeRecencyBonus(trace);
    const spacedBonus = this.computeSpacingBonus(trace);

    return Math.min(
      1,
      Math.max(
        0,
        successRate * 0.6 + recencyBonus * 0.2 + spacedBonus * 0.1 + this.config.priorMastery * 0.1,
      ),
    );
  }

  private computeConfidence(trace: KnowledgeTrace): number {
    return Math.min(0.95, 0.1 + trace.attempts * 0.05 + trace.history.length * 0.02);
  }

  private computeRecencyBonus(trace: KnowledgeTrace): number {
    const recentCorrect = trace.history
      .filter((e) => e.timestamp > Date.now() - 86400000)
      .filter((e) => e.outcome === 'correct').length;

    return Math.min(0.3, recentCorrect * 0.1);
  }

  private computeSpacingBonus(trace: KnowledgeTrace): number {
    const practiceTimes = trace.history
      .filter((e) => e.type === 'quiz' || e.type === 'practice')
      .map((e) => e.timestamp)
      .sort();

    if (practiceTimes.length < 2) return 0;

    let gaps = 0;
    for (let i = 1; i < practiceTimes.length; i++) {
      const gapHours = (practiceTimes[i] - practiceTimes[i - 1]) / 3600000;
      if (gapHours >= 24 && gapHours <= 168) gaps++;
    }

    return Math.min(0.2, gaps * 0.04);
  }

  private applyForgettingCurve(trace: KnowledgeTrace): number {
    if (trace.history.length === 0) return trace.mastery;

    const hoursSincePractice = (Date.now() - trace.lastPracticed) / 3600000;
    const decay = Math.exp(-this.config.forgettingRate * hoursSincePractice);
    const baseMastery = trace.mastery;

    return baseMastery * decay + this.config.priorMastery * (1 - decay);
  }

  private computeForgettingCurve(hoursSincePractice: number): number[] {
    const curve: number[] = [];
    for (let h = 0; h <= 168; h += 24) {
      curve.push(Math.exp(-this.config.forgettingRate * (hoursSincePractice + h)));
    }
    return curve;
  }

  private computeNextReviewInterval(mastery: number, attempts: number): number {
    if (mastery >= 0.9) return 720;
    if (mastery >= 0.75) return 336;
    if (mastery >= 0.55) return 168;
    if (mastery >= 0.3) return 48;
    return Math.max(1, 24 - attempts * 2);
  }
}
