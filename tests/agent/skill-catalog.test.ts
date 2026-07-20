import { describe, test, expect } from 'vitest';
import { SKILL_CATALOG, V0_ALLOWLIST, getSkillCatalogEntry } from '@/lib/agent/tools/registry';

describe('SKILL_CATALOG', () => {
  test('catalog ids match V0_ALLOWLIST exactly (no drift)', () => {
    const catalogIds = new Set(SKILL_CATALOG.map((s) => s.id));
    expect(catalogIds).toEqual(new Set(V0_ALLOWLIST));
  });

  test('every entry has a non-empty displayName, category, and summary', () => {
    for (const s of SKILL_CATALOG) {
      expect(s.displayName.length).toBeGreaterThan(0);
      expect(['read', 'regenerate', 'edit']).toContain(s.category);
      expect(s.summary.length).toBeGreaterThan(0);
    }
  });

  test('categories are non-empty (each category has at least one skill)', () => {
    const cats = new Set(SKILL_CATALOG.map((s) => s.category));
    expect(cats.has('read')).toBe(true);
    expect(cats.has('regenerate')).toBe(true);
    expect(cats.has('edit')).toBe(true);
  });

  test('getSkillCatalogEntry returns the entry for a known id', () => {
    const e = getSkillCatalogEntry('read_scene_content');
    expect(e).toBeDefined();
    expect(e!.category).toBe('read');
  });

  test('getSkillCatalogEntry returns undefined for an unknown id', () => {
    expect(getSkillCatalogEntry('does_not_exist')).toBeUndefined();
  });
});
