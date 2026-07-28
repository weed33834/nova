import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  listCustomSkills,
  readCustomSkill,
  createCustomSkill,
  updateCustomSkill,
  deleteCustomSkill,
  isValidCustomSkillId,
  type SkillStorageOptions,
} from '@/lib/server/skill-storage';
import type { CustomSkill } from '@/lib/agent/tools/custom-skill';

let tmpDir: string;
let opts: SkillStorageOptions;

function validSkill(overrides: Partial<CustomSkill> = {}): CustomSkill {
  const now = new Date().toISOString();
  return {
    id: 'my_skill',
    displayName: 'My Skill',
    category: 'custom',
    summary: 'A test skill.',
    description: 'Used to test storage.',
    promptTemplate: 'Summarize: {{text}}',
    parameters: [{ name: 'text', type: 'string', description: 'input', required: true }],
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-storage-test-'));
  opts = { baseDir: tmpDir };
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('isValidCustomSkillId', () => {
  it('accepts lowercase letters, digits, underscore, hyphen', () => {
    expect(isValidCustomSkillId('my_skill-1')).toBe(true);
  });
  it('rejects uppercase, slashes, dots, spaces', () => {
    expect(isValidCustomSkillId('BadID')).toBe(false);
    expect(isValidCustomSkillId('../etc')).toBe(false);
    expect(isValidCustomSkillId('a.b')).toBe(false);
    expect(isValidCustomSkillId('a b')).toBe(false);
  });
  it('rejects ids longer than 64 chars', () => {
    expect(isValidCustomSkillId('a'.repeat(65))).toBe(false);
    expect(isValidCustomSkillId('a'.repeat(64))).toBe(true);
  });
});

describe('createCustomSkill', () => {
  it('writes a JSON file and returns the skill', async () => {
    const skill = validSkill();
    await createCustomSkill(skill, opts);
    const content = await fs.readFile(path.join(tmpDir, 'data', 'skills', 'my_skill.json'), 'utf-8');
    expect(JSON.parse(content).id).toBe('my_skill');
  });

  it('throws on id collision', async () => {
    await createCustomSkill(validSkill(), opts);
    await expect(createCustomSkill(validSkill(), opts)).rejects.toThrow(/already exists/);
  });

  it('throws on invalid skill', async () => {
    await expect(
      createCustomSkill({ ...validSkill(), displayName: '' }, opts),
    ).rejects.toThrow(/Invalid custom skill/);
  });
});

describe('readCustomSkill', () => {
  it('returns the skill after create', async () => {
    const skill = validSkill();
    await createCustomSkill(skill, opts);
    expect(await readCustomSkill('my_skill', opts)).toEqual(skill);
  });

  it('returns null for a missing id', async () => {
    expect(await readCustomSkill('nope', opts)).toBeNull();
  });

  it('returns null for an invalid id (no path traversal)', async () => {
    expect(await readCustomSkill('../../etc/passwd', opts)).toBeNull();
  });

  it('returns null for a corrupt-but-parseable file', async () => {
    await fs.mkdir(path.join(tmpDir, 'data', 'skills'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'data', 'skills', 'corrupt.json'),
      JSON.stringify({ id: 'corrupt', displayName: 42 }),
    );
    expect(await readCustomSkill('corrupt', opts)).toBeNull();
  });
});

describe('listCustomSkills', () => {
  it('returns an empty array when the directory does not exist', async () => {
    expect(await listCustomSkills(opts)).toEqual([]);
  });

  it('returns all skills sorted by displayName', async () => {
    const a = validSkill({ id: 'a', displayName: 'Zeta' });
    const b = validSkill({ id: 'b', displayName: 'Alpha' });
    await createCustomSkill(a, opts);
    await createCustomSkill(b, opts);
    const list = await listCustomSkills(opts);
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('skips files whose name is not a valid skill id', async () => {
    await createCustomSkill(validSkill(), opts);
    await fs.mkdir(path.join(tmpDir, 'data', 'skills'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data', 'skills', 'Bad.json'), '{}');
    await fs.writeFile(path.join(tmpDir, 'data', 'skills', 'readme.txt'), 'hi');
    const list = await listCustomSkills(opts);
    expect(list.map((s) => s.id)).toEqual(['my_skill']);
  });
});

describe('updateCustomSkill', () => {
  it('overwrites an existing skill', async () => {
    await createCustomSkill(validSkill(), opts);
    const updated = validSkill({ displayName: 'Renamed', summary: 'New summary' });
    await updateCustomSkill(updated, opts);
    expect(await readCustomSkill('my_skill', opts)).toEqual(updated);
  });

  it('throws if the skill does not exist', async () => {
    await expect(updateCustomSkill(validSkill(), opts)).rejects.toThrow(/not found/);
  });
});

describe('deleteCustomSkill', () => {
  it('removes the file and returns true', async () => {
    await createCustomSkill(validSkill(), opts);
    expect(await deleteCustomSkill('my_skill', opts)).toBe(true);
    expect(await readCustomSkill('my_skill', opts)).toBeNull();
  });

  it('returns false if the skill does not exist', async () => {
    expect(await deleteCustomSkill('nope', opts)).toBe(false);
  });

  it('returns false for an invalid id', async () => {
    expect(await deleteCustomSkill('../../etc/passwd', opts)).toBe(false);
  });
});
