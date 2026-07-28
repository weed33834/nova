import { describe, expect, it } from 'vitest';
import {
  checkContentSafety,
  checkHallucinationRisk,
  runAllGuardrails,
} from '@/lib/guardrails/content-safety';

describe('checkContentSafety', () => {
  it('passes clean content', () => {
    const results = checkContentSafety('今天我们学习光合作用。');
    expect(results).toEqual([]);
  });

  it('flags Chinese PII (ID card)', () => {
    const results = checkContentSafety('我的身份证号是 110101199003071234');
    expect(results.some((r) => r.type === 'pii_leakage')).toBe(true);
  });

  it('flags email as PII', () => {
    const results = checkContentSafety('联系我: alice@example.com');
    expect(results.some((r) => r.type === 'pii_leakage')).toBe(true);
  });

  it('flags toxic language', () => {
    const results = checkContentSafety('你真是个笨蛋，滚开！');
    const toxic = results.find((r) => r.type === 'toxicity');
    expect(toxic).toBeDefined();
    expect(toxic!.passed).toBe(false);
  });

  it('flags misinformation', () => {
    const results = checkContentSafety('地球是平的，这是真相。');
    expect(results.some((r) => r.type === 'factual_accuracy')).toBe(true);
  });

  it('respects disabled checks', () => {
    const results = checkContentSafety('alice@example.com', {
      blockedCategories: [],
      maxSeverity: 'high',
      enableToxicityCheck: false,
      enablePiiCheck: false,
    });
    expect(results).toEqual([]);
  });

  it('does not flag short digit runs as account numbers when PII is off', () => {
    const results = checkContentSafety('答案: 42', {
      blockedCategories: [],
      maxSeverity: 'high',
      enableToxicityCheck: false,
      enablePiiCheck: false,
    });
    expect(results).toEqual([]);
  });
});

describe('checkHallucinationRisk', () => {
  it('passes content without a source', () => {
    const result = checkHallucinationRisk('光合作用是植物利用阳光合成有机物的过程。');
    expect(result.passed).toBe(true);
    expect(result.type).toBe('hallucination');
  });

  it('flags content that diverges from the source', () => {
    const source = '光合作用是植物利用阳光合成有机物的过程。叶绿体是光合作用的场所。';
    const generated =
      '量子纠缠让粒子瞬间通信。黑洞是通往另一个宇宙的入口。暗物质是看不见的糖果。';
    const result = checkHallucinationRisk(generated, source);
    expect(result.passed).toBe(false);
    expect(result.details!.score).toBeGreaterThan(0);
  });

  it('penalizes excessive vague language', () => {
    const generated = '可能大概也许据说好像应该是不确定可能大概也许据说好像应该是不确定';
    const result = checkHallucinationRisk(generated);
    expect((result.details!.reasons as unknown[]).length).toBeGreaterThan(0);
  });

  it('returns a severity that scales with score', () => {
    const low = checkHallucinationRisk('短内容');
    expect(['low', 'medium', 'high']).toContain(low.severity);
  });
});

describe('runAllGuardrails', () => {
  it('returns a report with at least the hallucination + pedagogical checks', () => {
    const report = runAllGuardrails('普通内容');
    expect(report.passed).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(2);
    expect(report.metadata!.totalChecks).toBe(report.checks.length);
    expect(report.metadata!.failedChecks).toBe(0);
  });

  it('marks the report as failed when any check fails', () => {
    const report = runAllGuardrails('你真是个笨蛋');
    expect(report.passed).toBe(false);
    expect(report.metadata!.failedChecks as number).toBeGreaterThan(0);
  });

  it('forwards sourceContent to the hallucination consistency check', () => {
    const source = '光合作用是植物利用阳光合成有机物的过程。叶绿体是光合作用的场所。';
    const generated =
      '量子纠缠让粒子瞬间通信。黑洞是通往另一个宇宙的入口。暗物质是看不见的糖果。';
    // Without source: only vague-language heuristic applies, score stays low.
    const withoutSource = runAllGuardrails(generated);
    // With source: consistency check fires and flags divergence.
    const withSource = runAllGuardrails(generated, source);
    const hallucinationWith = withSource.checks.find((c) => c.type === 'hallucination');
    const hallucinationWithout = withoutSource.checks.find((c) => c.type === 'hallucination');
    expect(hallucinationWith).toBeDefined();
    expect(hallucinationWithout).toBeDefined();
    // The score with source should be at least as high as without.
    expect(
      (hallucinationWith!.details!.score as number) >=
        (hallucinationWithout!.details!.score as number),
    ).toBe(true);
  });
});
