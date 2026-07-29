/**
 * 内容版本控制 — classroom 变更历史与回滚。
 *
 * 在文件系统层面为每个 classroom 维护版本快照，
 * 支持查看历史、回滚到任意版本、版本差异对比。
 *
 * 存储路径：data/classroom-versions/<classroomId>/<timestamp>-<label>.json
 * 保留最近 20 个版本，超出自动清理最旧版本。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '@/lib/logger';

const log = createLogger('Versioning');

const MAX_VERSIONS = 20;
const VERSIONS_DIR = path.join(process.cwd(), 'data', 'classroom-versions');

export interface VersionMeta {
  versionId: string;
  classroomId: string;
  timestamp: number;
  label: string;
  size: number;
}

export interface VersionContent {
  meta: VersionMeta;
  data: unknown;
}

function versionDir(classroomId: string): string {
  return path.join(VERSIONS_DIR, classroomId);
}

function versionPath(classroomId: string, versionId: string): string {
  return path.join(versionDir(classroomId), `${versionId}.json`);
}

/** 确保目录存在 */
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** 创建版本快照 */
export async function createVersion(
  classroomId: string,
  data: unknown,
  label: string = 'auto',
): Promise<VersionMeta> {
  const timestamp = Date.now();
  const versionId = `${timestamp}-${label.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const filePath = versionPath(classroomId, versionId);

  await ensureDir(versionDir(classroomId));

  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, 'utf-8');

  log.debug('Version created', { classroomId, versionId, label });

  // 清理超出上限的旧版本
  await pruneOldVersions(classroomId);

  return {
    versionId,
    classroomId,
    timestamp,
    label,
    size: content.length,
  };
}

/** 列出所有版本 */
export async function listVersions(classroomId: string): Promise<VersionMeta[]> {
  try {
    const dir = versionDir(classroomId);
    const files = await fs.readdir(dir);

    const versions: VersionMeta[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const stat = await fs.stat(path.join(dir, file));
      const versionId = file.replace('.json', '');
      const [tsStr, ...labelParts] = versionId.split('-');
      versions.push({
        versionId,
        classroomId,
        timestamp: Number(tsStr) || 0,
        label: labelParts.join('-') || 'auto',
        size: stat.size,
      });
    }

    // 按时间倒序
    versions.sort((a, b) => b.timestamp - a.timestamp);
    return versions;
  } catch {
    return [];
  }
}

/** 读取特定版本内容 */
export async function getVersion(
  classroomId: string,
  versionId: string,
): Promise<VersionContent | null> {
  try {
    const filePath = versionPath(classroomId, versionId);
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const [tsStr, ...labelParts] = versionId.split('-');

    return {
      meta: {
        versionId,
        classroomId,
        timestamp: Number(tsStr) || 0,
        label: labelParts.join('-') || 'auto',
        size: content.length,
      },
      data,
    };
  } catch {
    return null;
  }
}

/** 删除特定版本 */
export async function deleteVersion(
  classroomId: string,
  versionId: string,
): Promise<boolean> {
  try {
    await fs.unlink(versionPath(classroomId, versionId));
    log.debug('Version deleted', { classroomId, versionId });
    return true;
  } catch {
    return false;
  }
}

/** 清理超出上限的旧版本 */
async function pruneOldVersions(classroomId: string): Promise<void> {
  const versions = await listVersions(classroomId);
  if (versions.length <= MAX_VERSIONS) return;

  const toDelete = versions.slice(MAX_VERSIONS);
  await Promise.all(
    toDelete.map((v) => deleteVersion(classroomId, v.versionId)),
  );

  log.debug('Pruned old versions', {
    classroomId,
    pruned: toDelete.length,
  });
}

/** 删除课堂的所有版本（课堂删除时调用） */
export async function deleteAllVersions(classroomId: string): Promise<void> {
  try {
    await fs.rm(versionDir(classroomId), { recursive: true, force: true });
    log.debug('All versions deleted', { classroomId });
  } catch (err) {
    log.warn('Failed to delete versions', { classroomId, err });
  }
}
