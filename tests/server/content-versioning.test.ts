import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('Content Versioning', () => {
  let originalCwd: () => string;

  beforeEach(() => {
    originalCwd = process.cwd;
  });

  afterEach(() => {
    Object.defineProperty(process, 'cwd', {
      value: originalCwd,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  /**
   * Override process.cwd BEFORE importing the module, since VERSIONS_DIR
   * is computed at module load time using `path.join(process.cwd(), ...)`.
   */
  async function importWithTestDir(testBase: string) {
    await fs.mkdir(testBase, { recursive: true });
    Object.defineProperty(process, 'cwd', {
      value: () => testBase,
      configurable: true,
    });
    vi.resetModules();
    const mod = await import('@/lib/server/content-versioning');
    return mod;
  }

  describe('createVersion', () => {
    it('should create a version file on disk', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-1`);
      const mod = await importWithTestDir(testBase);

      try {
        const data = { stage: { id: 'test' }, scenes: [] };
        const meta = await mod.createVersion('cls_123', data, 'manual');

        expect(meta.classroomId).toBe('cls_123');
        expect(meta.label).toBe('manual');
        expect(meta.timestamp).toBeGreaterThan(0);
        expect(meta.size).toBeGreaterThan(0);

        const versions = await mod.listVersions('cls_123');
        expect(versions.length).toBe(1);
        expect(versions[0].versionId).toBe(meta.versionId);
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });

    it('should sanitize label characters in the filename', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-2`);
      const mod = await importWithTestDir(testBase);

      try {
        const meta = await mod.createVersion('cls_456', {}, 'my label/with!special');
        expect(meta.versionId).toContain('my_label_with_special');
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });

    it('should default label to "auto" when not specified', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-3`);
      const mod = await importWithTestDir(testBase);

      try {
        const meta = await mod.createVersion('cls_789', { data: 'test' });
        expect(meta.label).toBe('auto');
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });
  });

  describe('listVersions', () => {
    it('should return versions sorted by timestamp descending', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-4`);
      const mod = await importWithTestDir(testBase);

      try {
        await mod.createVersion('cls_sort', { v: 1 }, 'first');
        await new Promise((r) => setTimeout(r, 10));
        await mod.createVersion('cls_sort', { v: 2 }, 'second');
        await new Promise((r) => setTimeout(r, 10));
        await mod.createVersion('cls_sort', { v: 3 }, 'third');

        const versions = await mod.listVersions('cls_sort');
        expect(versions.length).toBe(3);
        expect(versions[0].label).toBe('third');
        expect(versions[1].label).toBe('second');
        expect(versions[2].label).toBe('first');
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });

    it('should return empty array for non-existent classroom', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-5`);
      const mod = await importWithTestDir(testBase);

      try {
        const versions = await mod.listVersions('nonexistent');
        expect(versions).toEqual([]);
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });
  });

  describe('getVersion', () => {
    it('should retrieve the full content of a specific version', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-6`);
      const mod = await importWithTestDir(testBase);

      try {
        const data = { stage: { name: 'Test Course' }, scenes: [{ id: 's1' }] };
        const meta = await mod.createVersion('cls_get', data, 'snapshot');

        const content = await mod.getVersion('cls_get', meta.versionId);
        expect(content).not.toBeNull();
        expect(content!.data).toEqual(data);
        expect(content!.meta.label).toBe('snapshot');
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });

    it('should return null for a non-existent version', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-7`);
      const mod = await importWithTestDir(testBase);

      try {
        const content = await mod.getVersion('cls_missing', '9999999-nonexistent');
        expect(content).toBeNull();
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });
  });

  describe('deleteVersion', () => {
    it('should delete a version file', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-8`);
      const mod = await importWithTestDir(testBase);

      try {
        const meta = await mod.createVersion('cls_del', { data: 'temp' }, 'to-delete');
        const deleted = await mod.deleteVersion('cls_del', meta.versionId);
        expect(deleted).toBe(true);

        const versions = await mod.listVersions('cls_del');
        expect(versions.length).toBe(0);
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });

    it('should return false for non-existent version', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-9`);
      const mod = await importWithTestDir(testBase);

      try {
        const deleted = await mod.deleteVersion('cls_del', '9999999-nonexistent');
        expect(deleted).toBe(false);
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });
  });

  describe('deleteAllVersions', () => {
    it('should remove all versions for a classroom', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-10`);
      const mod = await importWithTestDir(testBase);

      try {
        await mod.createVersion('cls_all', { v: 1 }, 'a');
        await mod.createVersion('cls_all', { v: 2 }, 'b');
        await mod.createVersion('cls_all', { v: 3 }, 'c');

        await mod.deleteAllVersions('cls_all');

        const versions = await mod.listVersions('cls_all');
        expect(versions.length).toBe(0);
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });
  });

  describe('pruneOldVersions', () => {
    it('should keep only the 20 most recent versions', async () => {
      const testBase = path.join(tmpdir(), `nova-ver-${Date.now()}-11`);
      const mod = await importWithTestDir(testBase);

      try {
        for (let i = 0; i < 25; i++) {
          await mod.createVersion('cls_prune', { index: i }, `v${i}`);
          await new Promise((r) => setTimeout(r, 5));
        }

        const versions = await mod.listVersions('cls_prune');
        expect(versions.length).toBe(20);

        const labels = versions.map((v) => v.label).sort();
        expect(labels).not.toContain('v0');
        expect(labels).not.toContain('v4');
        expect(labels).toContain('v5');
        expect(labels).toContain('v24');
      } finally {
        await fs.rm(testBase, { recursive: true, force: true });
      }
    });
  });
});
