import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { hasPermission, AuthRequiredError, ForbiddenError } from '@/lib/auth/rbac';
import type { Permission } from '@/lib/auth/rbac';
import { getDb, closeDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rmSync } from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  return path.join(os.tmpdir(), `nova-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

describe('password utilities', () => {
  it('hashes a password and verifies it', async () => {
    const hash = await hashPassword('mySecret123');
    expect(hash).not.toBe('mySecret123');
    expect(hash.length).toBeGreaterThan(20);

    const valid = await verifyPassword('mySecret123', hash);
    expect(valid).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correctPassword');
    const valid = await verifyPassword('wrongPassword', hash);
    expect(valid).toBe(false);
  });

  it('produces different hashes for the same password (salt)', async () => {
    const hash1 = await hashPassword('samePassword');
    const hash2 = await hashPassword('samePassword');
    expect(hash1).not.toBe(hash2);
    // Both should verify against the original.
    expect(await verifyPassword('samePassword', hash1)).toBe(true);
    expect(await verifyPassword('samePassword', hash2)).toBe(true);
  });
});

describe('RBAC — hasPermission', () => {
  const userPerms: Permission[] = [
    'classroom:create',
    'classroom:read',
    'classroom:update',
    'classroom:delete',
    'skill:create',
    'skill:read',
    'skill:update',
    'skill:delete',
    'usage:read',
    'apikey:manage',
  ];

  const adminOnlyPerms: Permission[] = [
    'classroom:read:any',
    'usage:read:any',
    'user:read',
    'user:manage',
    'audit:read',
    'settings:manage',
  ];

  it('grants user permissions to the user role', () => {
    for (const p of userPerms) {
      expect(hasPermission('user', p)).toBe(true);
    }
  });

  it('denies admin-only permissions to the user role', () => {
    for (const p of adminOnlyPerms) {
      expect(hasPermission('user', p)).toBe(false);
    }
  });

  it('grants all permissions to the admin role', () => {
    const allPerms = [...userPerms, ...adminOnlyPerms];
    for (const p of allPerms) {
      expect(hasPermission('admin', p)).toBe(true);
    }
  });

  it('returns false for undefined role', () => {
    expect(hasPermission(undefined, 'classroom:read')).toBe(false);
  });
});

describe('RBAC — error classes', () => {
  it('AuthRequiredError has the right name and message', () => {
    const err = new AuthRequiredError();
    expect(err.name).toBe('AuthRequiredError');
    expect(err.message).toContain('Authentication required');
    expect(err instanceof Error).toBe(true);
  });

  it('ForbiddenError carries the permission', () => {
    const err = new ForbiddenError('user:manage');
    expect(err.name).toBe('ForbiddenError');
    expect(err.permission).toBe('user:manage');
    expect(err.message).toContain('user:manage');
  });
});

describe('createUserWithCredentials', () => {
  it('creates a user with a hashed password and user role', async () => {
    const { createUserWithCredentials } = await import('@/lib/auth/config');
    const user = await createUserWithCredentials('Test@example.com', 'password123', 'Test User');

    expect(user.email).toBe('test@example.com'); // lowercased
    expect(user.role).toBe('user');
    expect(user.id).toBeDefined();

    // Verify the password was hashed in the DB.
    const db = getDb();
    const row = db.select().from(users).where(eq(users.id, user.id)).get();
    expect(row?.passwordHash).toBeDefined();
    expect(row?.passwordHash).not.toBe('password123');
    expect(await verifyPassword('password123', row!.passwordHash!)).toBe(true);
  });

  it('rejects duplicate emails', async () => {
    const { createUserWithCredentials } = await import('@/lib/auth/config');
    await createUserWithCredentials('dup@example.com', 'password123');
    await expect(createUserWithCredentials('DUP@example.com', 'different')).rejects.toThrow(
      'already exists',
    );
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const { createUserWithCredentials } = await import('@/lib/auth/config');
    await expect(createUserWithCredentials('short@example.com', 'short')).rejects.toThrow(
      'at least 8',
    );
  });

  it('rejects empty email or password', async () => {
    const { createUserWithCredentials } = await import('@/lib/auth/config');
    await expect(createUserWithCredentials('', 'password123')).rejects.toThrow();
    await expect(createUserWithCredentials('empty@example.com', '')).rejects.toThrow();
  });

  it('trims and lowercases the email', async () => {
    const { createUserWithCredentials } = await import('@/lib/auth/config');
    const user = await createUserWithCredentials('  MixedCase@Example.COM  ', 'password123');
    expect(user.email).toBe('mixedcase@example.com');
  });
});
