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
import { CustomSkill, SkillVersion, validateCustomSkill } from '@/lib/agent/tools/custom-skill';

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
    if (!isValidSkill(parsed)) return null;
    // Ensure version field exists for backward compat with legacy skills
    return ensureVersionField(parsed);
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
  const normalized = ensureVersionField(skill);
  const errors = validateCustomSkill(normalized, { isNew: true });
  if (errors.length > 0) {
    throw new Error(`Invalid custom skill: ${errors.join('; ')}`);
  }
  const existing = await readCustomSkill(normalized.id, opts);
  if (existing) {
    throw new Error(`Custom skill "${normalized.id}" already exists`);
  }
  await writeJsonFileAtomic(skillFilePath(normalized.id, opts.baseDir), normalized);
  return normalized;
}

/** Replace an existing custom skill. Throws if missing or invalid.
 *  Snapshots the previous version into version history before overwriting. */
export async function updateCustomSkill(
  skill: CustomSkill,
  opts: SkillStorageOptions = {},
): Promise<CustomSkill> {
  // Ensure version field exists (backward compat with legacy skills)
  const normalized = ensureVersionField(skill);
  const errors = validateCustomSkill(normalized, { isNew: true });
  if (errors.length > 0) {
    throw new Error(`Invalid custom skill: ${errors.join('; ')}`);
  }
  const existing = await readCustomSkill(skill.id, opts);
  if (!existing) {
    throw new Error(`Custom skill "${skill.id}" not found`);
  }
  // Snapshot the existing version before overwriting
  await snapshotVersion(ensureVersionField(existing), opts);
  await writeJsonFileAtomic(skillFilePath(skill.id, opts.baseDir), normalized);
  return normalized;
}

/** Delete a custom skill. Returns false if it did not exist. */
export async function deleteCustomSkill(
  id: string,
  opts: SkillStorageOptions = {},
): Promise<boolean> {
  if (!isValidCustomSkillId(id)) return false;
  try {
    await fs.unlink(skillFilePath(id, opts.baseDir));
    // Also remove version history if it exists
    try {
      await fs.unlink(versionsFilePath(id, opts.baseDir));
    } catch {
      // No version history — fine
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

// ─── Versioning ─────────────────────────────────────────────────────────────

/** Path to the version history file for a skill. */
function versionsFilePath(id: string, baseDir?: string): string {
  return path.join(skillsDir(baseDir), `${id}.versions.json`);
}

/**
 * Ensure a skill has a version field. If it's missing (legacy skill), default to "1.0.0".
 */
function ensureVersionField(skill: CustomSkill): CustomSkill {
  if (!skill.version) {
    return { ...skill, version: '1.0.0' };
  }
  return skill;
}

/**
 * Snapshot the current skill into its version history before an update.
 * Keeps at most 20 versions (oldest trimmed).
 */
async function snapshotVersion(
  skill: CustomSkill,
  opts: SkillStorageOptions = {},
): Promise<void> {
  const versions = await listSkillVersions(skill.id, opts);
  const { version, dependencies, ...rest } = skill;
  const snapshot: SkillVersion = {
    version: version || '1.0.0',
    snapshot: rest,
    createdAt: skill.updatedAt || skill.createdAt,
  };
  versions.unshift(snapshot);
  // Trim to last 20 versions
  const trimmed = versions.slice(0, 20);
  await writeJsonFileAtomic(versionsFilePath(skill.id, opts.baseDir), trimmed);
}

/** List all versions of a skill (newest first). */
export async function listSkillVersions(
  id: string,
  opts: SkillStorageOptions = {},
): Promise<SkillVersion[]> {
  if (!isValidCustomSkillId(id)) return [];
  try {
    const content = await fs.readFile(versionsFilePath(id, opts.baseDir), 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Get a specific version snapshot of a skill. */
export async function getSkillVersion(
  id: string,
  version: string,
  opts: SkillStorageOptions = {},
): Promise<SkillVersion | null> {
  const versions = await listSkillVersions(id, opts);
  return versions.find((v) => v.version === version) ?? null;
}

/**
 * Restore a skill to a previous version.
 * The current version is snapshotted before restoring.
 * Returns the restored skill.
 */
export async function restoreSkillVersion(
  id: string,
  version: string,
  opts: SkillStorageOptions = {},
): Promise<CustomSkill | null> {
  const current = await readCustomSkill(id, opts);
  if (!current) return null;

  const targetVersion = await getSkillVersion(id, version, opts);
  if (!targetVersion) return null;

  // Snapshot the current version before restoring
  await snapshotVersion(ensureVersionField(current), opts);

  // Reconstruct the skill from the snapshot
  const restored: CustomSkill = {
    ...targetVersion.snapshot,
    version: targetVersion.version,
    dependencies: current.dependencies,
    updatedAt: new Date().toISOString(),
  };

  await writeJsonFileAtomic(skillFilePath(id, opts.baseDir), restored);
  return restored;
}

// ─── Dependency Resolution ──────────────────────────────────────────────────

/**
 * Resolve dependencies for a set of skills.
 * Returns a map of skill ID → list of missing dependency IDs.
 * Also detects circular dependencies.
 */
export function resolveDependencies(
  skills: CustomSkill[],
): {
  missing: Map<string, string[]>;
  circular: Map<string, string[]>;
} {
  const skillIds = new Set(skills.map((s) => s.id));
  const missing = new Map<string, string[]>();
  const circular = new Map<string, string[]>();

  for (const skill of skills) {
    if (!skill.dependencies || skill.dependencies.length === 0) continue;

    const missingDeps = skill.dependencies.filter((dep) => !skillIds.has(dep));
    if (missingDeps.length > 0) {
      missing.set(skill.id, missingDeps);
    }

    // Check for circular dependencies via DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (depId: string): string[] | null => {
      if (recursionStack.has(depId)) return [depId];
      if (visited.has(depId)) return null;
      visited.add(depId);
      recursionStack.add(depId);

      const depSkill = skills.find((s) => s.id === depId);
      if (depSkill?.dependencies) {
        for (const subDep of depSkill.dependencies) {
          const cycle = hasCycle(subDep);
          if (cycle) return [depId, ...cycle];
        }
      }

      recursionStack.delete(depId);
      return null;
    };

    for (const dep of skill.dependencies) {
      const cycle = hasCycle(dep);
      if (cycle) {
        circular.set(skill.id, cycle);
        break;
      }
    }
  }

  return { missing, circular };
}

/**
 * Get the topological order of skills based on dependencies.
 * Skills with no dependencies come first. Throws if a cycle is detected.
 */
export function topologicalSort(skills: CustomSkill[]): CustomSkill[] {
  const skillMap = new Map(skills.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const result: CustomSkill[] = [];

  const visit = (id: string, path: string[]): void => {
    if (visited.has(id)) return;
    if (path.includes(id)) {
      throw new Error(`Circular dependency detected: ${[...path, id].join(' → ')}`);
    }
    const skill = skillMap.get(id);
    if (!skill) return;
    if (skill.dependencies) {
      for (const dep of skill.dependencies) {
        visit(dep, [...path, id]);
      }
    }
    visited.add(id);
    result.push(skill);
  };

  for (const skill of skills) {
    visit(skill.id, []);
  }

  return result;
}
