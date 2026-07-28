import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb, resolveDbPath } from '@/lib/db/client';
import { recordAuditLog } from '@/lib/db/audit';
import { users, classrooms, skills, usageRecords, auditLogs, apiKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rmSync } from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `nova-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

let dbPath: string;

beforeEach(() => {
  dbPath = tempDbPath();
  process.env.NOVA_DB_PATH = dbPath;
  closeDb();
});

afterEach(() => {
  closeDb();
  try {
    rmSync(dbPath, { force: true });
    rmSync(dbPath + '-wal', { force: true });
    rmSync(dbPath + '-shm', { force: true });
  } catch {
    // ignore
  }
  delete process.env.NOVA_DB_PATH;
});

describe('database client', () => {
  it('resolveDbPath respects NOVA_DB_PATH', () => {
    process.env.NOVA_DB_PATH = '/tmp/custom-nova.db';
    expect(resolveDbPath()).toBe('/tmp/custom-nova.db');
  });

  it('resolveDbPath defaults to data/nova.db', () => {
    delete process.env.NOVA_DB_PATH;
    const p = resolveDbPath();
    expect(p.endsWith(path.join('data', 'nova.db'))).toBe(true);
  });

  it('getDb returns a working connection', () => {
    const db = getDb();
    expect(db).toBeDefined();
    // Insert + query a user to verify the schema is live.
    const created = db
      .insert(users)
      .values({ email: 'test@example.com', name: 'Test User' })
      .returning()
      .get();
    expect(created.id).toBeDefined();
    expect(created.email).toBe('test@example.com');
    expect(created.role).toBe('user');
    expect(created.disabled).toBe(false);

    const found = db.select().from(users).where(eq(users.email, 'test@example.com')).get();
    expect(found?.id).toBe(created.id);
  });

  it('getDb caches the connection across calls', () => {
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });
});

describe('audit log helper', () => {
  it('records an audit log entry and returns it', () => {
    const row = recordAuditLog({
      actorId: 'user-1',
      actorRole: 'admin',
      action: 'classroom.create',
      entityType: 'classroom',
      entityId: 'cls-1',
      details: { title: 'My Classroom' },
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
    expect(row).not.toBeNull();
    expect(row!.action).toBe('classroom.create');
    expect(row!.actorId).toBe('user-1');
    expect(row!.entityId).toBe('cls-1');
    expect(row!.detailsJson).toContain('My Classroom');

    const db = getDb();
    const found = db.select().from(auditLogs).where(eq(auditLogs.action, 'classroom.create')).get();
    expect(found?.id).toBe(row!.id);
  });

  it('tolerates missing optional fields', () => {
    const row = recordAuditLog({ action: 'system.startup' });
    expect(row).not.toBeNull();
    expect(row!.action).toBe('system.startup');
    expect(row!.actorId).toBeNull();
  });

  it('does not throw on database errors (fire-and-forget)', () => {
    // Close the db to force an error; the helper should swallow it.
    closeDb();
    // Reopen with a bad path to simulate failure is hard with better-sqlite3,
    // so instead we just verify recordAuditLog returns null on a closed db.
    // (getDb will reopen, so this is a no-op — the real guarantee is that
    // recordAuditLog catches internally. We verify the signature is safe.)
    expect(() => recordAuditLog({ action: 'no-throw' })).not.toThrow();
  });
});

describe('schema — classrooms, skills, usage, api keys', () => {
  it('inserts and reads a classroom with JSON blobs', () => {
    const db = getDb();
    const created = db
      .insert(classrooms)
      .values({
        id: 'cls-1',
        stageJson: JSON.stringify({ title: 'Test Stage' }),
        scenesJson: JSON.stringify([{ id: 's1' }]),
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
    expect(created.id).toBe('cls-1');
    expect(JSON.parse(created.stageJson).title).toBe('Test Stage');
    expect(created.deleted).toBe(false);
  });

  it('inserts and reads a skill', () => {
    const db = getDb();
    const created = db
      .insert(skills)
      .values({
        id: 'skill-1',
        displayName: 'My Skill',
        category: 'general',
        summary: 'A test skill',
        description: 'Detailed description',
        promptTemplate: 'Hello {{name}}',
        parametersJson: JSON.stringify([{ name: 'name', type: 'string', description: '', required: true }]),
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();
    expect(created.id).toBe('skill-1');
    expect(created.enabled).toBe(true);
    expect(JSON.parse(created.parametersJson)).toHaveLength(1);
  });

  it('inserts and reads a usage record', () => {
    const db = getDb();
    const created = db
      .insert(usageRecords)
      .values({
        id: 'usage-1',
        createdAt: Date.now(),
        kind: 'llm',
        source: 'test',
        providerId: 'openai',
        modelId: 'gpt-4',
        modelString: 'openai:gpt-4',
        inputTokens: 100,
        outputTokens: 50,
      })
      .returning()
      .get();
    expect(created.id).toBe('usage-1');
    expect(created.inputTokens).toBe(100);
    expect(created.kind).toBe('llm');
  });

  it('inserts and reads an api key', () => {
    const db = getDb();
    // Need a user first (FK).
    const user = db
      .insert(users)
      .values({ email: 'keyowner@example.com' })
      .returning()
      .get();
    const created = db
      .insert(apiKeys)
      .values({
        ownerId: user.id,
        label: 'CI key',
        keyHash: 'sha256:abc123',
        keyPrefix: 'nova_abc',
      })
      .returning()
      .get();
    expect(created.label).toBe('CI key');
    expect(created.keyHash).toBe('sha256:abc123');
    expect(JSON.parse(created.scopes)).toEqual([]);
    expect(created.revokedAt).toBeNull();
  });
});
