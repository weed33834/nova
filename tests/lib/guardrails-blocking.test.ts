import { describe, expect, it } from 'vitest';
import { checkGeneratedContent } from '@/lib/guardrails/pipeline-check';
import {
  GuardrailBlockError,
  type GuardrailsBlockingConfig,
  type Severity,
} from '@/lib/guardrails/types';
import type { Action } from '@/lib/types/action';

function speech(text: string): Action {
  return { id: 'a1', type: 'speech', text } as unknown as Action;
}

const CLEAN_TEXT = '今天我们一起来学习光合作用的基本原理。';
// Toxic content (Chinese) — triggers the harassment pattern, severity high/critical.
const TOXIC_TEXT = '你真是个笨蛋，滚开！';
// PII content — triggers email pattern, severity high.
const PII_TEXT = '请联系 alice@example.com 获取资料。';
// Misinformation — triggers flat-earth pattern, severity high.
const MISINFO_TEXT = '地球是平的，这是真相。';

const NO_BLOCK: GuardrailsBlockingConfig = { enabled: false, minBlockSeverity: 'low' };

describe('checkGeneratedContent — blocking mode', () => {
  it('returns a report (no throw) when content is clean', () => {
    const report = checkGeneratedContent('Clean scene', [speech(CLEAN_TEXT)]);
    expect(report).not.toBeNull();
    expect(report!.passed).toBe(true);
  });

  it('returns null when there is no speech text to check', () => {
    const report = checkGeneratedContent('Empty scene', [
      { id: 'a1', type: 'spotlight', elementId: 'e1' } as unknown as Action,
    ]);
    expect(report).toBeNull();
  });

  it('does NOT throw when blocking is disabled even if checks fail', () => {
    expect(() =>
      checkGeneratedContent('Toxic scene', [speech(TOXIC_TEXT)], undefined, NO_BLOCK),
    ).not.toThrow();
    const report = checkGeneratedContent('Toxic scene', [speech(TOXIC_TEXT)], undefined, NO_BLOCK);
    expect(report!.passed).toBe(false);
  });

  it('does NOT throw when blocking is undefined (warning-only default)', () => {
    expect(() =>
      checkGeneratedContent('Toxic scene', [speech(TOXIC_TEXT)]),
    ).not.toThrow();
  });

  it('throws GuardrailBlockError when blocking enabled and severity meets threshold (low)', () => {
    const cfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'low' };
    let err: unknown;
    try {
      checkGeneratedContent('Toxic scene', [speech(TOXIC_TEXT)], undefined, cfg);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(GuardrailBlockError);
    expect((err as GuardrailBlockError).report.passed).toBe(false);
    expect((err as GuardrailBlockError).message).toContain('Content blocked by guardrails');
  });

  it('throws for PII at high severity when threshold is high', () => {
    const cfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'high' };
    expect(() =>
      checkGeneratedContent('PII scene', [speech(PII_TEXT)], undefined, cfg),
    ).toThrow(GuardrailBlockError);
  });

  it('throws for misinformation at high severity when threshold is high', () => {
    const cfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'high' };
    expect(() =>
      checkGeneratedContent('Misinfo scene', [speech(MISINFO_TEXT)], undefined, cfg),
    ).toThrow(GuardrailBlockError);
  });

  it('does NOT throw when failed check severity is below the threshold', () => {
    // Toxicity from "笨蛋...滚开" is high/critical; PII email is high.
    // Hallucination check on short toxic content is typically 'low'.
    // Use a threshold of 'critical' against high-severity PII: should NOT block.
    const cfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'critical' };
    expect(() =>
      checkGeneratedContent('PII scene', [speech(PII_TEXT)], undefined, cfg),
    ).not.toThrow();
  });

  it('respects threshold ordering: medium blocks high-severity failures', () => {
    const cfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'medium' };
    expect(() =>
      checkGeneratedContent('Misinfo scene', [speech(MISINFO_TEXT)], undefined, cfg),
    ).toThrow(GuardrailBlockError);
  });

  it('GuardrailBlockError carries the full report with failed checks', () => {
    const cfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'low' };
    let err: GuardrailBlockError | undefined;
    try {
      checkGeneratedContent('Toxic scene', [speech(TOXIC_TEXT)], undefined, cfg);
    } catch (e) {
      err = e as GuardrailBlockError;
    }
    expect(err).toBeDefined();
    const failed = err!.report.checks.filter((c) => !c.passed);
    expect(failed.length).toBeGreaterThan(0);
    // The toxic content should trigger at least the toxicity check.
    expect(failed.some((c) => c.type === 'toxicity')).toBe(true);
  });

  it('severity threshold ranks: low < medium < high < critical', () => {
    // Low threshold blocks everything that fails.
    const lowCfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'low' };
    expect(() =>
      checkGeneratedContent('Toxic scene', [speech(TOXIC_TEXT)], undefined, lowCfg),
    ).toThrow(GuardrailBlockError);

    // Critical threshold blocks only critical failures. Toxicity from TOXIC_TEXT
    // is 'high' (score 0.7*2=1.4 capped to 1, but severity logic: >0.8 => critical,
    // else high). "笨蛋"+"滚开" => harassment 0.7 * 2 matches = 1.4 -> capped 1.0,
    // and overallScore > 0.8 => 'critical'. So critical threshold SHOULD block here.
    const critCfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'critical' };
    expect(() =>
      checkGeneratedContent('Toxic scene', [speech(TOXIC_TEXT)], undefined, critCfg),
    ).toThrow(GuardrailBlockError);
  });

  it('passes source content through to the hallucination check', () => {
    // Divergent generated content with a source should raise hallucination risk.
    const source =
      '光合作用是植物利用阳光合成有机物的过程。叶绿体是光合作用的场所。';
    const generated =
      '量子纠缠让粒子瞬间通信。黑洞是通往另一个宇宙的入口。暗物质是看不见的糖果。';
    const cfg: GuardrailsBlockingConfig = { enabled: true, minBlockSeverity: 'low' };
    let err: GuardrailBlockError | undefined;
    try {
      checkGeneratedContent('Hallucination scene', [speech(generated)], source, cfg);
    } catch (e) {
      err = e as GuardrailBlockError;
    }
    expect(err).toBeDefined();
    const hallucination = err!.report.checks.find((c) => c.type === 'hallucination');
    expect(hallucination).toBeDefined();
    expect(hallucination!.passed).toBe(false);
  });
});

describe('GuardrailBlockError', () => {
  it('constructs with a report and exposes failed types in the message', () => {
    const report = {
      content: 'bad',
      passed: false,
      timestamp: Date.now(),
      checks: [
        { passed: false, type: 'toxicity' as const, severity: 'high' as Severity, message: 'bad' },
        { passed: true, type: 'hallucination' as const, severity: 'low' as Severity, message: 'ok' },
      ],
    };
    const err = new GuardrailBlockError(report);
    expect(err.name).toBe('GuardrailBlockError');
    expect(err.report).toBe(report);
    expect(err.message).toContain('toxicity');
    expect(err.message).not.toContain('hallucination');
    expect(err instanceof Error).toBe(true);
  });
});
