/**
 * PostgreSQL database client (Drizzle + postgres.js).
 *
 * This is the PostgreSQL counterpart to `lib/db/client.ts` (SQLite). It is
 * loaded lazily when `DATABASE_URL` is set to a PostgreSQL connection string.
 *
 * The `postgres` package is an optional dependency — if it's not installed and
 * the user tries to use PostgreSQL, they'll get a clear error message.
 *
 * Connection pooling:
 *  - Uses postgres.js built-in connection pooling (max 10 connections by default)
 *  - Pool size configurable via `PG_POOL_MAX` environment variable
 *  - Connections are recycled automatically by postgres.js
 *
 * SSL:
 *  - Enabled by default when the connection string uses `sslmode=require`
 *  - Can be forced via `PG_SSL=true`
 *  - Can be disabled via `PG_SSL=false` (not recommended for production)
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { createLogger } from '@/lib/logger';
import * as schema from './pg-schema';

const log = createLogger('PgDB');

/**
 * Minimal interface for the postgres.js SQL tagged template function.
 * Using `any` for the callable since postgres.js has a complex overloaded
 * type that we can't fully express without the real package installed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PostgresSql = any;

let _db: PostgresJsDatabase<typeof schema> | null = null;
let _sql: PostgresSql | null = null;

export interface PgClientOptions {
  /** Max connections in the pool (default: 10). */
  poolMax?: number;
  /** Force SSL on/off. Default: auto-detect from connection string. */
  ssl?: boolean;
  /** Connection timeout in seconds (default: 30). */
  connectTimeout?: number;
}

/**
 * Lazily initialize and return the shared PostgreSQL Drizzle client.
 *
 * On first call this:
 *  1. Dynamically imports `postgres` (optional dependency)
 *  2. Creates a connection pool using `DATABASE_URL`
 *  3. Wraps it with Drizzle ORM
 *  4. Runs pending migrations from `drizzle/pg/`
 *
 * Subsequent calls return the cached instance.
 */
export async function getDb(): Promise<PostgresJsDatabase<typeof schema>> {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. To use PostgreSQL, set DATABASE_URL to a ' +
        'PostgreSQL connection string (e.g. postgresql://user:pass@host:5432/nova).',
    );
  }

  log.info('Initializing PostgreSQL connection...');

  try {
    const postgresModule = await import('postgres');
    const postgres = postgresModule.default || postgresModule;

    const poolMax = parseInt(process.env.PG_POOL_MAX || '10', 10);
    const ssl = parseSslConfig(connectionString);
    const connectTimeout = parseInt(process.env.PG_CONNECT_TIMEOUT || '30', 10);

    _sql = postgres(connectionString, {
      max: poolMax,
      ssl,
      connect_timeout: connectTimeout,
      // Statement timeout to prevent long-running queries from blocking the pool.
      // Can be overridden per-query with `.execute({ timeout: ... })`.
      // Default: 30 seconds.
      ...(process.env.PG_STATEMENT_TIMEOUT && {
        options: `-c statement_timeout=${parseInt(process.env.PG_STATEMENT_TIMEOUT, 10)}`,
      }),
    });

    _db = drizzle(_sql, { schema });

    // Run migrations
    const migrationsFolder = path.join(process.cwd(), 'drizzle', 'pg');
    try {
      await migrate(_db, { migrationsFolder });
      log.info('PostgreSQL migrations applied');
    } catch (err) {
      log.warn('Migration folder not found or migration failed. Creating schema directly:', err);
      await createSchemaDirectly(_sql);
    }

    log.info(`PostgreSQL connected (pool size: ${poolMax}, ssl: ${ssl ? 'on' : 'off'})`);
    return _db;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Cannot find module')) {
      throw new Error(
        'The "postgres" package is not installed. Install it with: pnpm add postgres\n' +
          'Then set DATABASE_URL to your PostgreSQL connection string.',
      );
    }
    throw err;
  }
}

/**
 * Parse SSL configuration from the connection string and environment.
 */
function parseSslConfig(connectionString: string): boolean | { rejectUnauthorized: boolean } {
  // Explicit override via env var
  if (process.env.PG_SSL === 'true') return { rejectUnauthorized: true };
  if (process.env.PG_SSL === 'false') return false;

  // Auto-detect from connection string
  if (connectionString.includes('sslmode=require') || connectionString.includes('sslmode=verify-full')) {
    return { rejectUnauthorized: true };
  }

  // Default: SSL off for local connections, on for non-local
  const isLocal =
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('192.168.');
  return isLocal ? false : { rejectUnauthorized: true };
}

/**
 * Fallback schema creation when migration files are absent.
 * Mirrors the SQLite `createSchemaDirectly` function.
 */
async function createSchemaDirectly(
  sql: PostgresSql,
): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      email_verified TEXT,
      image TEXT,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      disabled BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL DEFAULT now(),
      updated_at TEXT NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      PRIMARY KEY (provider, provider_account_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires TEXT NOT NULL,
      PRIMARY KEY (identifier, token)
    );

    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY,
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      stage_json TEXT NOT NULL,
      scenes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT now(),
      deleted BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      display_name TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt_template TEXT NOT NULL,
      parameters_json TEXT NOT NULL DEFAULT '[]',
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'llm',
      source TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_string TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER,
      unit TEXT,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT now(),
      actor_id TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '[]',
      last_used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT now(),
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS learning_events (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      user_id TEXT,
      classroom_id TEXT,
      scene_id TEXT,
      session_id TEXT,
      verb TEXT NOT NULL,
      object_type TEXT,
      object_id TEXT,
      result_json TEXT,
      duration_ms INTEGER,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS content_versions (
      id TEXT PRIMARY KEY,
      classroom_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      stage_json TEXT NOT NULL,
      scenes_json TEXT NOT NULL,
      created_by TEXT,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT now()
    );

    -- Indexes (matching the SQLite schema)
    CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
    CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS accounts_provider_idx ON accounts(provider);
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS classrooms_owner_id_idx ON classrooms(owner_id);
    CREATE INDEX IF NOT EXISTS classrooms_created_at_idx ON classrooms(created_at);
    CREATE INDEX IF NOT EXISTS classrooms_deleted_idx ON classrooms(deleted);
    CREATE INDEX IF NOT EXISTS skills_owner_id_idx ON skills(owner_id);
    CREATE INDEX IF NOT EXISTS skills_category_idx ON skills(category);
    CREATE INDEX IF NOT EXISTS usage_records_created_at_idx ON usage_records(created_at);
    CREATE INDEX IF NOT EXISTS usage_records_user_id_idx ON usage_records(user_id);
    CREATE INDEX IF NOT EXISTS usage_records_kind_idx ON usage_records(kind);
    CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS api_keys_owner_id_idx ON api_keys(owner_id);
    CREATE INDEX IF NOT EXISTS learning_events_user_id_idx ON learning_events(user_id);
    CREATE INDEX IF NOT EXISTS learning_events_classroom_id_idx ON learning_events(classroom_id);
    CREATE INDEX IF NOT EXISTS learning_events_session_id_idx ON learning_events(session_id);
    CREATE INDEX IF NOT EXISTS learning_events_verb_idx ON learning_events(verb);
    CREATE INDEX IF NOT EXISTS learning_events_created_at_idx ON learning_events(created_at);
    CREATE INDEX IF NOT EXISTS content_versions_classroom_id_idx ON content_versions(classroom_id);
    CREATE INDEX IF NOT EXISTS content_versions_version_idx ON content_versions(version);
  `);
  log.info('PostgreSQL schema created directly (fallback path)');
}

/**
 * Close the PostgreSQL connection pool. Intended for graceful shutdown and tests.
 */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
    _db = null;
    log.info('PostgreSQL connection closed');
  }
}

/**
 * Get the raw postgres.js SQL instance for low-level operations.
 */
export async function getSql(): Promise<PostgresSql> {
  if (!_sql) await getDb();
  return _sql;
}

/**
 * Check if PostgreSQL is available and configured.
 */
export function isPostgresConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return !!url && (url.startsWith('postgresql://') || url.startsWith('postgres://'));
}
