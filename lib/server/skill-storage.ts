/**
 * Server-side persistence for custom skills.
 *
 * One JSON file per skill under `data/skills/<id>.json`, mirroring the
 * classroom-storage pattern (atomic write via temp file + rename, defensive
 * parse on read so a corrupt file degrades to "not found" rather than a 500).
 *
 * This is a flat-file store intentionally: the number of custom skills is
 * small (single-digit to low-double-digit per deployment) and the app already
 * uses the same pattern for classrooms and jobs. Phase 3D will migrate this to
 * Drizzle/SQLite alongside the other stores without changing the API.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { CustomSkill, validateCustomSkill } from '@/lib/agent/tools/custom-skill';

/**
 * Resolve the directory used to store custom skills. Defaults to
 * `data/skills` under the process CWD (mirroring classroom / usage storage).
 * When `baseDir` is provided (mainly for tests) it replaces the process CWD
 * segment, so `baseDir` is treated as the project root and `/skills` is
 * still appended — keeping the on-disk layout identical in production and
 * tests.
 */
export function skillsDir(baseDir?: string): string {
  return path.join(baseDir ?? process.cwd(), 'data', 'skills');
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function skillFilePath(id: string, baseDir?: string): string {
  return path.join(skillsDir(baseDir), `${id}.json`);
}

/** Reject ids that could escape the skills directory or collide with built-ins. */
export function isValidCustomSkillId(id: string): boolean {
  return /^[a-z0-9_-]+$/.test(id) && id.length <= 64;
}

async function writeJsonFileAtomic(filePath: string, data: unknown) {
  await ensureDir(path.dirname(filePath));
  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

function isValidSkill(value: unknown): value is CustomSkill {
  return validateCustomSkill(value, { isNew: true }).length === 0;
}

/** Common options accepted by the storage functions. */
export interface SkillStorageOptions {
  /** Override the `data/skills` directory (mainly for tests). */
  baseDir?: string;
}

/** List all custom skills (sorted by displayName). */
export async function listCustomSkills(opts: SkillStorageOptions = {}): Promise<CustomSkill[]> {
  try {
    const entries = await fs.readdir(skillsDir(opts.baseDir));
    const skills: CustomSkill[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const id = entry.slice(0, -'.json'.length);
      if (!isValidCustomSkillId(id)) continue;
      const skill = await readCustomSkill(id, opts);
      if (skill) skills.push(skill);
    }
    skills.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return skills;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Read a single custom skill by id. Returns null if missing or corrupt. */
export async function readCustomSkill(
  id: string,
  opts: SkillStorageOptions = {},
): Promise<CustomSkill | null> {
  if (!isValidCustomSkillId(id)) return null;
  try {
    const content = await fs.readFile(skillFilePath(id, opts.baseDir), 'utf-8');
    const parsed: unknown = JSON.parse(content);
    // Degrade corrupt-but-parseable files to "not found" so callers map to 404.
    return isValidSkill(parsed) ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Create a new custom skill. Throws on id collision or validation failure. */
export async function createCustomSkill(
  skill: CustomSkill,
  opts: SkillStorageOptions = {},
): Promise<CustomSkill> {
  const errors = validateCustomSkill(skill, { isNew: true });
  if (errors.length > 0) {
    throw new Error(`Invalid custom skill: ${errors.join('; ')}`);
  }
  const existing = await readCustomSkill(skill.id, opts);
  if (existing) {
    throw new Error(`Custom skill "${skill.id}" already exists`);
  }
  await writeJsonFileAtomic(skillFilePath(skill.id, opts.baseDir), skill);
  return skill;
}

/** Replace an existing custom skill. Throws if missing or invalid. */
export async function updateCustomSkill(
  skill: CustomSkill,
  opts: SkillStorageOptions = {},
): Promise<CustomSkill> {
  const errors = validateCustomSkill(skill, { isNew: true });
  if (errors.length > 0) {
    throw new Error(`Invalid custom skill: ${errors.join('; ')}`);
  }
  const existing = await readCustomSkill(skill.id, opts);
  if (!existing) {
    throw new Error(`Custom skill "${skill.id}" not found`);
  }
  await writeJsonFileAtomic(skillFilePath(skill.id, opts.baseDir), skill);
  return skill;
}

/** Delete a custom skill. Returns false if it did not exist. */
export async function deleteCustomSkill(
  id: string,
  opts: SkillStorageOptions = {},
): Promise<boolean> {
  if (!isValidCustomSkillId(id)) return false;
  try {
    await fs.unlink(skillFilePath(id, opts.baseDir));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
