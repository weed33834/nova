import { describe, expect, it } from 'vitest';
import { KnowledgeTracer, DEFAULT_TRACING_CONFIG } from '@/lib/tracing/engine';
import type { TraceEntry } from '@/lib/tracing/types';

function entry(
  overrides: Partial<TraceEntry> = {},
): TraceEntry {
  return {
    timestamp: Date.now(),
    type: 'quiz',
    outcome: 'correct',
    score: 1,
    duration: 5000,
    ...overrides,
  };
}

describe('KnowledgeTracer', () => {
  it('exposes sensible default config', () => {
    expect(DEFAULT_TRACING_CONFIG.forgettingRate).toBeGreaterThan(0);
    expect(DEFAULT_TRACING_CONFIG.learningRate).toBeGreaterThan(0);
    expect(DEFAULT_TRACING_CONFIG.priorMastery).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_TRACING_CONFIG.minObservations).toBeGreaterThan(0);
  });

  it('returns a trace starting at prior mastery on first observation', () => {
    const tracer = new KnowledgeTracer({ priorMastery: 0.2 });
    const trace = tracer.recordObservation('s1', 'c1', entry());
    expect(trace.attempts).toBe(1);
    expect(trace.successes).toBe(1);
    expect(trace.mastery).toBeGreaterThanOrEqual(0.2);
    expect(trace.confidence).toBeGreaterThan(0);
  });

  it('does not increment attempts for explanation/hint/observation entries', () => {
    const tracer = new KnowledgeTracer();
    tracer.recordObservation('s1', 'c1', entry({ type: 'explanation', outcome: 'viewed' }));
    tracer.recordObservation('s1', 'c1', entry({ type: 'hint', outcome: 'viewed' }));
    const trace = tracer.recordObservation(
      's1',
      'c1',
      entry({ type: 'observation', outcome: 'viewed' }),
    );
    expect(trace.attempts).toBe(0);
    expect(trace.successes).toBe(0);
  });

  it('aggregates multiple correct answers into higher mastery', () => {
    const tracer = new KnowledgeTracer();
    let trace;
    for (let i = 0; i < 5; i++) {
      trace = tracer.recordObservation('s1', 'c1', entry({ outcome: 'correct' }));
    }
    expect(trace!.mastery).toBeGreaterThan(DEFAULT_TRACING_CONFIG.priorMastery);
    expect(trace!.attempts).toBe(5);
    expect(trace!.successes).toBe(5);
  });

  it('keeps mastery lower for incorrect answers than correct ones', () => {
    const correctTracer = new KnowledgeTracer();
    const incorrectTracer = new KnowledgeTracer();
    for (let i = 0; i < 5; i++) {
      correctTracer.recordObservation('s1', 'c1', entry({ outcome: 'correct' }));
      incorrectTracer.recordObservation('s2', 'c1', entry({ outcome: 'incorrect', score: 0 }));
    }
    const correctMastery = correctTracer.getTrace('s1', 'c1')!.mastery;
    const incorrectMastery = incorrectTracer.getTrace('s2', 'c1')!.mastery;
    expect(correctMastery).toBeGreaterThan(incorrectMastery);
  });

  it('returns undefined for an unknown student/concept', () => {
    const tracer = new KnowledgeTracer();
    expect(tracer.getTrace('nobody', 'nothing')).toBeUndefined();
  });

  it('returns all traces for a student across concepts', () => {
    const tracer = new KnowledgeTracer();
    tracer.recordObservation('s1', 'c1', entry());
    tracer.recordObservation('s1', 'c2', entry());
    tracer.recordObservation('s2', 'c1', entry());
    const s1Traces = tracer.getAllTraces('s1');
    expect(s1Traces).toHaveLength(2);
    expect(s1Traces.map((t) => t.conceptId).sort()).toEqual(['c1', 'c2']);
  });

  it('caps per-trace history length', () => {
    const tracer = new KnowledgeTracer();
    // MAX_HISTORY_PER_TRACE is 100; pushing 150 entries should trim to 100.
    for (let i = 0; i < 150; i++) {
      tracer.recordObservation('s1', 'c1', entry({ timestamp: Date.now() + i }));
    }
    const trace = tracer.getTrace('s1', 'c1');
    expect(trace!.history.length).toBeLessThanOrEqual(100);
  });

  describe('getSnapshot', () => {
    it('reports overall mastery, mastered/weak concepts and review list', () => {
      const tracer = new KnowledgeTracer();
      // Master c1, leave c2 weak, c3 untouched.
      for (let i = 0; i < 10; i++) {
        tracer.recordObservation('s1', 'c1', entry({ outcome: 'correct' }));
      }
      for (let i = 0; i < 3; i++) {
        tracer.recordObservation('s1', 'c2', entry({ outcome: 'incorrect', score: 0 }));
      }
      const snap = tracer.getSnapshot('s1', ['c1', 'c2', 'c3']);
      expect(snap.studentId).toBe('s1');
      expect(snap.totalConcepts).toBe(3);
      expect(snap.overallMastery).toBeGreaterThan(0);
      expect(snap.overallMastery).toBeLessThan(1);
      expect(snap.masteredConcepts).toBeGreaterThanOrEqual(0);
      expect(snap.weakConcepts).toContain('c2');
      expect(snap.recommendedReview).toContain('c2');
    });

    it('handles an empty concept list without dividing by zero', () => {
      const tracer = new KnowledgeTracer();
      const snap = tracer.getSnapshot('s1', []);
      expect(snap.overallMastery).toBe(0);
      expect(snap.totalConcepts).toBe(0);
    });
  });

  describe('predictPerformance', () => {
    it('returns a bounded prediction for an unseen concept', () => {
      const tracer = new KnowledgeTracer();
      const pred = tracer.predictPerformance('s1', 'c1');
      expect(pred.conceptId).toBe('c1');
      expect(pred.predictedCorrectness).toBeGreaterThanOrEqual(0);
      expect(pred.predictedCorrectness).toBeLessThanOrEqual(1);
      expect(pred.confidence).toBeGreaterThanOrEqual(0);
      expect(pred.forgettingCurve.length).toBeGreaterThan(0);
      expect(pred.nextReviewInterval).toBeGreaterThan(0);
    });

    it('increases confidence with more attempts', () => {
      const tracer = new KnowledgeTracer();
      const before = tracer.predictPerformance('s1', 'c1').confidence;
      for (let i = 0; i < 6; i++) {
        tracer.recordObservation('s1', 'c1', entry({ outcome: 'correct' }));
      }
      const after = tracer.predictPerformance('s1', 'c1').confidence;
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('getMasteryLevel', () => {
    it('maps numeric mastery to the five levels', () => {
      const tracer = new KnowledgeTracer();
      expect(tracer.getMasteryLevel(0.95)).toBe('mastered');
      expect(tracer.getMasteryLevel(0.8)).toBe('advanced');
      expect(tracer.getMasteryLevel(0.6)).toBe('proficient');
      expect(tracer.getMasteryLevel(0.4)).toBe('developing');
      expect(tracer.getMasteryLevel(0.1)).toBe('novice');
    });
  });
});
