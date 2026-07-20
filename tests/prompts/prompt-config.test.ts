import { describe, test, expect } from 'vitest';
import { loadPrompt, loadPromptConfig, DEFAULT_PROMPT_VERSION, type PromptId } from '@/lib/prompts';

describe('config.json sidecar + LoadedPrompt versioning', () => {
  test('a prompt with a config.json sidecar exposes parsed metadata', () => {
    const p = loadPrompt('editor-agent' as PromptId);
    expect(p).not.toBeNull();
    expect(p!.config).toBeDefined();
    expect(p!.config!.version).toBe('1.0.0');
    expect(p!.config!.description).toContain('slide-editor sidebar agent');
    expect(p!.config!.tags).toEqual(expect.arrayContaining(['orchestration', 'agent', 'editor']));
    expect(p!.config!.deprecated).toBe(false);
    // Convenience projections on LoadedPrompt itself.
    expect(p!.version).toBe('1.0.0');
    expect(p!.deprecated).toBe(false);
  });

  test('all prompts with config.json sidecars expose version and metadata', () => {
    // Since Fix B, every prompt template has a config.json sidecar.
    // slide-actions previously had none — verify it now has one.
    const p = loadPrompt('slide-actions' as PromptId);
    expect(p).not.toBeNull();
    expect(p!.config).toBeDefined();
    expect(p!.config!.version).toBe('1.0.0');
    expect(p!.config!.tags).toEqual(expect.arrayContaining(['generation', 'actions']));
    expect(p!.config!.deprecated).toBe(false);
    // Convenience projections on LoadedPrompt itself.
    expect(p!.version).toBe('1.0.0');
    expect(p!.deprecated).toBe(false);
  });

  test('loadPromptConfig returns parsed config for a prompt with a sidecar', () => {
    const cfg = loadPromptConfig('slide-actions' as PromptId);
    expect(cfg).toBeDefined();
    expect(cfg!.version).toBe('1.0.0');
  });

  test('loadPromptConfig returns parsed config for editor-agent', () => {
    const cfg = loadPromptConfig('editor-agent' as PromptId);
    expect(cfg).toBeDefined();
    expect(cfg!.version).toBe('1.0.0');
  });

  test('DEFAULT_PROMPT_VERSION is "1.0.0" (fallback for missing sidecars)', () => {
    // The fallback constant is still used internally when no config.json exists;
    // all shipped prompts now have sidecars, but the code path remains.
    expect(DEFAULT_PROMPT_VERSION).toBe('1.0.0');
  });
});
