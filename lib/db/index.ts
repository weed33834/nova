/**
 * Unified database factory — selects SQLite or PostgreSQL at runtime.
 *
 * When `DATABASE_URL` is set (and starts with `postgresql://` or `postgres://`),
 * the app uses PostgreSQL via `postgres` (postgres.js). Otherwise it falls back
 * to the default SQLite database (zero-config for development).
 *
 * The Drizzle ORM query builder API is nearly identical across both databases,
 * so application code uses the same `db.select()`, `db.insert()`, etc. patterns
 * regardless of the underlying driver. The only difference is that PostgreSQL
 * operations are async (returning Promises), while SQLite operations are
 * synchronous — but since all API routes are async, this is transparent.
 *
 * Usage:
 * ```ts
 * import { db, dbType } from '@/lib/db';
 *
 * // Works with both SQLite and PostgreSQL
 * const result = await db.select().from(users).limit(10);
 * ```
 *
 * Environment variables:
 *  - `DATABASE_URL`: PostgreSQL connection string (enables PostgreSQL mode)
 *  - `NOVA_DB_PATH`: SQLite database path (default: ./data/nova.db)
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('DBFactory');

export type DatabaseType = 'sqlite' | 'postgresql';

/**
 * Detect which database type is configured.
 * PostgreSQL is activated when `DATABASE_URL` starts with `postgresql://` or `postgres://`.
 */
export function getDatabaseType(): DatabaseType {
  const url = process.env.DATABASE_URL;
  if (url && (url.startsWith('postgresql://') || url.startsWith('postgres://'))) {
    return 'postgresql';
  }
  return 'sqlite';
}

/**
 * Get the unified Drizzle database instance.
 *
 * This is a lazy factory: it initializes the appropriate client on first call
 * and caches it for the lifetime of the process.
 *
 * The return type is a union of SQLite and PostgreSQL Drizzle databases.
 * Both expose the same query builder API, so application code can use the
 * returned `db` object interchangeably.
 */
export async function getDb() {
  const type = getDatabaseType();

  if (type === 'postgresql') {
    const { getDb: getPgDb } = await import('@/lib/db/pg-client');
    return getPgDb();
  }

  const { getDb: getSqliteDb } = await import('@/lib/db/client');
  return getSqliteDb();
}

/**
 * Synchronous database access (SQLite only).
 *
 * For SQLite, the Drizzle client is synchronous. This method provides a
 * synchronous accessor for code paths that don't need async (e.g., edge
 * middleware, synchronous server components).
 *
 * Throws if PostgreSQL is configured — PostgreSQL requires async access.
 */
export function getDbSync() {
  const type = getDatabaseType();
  if (type === 'postgresql') {
    throw new Error(
      'Synchronous database access is not supported with PostgreSQL. ' +
        'Use the async `getDb()` function instead, or set DATABASE_URL to a SQLite path.',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDb: getSqliteDb } = require('@/lib/db/client');
  return getSqliteDb();
}

/**
 * Close all database connections. Intended for graceful shutdown and tests.
 */
export async function closeDb(): Promise<void> {
  const type = getDatabaseType();

  if (type === 'postgresql') {
    const { closeDb: closePgDb } = await import('@/lib/db/pg-client');
    await closePgDb();
  } else {
    const { closeDb: closeSqliteDb } = await import('@/lib/db/client');
    closeSqliteDb();
  }
}

/**
 * Run a function inside a database transaction.
 *
 * For SQLite, uses better-sqlite3's synchronous transaction (commits on
 * normal return, rolls back on throw).
 *
 * For PostgreSQL, uses Drizzle's async transaction.
 */
export async function dbTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
  const type = getDatabaseType();

  if (type === 'postgresql') {
    const { getDb: getPgDb } = await import('@/lib/db/pg-client');
    const pgDb = await getPgDb();
    return pgDb.transaction(async () => fn());
  }

  // SQLite synchronous transaction
  const { getSqlite } = await import('@/lib/db/client');
  const sqlite = getSqlite();
  return sqlite.transaction(fn as () => T)();
}

/**
 * Get the current database type for logging and diagnostics.
 */
export const dbType: DatabaseType = getDatabaseType();

log.info(`Database type: ${dbType}`);
