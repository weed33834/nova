import { describe, expect, it } from 'vitest';
import {
  validateCustomSkill,
  renderSkillTemplate,
  type CustomSkill,
} from '@/lib/agent/tools/custom-skill';

function validSkill(overrides: Partial<CustomSkill> = {}): CustomSkill {
  const now = new Date().toISOString();
  return {
    id: 'my_skill',
    displayName: 'My Skill',
    category: 'custom',
    summary: 'A test skill.',
    description: 'Used to test validation.',
    promptTemplate: 'Summarize: {{text}}',
    parameters: [{ name: 'text', type: 'string', description: 'input', required: true }],
    enabled: true,
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('validateCustomSkill', () => {
  it('accepts a well-formed skill', () => {
    expect(validateCustomSkill(validSkill(), { isNew: true })).toEqual([]);
  });

  it('rejects a non-string id', () => {
    const errors = validateCustomSkill({ ...validSkill(), id: 42 }, { isNew: true });
    expect(errors.some((e) => e.includes('id must match'))).toBe(true);
  });

  it('rejects an id with uppercase letters', () => {
    const errors = validateCustomSkill({ ...validSkill(), id: 'BadID' }, { isNew: true });
    expect(errors.some((e) => e.includes('id must match'))).toBe(true);
  });

  it('rejects a reserved built-in id', () => {
    const errors = validateCustomSkill(
      { ...validSkill(), id: 'read_scene_content' },
      { isNew: true },
    );
    expect(errors.some((e) => e.includes('reserved'))).toBe(true);
  });

  it('rejects an over-long id', () => {
    const errors = validateCustomSkill(
      { ...validSkill(), id: 'a'.repeat(65) },
      { isNew: true },
    );
    expect(errors.some((e) => e.includes('64'))).toBe(true);
  });

  it('rejects an empty displayName', () => {
    const errors = validateCustomSkill({ ...validSkill(), displayName: '  ' }, { isNew: true });
    expect(errors.some((e) => e.includes('displayName'))).toBe(true);
  });

  it('rejects an invalid category', () => {
    const errors = validateCustomSkill(
      { ...validSkill(), category: 'bogus' as never },
      { isNew: true },
    );
    expect(errors.some((e) => e.includes('category'))).toBe(true);
  });

  it('rejects an empty promptTemplate', () => {
    const errors = validateCustomSkill({ ...validSkill(), promptTemplate: '' }, { isNew: true });
    expect(errors.some((e) => e.includes('promptTemplate'))).toBe(true);
  });

  it('rejects duplicated parameter names', () => {
    const errors = validateCustomSkill(
      {
        ...validSkill(),
        parameters: [
          { name: 'dup', type: 'string', description: 'a', required: true },
          { name: 'dup', type: 'string', description: 'b', required: false },
        ],
      },
      { isNew: true },
    );
    expect(errors.some((e) => e.includes('duplicated'))).toBe(true);
  });

  it('rejects a non-identifier parameter name', () => {
    const errors = validateCustomSkill(
      {
        ...validSkill(),
        parameters: [{ name: '123bad', type: 'string', description: '', required: true }],
      },
      { isNew: true },
    );
    expect(errors.some((e) => e.includes('identifier'))).toBe(true);
  });

  it('rejects more than the parameter limit', () => {
    const parameters = Array.from({ length: 13 }, (_, i) => ({
      name: `p${i}`,
      type: 'string' as const,
      description: 'x',
      required: true,
    }));
    const errors = validateCustomSkill({ ...validSkill(), parameters }, { isNew: true });
    expect(errors.some((e) => e.includes('at most'))).toBe(true);
  });

  it('rejects a non-boolean enabled', () => {
    const errors = validateCustomSkill(
      { ...validSkill(), enabled: 'yes' as unknown as boolean },
      { isNew: true },
    );
    expect(errors.some((e) => e.includes('enabled'))).toBe(true);
  });

  it('returns a single root error for non-object input', () => {
    const errors = validateCustomSkill(null);
    expect(errors).toEqual(['Skill must be an object.']);
  });
});

describe('renderSkillTemplate', () => {
  const params: CustomSkill['parameters'] = [
    { name: 'name', type: 'string', description: '', required: true },
    { name: 'count', type: 'number', description: '', required: true },
    { name: 'verbose', type: 'boolean', description: '', required: false },
  ];

  it('interpolates declared string/number/boolean params', () => {
    const out = renderSkillTemplate('name={{name}} count={{count}} verbose={{verbose}}', params, {
      name: 'Alice',
      count: 7,
      verbose: true,
    });
    expect(out).toBe('name=Alice count=7 verbose=true');
  });

  it('coerces string inputs to the declared type', () => {
    const out = renderSkillTemplate('{{count}}/{{verbose}}', params, {
      count: '42',
      verbose: 'true',
    });
    expect(out).toBe('42/true');
  });

  it('renders an empty string for undeclared / missing params', () => {
    const out = renderSkillTemplate('[{{missing}}][{{name}}]', params, { name: 'Bob' });
    expect(out).toBe('[][Bob]');
  });

  it('ignores whitespace inside the placeholder', () => {
    const out = renderSkillTemplate('{{  name  }}', params, { name: 'Cleo' });
    expect(out).toBe('Cleo');
  });
});
