import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import { createVersion, deleteAllVersions } from '@/lib/server/content-versioning';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomStorage');

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
  /** Owner user ID (when auth is enabled). null/undefined = legacy or anonymous. */
  ownerId?: string | null;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Minimal runtime shape check for parsed classroom data.
 *
 * Files on disk are normally written by `persistClassroom` (atomic rename),
 * but a partially-written file from a crashed process or a hand-edited JSON
 * with a missing field would otherwise be returned as if valid, then crash
 * downstream code on `classroom.scenes`/`classroom.stage` access. Returning
 * null here matches the "not found" semantics callers already handle (404).
 */
function isValidClassroomData(value: unknown): value is PersistedClassroomData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    !!v.stage &&
    typeof v.stage === 'object' &&
    Array.isArray(v.scenes) &&
    typeof v.createdAt === 'string'
    // ownerId is optional — legacy classrooms have no owner
  );
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    // Treat corrupt-but-parseable files the same as missing: callers map
    // null → 404, so a half-written file degrades to "not found" rather
    // than a 500 from accessing undefined fields.
    return isValidClassroomData(parsed) ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
    /** Owner user ID (when auth is enabled). Omit for anonymous/legacy. */
    ownerId?: string | null;
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  if (!isValidClassroomId(data.id)) {
    throw new Error('Invalid classroom id');
  }

  // Create a version snapshot of the existing content before overwriting.
  // Wrapped in try-catch so versioning failures never block the save —
  // the version history is a best-effort safety net, not a critical path.
  try {
    const existing = await readClassroom(data.id);
    if (existing) {
      await createVersion(data.id, existing, 'pre-save');
    }
  } catch (err) {
    log.warn('Failed to create version snapshot', { classroomId: data.id, err });
  }

  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
    ...(data.ownerId ? { ownerId: data.ownerId } : {}),
  };

  await ensureClassroomsDir();
  const filePath = path.join(CLASSROOMS_DIR, `${data.id}.json`);
  await writeJsonFileAtomic(filePath, classroomData);

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}

/**
 * Delete a classroom and all its version snapshots.
 *
 * @returns `true` if the classroom file existed and was deleted, `false` if
 *   it was already absent. Version snapshots are always cleaned up regardless.
 */
export async function deleteClassroom(id: string): Promise<boolean> {
  if (!isValidClassroomId(id)) {
    throw new Error('Invalid classroom id');
  }

  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  let existed = false;
  try {
    await fs.unlink(filePath);
    existed = true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  // Clean up version snapshots regardless of whether the classroom file existed.
  await deleteAllVersions(id);

  return existed;
}
