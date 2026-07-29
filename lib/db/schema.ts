/**
 * Drizzle ORM schema for Nova's server-side SQLite database.
 *
 * This is the single source of truth for all persisted server state. Tables
 * here gradually replace the flat-file stores (`data/classrooms/*.json`,
 * `data/skills/*.json`, `data/usage/*.jsonl`) with a queryable, transactional
 * database — while keeping the same data shapes so callers can be migrated
 * incrementally.
 *
 * Conventions:
 *  - All timestamps are ISO 8601 strings (TEXT), matching the existing
 *    flat-file stores (e.g. `PersistedClassroomData.createdAt`).
 *  - IDs are application-generated strings (nanoid), stored as TEXT primary
 *    keys — not auto-increment integers — so they stay stable across migrations
 *    and are safe to expose in URLs.
 *  - JSON blobs (stage, scenes, parameters) are stored as TEXT and parsed on
 *    read; SQLite's JSON1 extension is available but we keep the column types
 *    simple for Drizzle compatibility.
 */
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Auth — NextAuth.js (Phase 3B) compatible tables.
// These follow the NextAuth Drizzle adapter schema so the adapter can manage
// them directly without a custom mapping layer.
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: text('email_verified'), // ISO 8601 timestamp
  image: text('image'),
  // Bcrypt hash; null for OAuth-only users (they authenticate via accounts).
  passwordHash: text('password_hash'),
  // RBAC
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  // Soft delete / disable
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const accounts = sqliteTable('accounts', {
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
});

// NextAuth Drizzle adapter expects a composite PK on accounts.
// (Drizzle's primaryKey helper is used in the relations below.)

export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: text('expires').notNull(),
});

export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: text('expires').notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

// ---------------------------------------------------------------------------
// Classrooms — migrated from data/classrooms/<id>.json
// ---------------------------------------------------------------------------

export const classrooms = sqliteTable('classrooms', {
  id: text('id').primaryKey(),
  // Owner; null during the transition period (existing flat-file classrooms
  // have no owner). Once Phase 3B lands, new classrooms are always owned.
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  // The full Stage + Scenes JSON. Stored as TEXT; the reader parses it back
  // into the typed shapes the rest of the app expects.
  stageJson: text('stage_json').notNull(),
  scenesJson: text('scenes_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  // Soft delete so restore is possible.
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
});

// ---------------------------------------------------------------------------
// Skills — migrated from data/skills/<id>.json
// ---------------------------------------------------------------------------

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  category: text('category').notNull(),
  summary: text('summary').notNull(),
  description: text('description').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  // CustomSkillParam[] serialized as JSON.
  parametersJson: text('parameters_json').notNull().default('[]'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// Usage records — migrated from data/usage/<YYYY-MM>.jsonl
// ---------------------------------------------------------------------------

export const usageRecords = sqliteTable('usage_records', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: integer('created_at').notNull(), // epoch ms (matches UsageRecord.createdAt)
  kind: text('kind', { enum: ['llm', 'image', 'video', 'tts', 'asr'] })
    .notNull()
    .default('llm'),
  source: text('source').notNull(),
  providerId: text('provider_id').notNull(),
  modelId: text('model_id').notNull(),
  modelString: text('model_string').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheCreationTokens: integer('cache_creation_tokens').notNull().default(0),
  reasoningTokens: integer('reasoning_tokens').notNull().default(0),
  quantity: integer('quantity'),
  unit: text('unit', { enum: ['token', 'image', 'second', 'character'] }),
  // Link to the owning user once auth is in place.
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
});

// ---------------------------------------------------------------------------
// Audit logs — new, for enterprise compliance / observability.
// Append-only; never updated or deleted via the app.
// ---------------------------------------------------------------------------

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  // The actor: a user id, or a sentinel like 'system' / 'anonymous'.
  actorId: text('actor_id'),
  actorRole: text('actor_role'),
  // What happened, e.g. 'classroom.create', 'skill.delete', 'user.login'.
  action: text('action').notNull(),
  // The entity affected, if any.
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  // Arbitrary structured details (before/after diff, request meta, etc.).
  detailsJson: text('details_json'),
  // Request context for traceability.
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
});

// ---------------------------------------------------------------------------
// API keys — for programmatic access (enterprise feature).
// ---------------------------------------------------------------------------

export const apiKeys = sqliteTable('api_keys', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Human-readable label for the management UI.
  label: text('label').notNull(),
  // SHA-256 hash of the key; the plaintext is only shown once at creation.
  keyHash: text('key_hash').notNull().unique(),
  // Prefix shown in the UI so the user can identify a key without the secret.
  keyPrefix: text('key_prefix').notNull(),
  scopes: text('scopes').notNull().default('[]'), // JSON array of scope strings
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  revokedAt: text('revoked_at'),
});

// ---------------------------------------------------------------------------
// Type exports — inferred from the schema so callers stay in sync.
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Classroom = typeof classrooms.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
