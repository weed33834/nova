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
import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
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
}, (table) => ({
  roleIdx: index('users_role_idx').on(table.role),
}));

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
}, (table) => ({
  userIdx: index('accounts_user_id_idx').on(table.userId),
  providerIdx: index('accounts_provider_idx').on(table.provider),
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}));

// NextAuth Drizzle adapter 需要 (provider, provider_account_id) 复合主键。

export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: text('expires').notNull(),
}, (table) => ({
  userIdx: index('sessions_user_id_idx').on(table.userId),
}));

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
}, (table) => ({
  ownerIdx: index('classrooms_owner_id_idx').on(table.ownerId),
  createdIdx: index('classrooms_created_at_idx').on(table.createdAt),
  deletedIdx: index('classrooms_deleted_idx').on(table.deleted),
}));

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
}, (table) => ({
  ownerIdx: index('skills_owner_id_idx').on(table.ownerId),
  categoryIdx: index('skills_category_idx').on(table.category),
}));

// ---------------------------------------------------------------------------
// Agents — server-side persistence for custom agents.
//
// Custom agents (persona/role, system prompt, voice, avatar, allowed actions)
// were previously stored only in browser localStorage/IndexedDB. This table
// mirrors the `skills` pattern so agents are DB-backed and queryable, surviving
// across devices and sessions. Timestamps are epoch ms (integer) to match the
// `usage_records` convention; `allowedActions` is a JSON-serialized string[].
// ---------------------------------------------------------------------------

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  role: text('role').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  voice: text('voice'),
  avatar: text('avatar'),
  // string[] serialized as JSON (mirrors `skills.parameters_json`).
  allowedActionsJson: text('allowed_actions_json').notNull().default('[]'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  category: text('category'),
  createdAt: integer('created_at').notNull(), // epoch ms
  updatedAt: integer('updated_at').notNull(), // epoch ms
}, (table) => ({
  ownerIdx: index('agents_owner_id_idx').on(table.ownerId),
  categoryIdx: index('agents_category_idx').on(table.category),
}));

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
}, (table) => ({
  createdIdx: index('usage_records_created_at_idx').on(table.createdAt),
  userIdx: index('usage_records_user_id_idx').on(table.userId),
  kindIdx: index('usage_records_kind_idx').on(table.kind),
}));

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
}, (table) => ({
  actorIdx: index('audit_logs_actor_id_idx').on(table.actorId),
  actionIdx: index('audit_logs_action_idx').on(table.action),
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  createdIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

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
}, (table) => ({
  ownerIdx: index('api_keys_owner_id_idx').on(table.ownerId),
}));

// ---------------------------------------------------------------------------
// Learning events — xAPI-inspired event tracking for learning analytics.
// Captures user behavior (scene viewed, quiz answered, TTS played, etc.)
// for BI dashboards and learning path optimization.
// ---------------------------------------------------------------------------

export const learningEvents = sqliteTable('learning_events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: integer('created_at').notNull(), // epoch ms
  // Actor
  userId: text('user_id'), // null = anonymous
  // Context
  classroomId: text('classroom_id'),
  sceneId: text('scene_id'),
  sessionId: text('session_id'), // browser session identifier
  // Event verb (xAPI-inspired): 'viewed', 'completed', 'answered', 'played', 'interacted', 'exported', 'shared'
  verb: text('verb').notNull(),
  // The object of the event (what was acted upon)
  objectType: text('object_type'), // 'scene', 'quiz', 'tts', 'video', 'classroom', 'slide'
  objectId: text('object_id'),
  // Result (for quiz/assessment events)
  resultJson: text('result_json'), // JSON: { score, success, completion, duration }
  // Metadata
  durationMs: integer('duration_ms'), // time spent on this interaction
  metadataJson: text('metadata_json'), // additional context
}, (table) => ({
  userIdx: index('learning_events_user_id_idx').on(table.userId),
  classroomIdx: index('learning_events_classroom_id_idx').on(table.classroomId),
  sessionIdx: index('learning_events_session_id_idx').on(table.sessionId),
  verbIdx: index('learning_events_verb_idx').on(table.verb),
  createdIdx: index('learning_events_created_at_idx').on(table.createdAt),
}));

// ---------------------------------------------------------------------------
// Content versions — DB-backed version control for classrooms.
// Replaces the file-system snapshot approach in content-versioning.ts.
// ---------------------------------------------------------------------------

export const contentVersions = sqliteTable('content_versions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  classroomId: text('classroom_id').notNull().references(() => classrooms.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(), // incrementing version number
  // Snapshot
  stageJson: text('stage_json').notNull(),
  scenesJson: text('scenes_json').notNull(),
  // Author
  createdBy: text('created_by'), // user id
  // Metadata
  label: text('label'), // optional human-readable label
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => ({
  classroomIdx: index('content_versions_classroom_id_idx').on(table.classroomId),
  versionIdx: index('content_versions_version_idx').on(table.version),
}));

// ---------------------------------------------------------------------------
// Type exports — inferred from the schema so callers stay in sync.
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Classroom = typeof classrooms.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type LearningEvent = typeof learningEvents.$inferSelect;
export type NewLearningEvent = typeof learningEvents.$inferInsert;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type NewContentVersion = typeof contentVersions.$inferInsert;
