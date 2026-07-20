import { describe, test, expect } from 'vitest';
import { getPromptRegistry, listAllPrompts } from '@/lib/prompts';

describe('PromptRegistry', () => {
  test('returns a non-empty list spanning both prompt systems', () => {
    const reg = getPromptRegistry();
    expect(reg.length).toBeGreaterThan(0);
    const sources = new Set(reg.map((e) => e.source));
    expect(sources.has('main')).toBe(true);
    expect(sources.has('pbl-v2')).toBe(true);
  });

  test('every main entry has a version and a project-relative path', () => {
    for (const e of getPromptRegistry().filter((x) => x.source === 'main')) {
      expect(typeof e.version).toBe('string');
      expect(e.version.length).toBeGreaterThan(0);
      expect(e.path.startsWith('lib/prompts/templates/')).toBe(true);
    }
  });

  test('every pbl-v2 entry points at a .md file under lib/pbl/v2/prompts/', () => {
    for (const e of getPromptRegistry().filter((x) => x.source === 'pbl-v2')) {
      expect(e.path.startsWith('lib/pbl/v2/prompts/')).toBe(true);
      expect(e.path.endsWith('.md')).toBe(true);
      expect(e.hasUserTemplate).toBe(false);
    }
  });

  test('the editor-agent entry (with a config.json sidecar) is present with metadata', () => {
    const reg = getPromptRegistry();
    const ed = reg.find((e) => e.id === 'editor-agent');
    expect(ed).toBeDefined();
    expect(ed!.source).toBe('main');
    expect(ed!.version).toBe('1.0.0');
    expect(ed!.deprecated).toBe(false);
  });

  test('entries are sorted by (source, id) for stable output', () => {
    const reg = getPromptRegistry();
    for (let i = 1; i < reg.length; i++) {
      const a = reg[i - 1];
      const b = reg[i];
      if (a.source === b.source) {
        expect(a.id.localeCompare(b.id)).toBeLessThanOrEqual(0);
      } else {
        expect(a.source.localeCompare(b.source)).toBeLessThan(0);
      }
    }
  });

  test('known prompts are present (sanity coverage)', () => {
    const ids = new Set(getPromptRegistry().map((e) => e.id));
    // A few main prompts that should always ship.
    expect(ids.has('agent-system')).toBe(true);
    expect(ids.has('director')).toBe(true);
    expect(ids.has('pbl-design')).toBe(true);
    // A few PBL v2 prompts.
    expect(ids.has('planner-system')).toBe(true);
    expect(ids.has('simulator-system')).toBe(true);
    expect(ids.has('instructor-base-rules')).toBe(true);
  });

  test('listAllPrompts returns the flat shape with deprecated flag', () => {
    const flat = listAllPrompts();
    expect(flat.length).toBeGreaterThan(0);
    for (const f of flat) {
      expect(typeof f.id).toBe('string');
      expect(typeof f.displayName).toBe('string');
      expect(typeof f.deprecated).toBe('boolean');
    }
  });
});
