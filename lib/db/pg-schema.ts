/**
 * Drizzle ORM schema for Nova's PostgreSQL database.
 *
 * This is the PostgreSQL equivalent of `lib/db/schema.ts` (SQLite). Both
 * schemas define the same logical tables with the same column semantics,
 * but use PostgreSQL-specific types:
 *  - `text` → `text` (same name, different module)
 *  - `integer({ mode: 'boolean' })` → `boolean`
 *  - `sql\`(CURRENT_TIMESTAMP)\`` → `sql\`now()\``
 *  - `primaryKey` composite keys work the same way
 *
 * The migration path from SQLite to PostgreSQL is:
 *  1. Set `DATABASE_URL=postgresql://user:pass@host:5432/nova`
 *  2. Run `pnpm db:pg:migrate` to create tables
 *  3. Export data from SQLite (`sqlite3 data/nova.db .dump` → transform)
 *  4. Import into PostgreSQL
 *  5. Restart the app — it will automatically use PostgreSQL
 *
 * See `docs/database-migration.md` for the full guide.
 */
import { pgTable, text, integer, boolean, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Auth — NextAuth.js compatible tables
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: text('email_verified'),
  image: text('image'),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  disabled: boolean('disabled').notNull().default(false),
  createdAt: text('created_at')
    .notNull()
    .default(sql`now()`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  roleIdx: index('users_role_idx').on(table.role),
}));

export const accounts = pgTable('accounts', {
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
}));

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: text('expires').notNull(),
}, (table) => ({
  userIdx: index('sessions_user_id_idx').on(table.userId),
}));

export const verificationTokens = pgTable(
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
// Classrooms
// ---------------------------------------------------------------------------

export const classrooms = pgTable('classrooms', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  stageJson: text('stage_json').notNull(),
  scenesJson: text('scenes_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`now()`),
  deleted: boolean('deleted').notNull().default(false),
}, (table) => ({
  ownerIdx: index('classrooms_owner_id_idx').on(table.ownerId),
  createdIdx: index('classrooms_created_at_idx').on(table.createdAt),
  deletedIdx: index('classrooms_deleted_idx').on(table.deleted),
}));

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  category: text('category').notNull(),
  summary: text('summary').notNull(),
  description: text('description').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  parametersJson: text('parameters_json').notNull().default('[]'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  ownerIdx: index('skills_owner_id_idx').on(table.ownerId),
  categoryIdx: index('skills_category_idx').on(table.category),
}));

// ---------------------------------------------------------------------------
// Usage records
// ---------------------------------------------------------------------------

export const usageRecords = pgTable('usage_records', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: integer('created_at').notNull(),
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
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  createdIdx: index('usage_records_created_at_idx').on(table.createdAt),
  userIdx: index('usage_records_user_id_idx').on(table.userId),
  kindIdx: index('usage_records_kind_idx').on(table.kind),
}));

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export const auditLogs = pgTable('audit_logs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: text('created_at')
    .notNull()
    .default(sql`now()`),
  actorId: text('actor_id'),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  detailsJson: text('details_json'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
}, (table) => ({
  actorIdx: index('audit_logs_actor_id_idx').on(table.actorId),
  actionIdx: index('audit_logs_action_idx').on(table.action),
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  createdIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const apiKeys = pgTable('api_keys', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  scopes: text('scopes').notNull().default('[]'),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`now()`),
  revokedAt: text('revoked_at'),
}, (table) => ({
  ownerIdx: index('api_keys_owner_id_idx').on(table.ownerId),
}));

// ---------------------------------------------------------------------------
// Learning events
// ---------------------------------------------------------------------------

export const learningEvents = pgTable('learning_events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: integer('created_at').notNull(),
  userId: text('user_id'),
  classroomId: text('classroom_id'),
  sceneId: text('scene_id'),
  sessionId: text('session_id'),
  verb: text('verb').notNull(),
  objectType: text('object_type'),
  objectId: text('object_id'),
  resultJson: text('result_json'),
  durationMs: integer('duration_ms'),
  metadataJson: text('metadata_json'),
}, (table) => ({
  userIdx: index('learning_events_user_id_idx').on(table.userId),
  classroomIdx: index('learning_events_classroom_id_idx').on(table.classroomId),
  sessionIdx: index('learning_events_session_id_idx').on(table.sessionId),
  verbIdx: index('learning_events_verb_idx').on(table.verb),
  createdIdx: index('learning_events_created_at_idx').on(table.createdAt),
}));

// ---------------------------------------------------------------------------
// Content versions
// ---------------------------------------------------------------------------

export const contentVersions = pgTable('content_versions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  classroomId: text('classroom_id').notNull(),
  version: integer('version').notNull(),
  stageJson: text('stage_json').notNull(),
  scenesJson: text('scenes_json').notNull(),
  createdBy: text('created_by'),
  label: text('label'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  classroomIdx: index('content_versions_classroom_id_idx').on(table.classroomId),
  versionIdx: index('content_versions_version_idx').on(table.version),
}));

// ---------------------------------------------------------------------------
// Type exports — inferred from the schema so callers stay in sync.
// These match the SQLite schema types exactly.
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
export type LearningEvent = typeof learningEvents.$inferSelect;
export type NewLearningEvent = typeof learningEvents.$inferInsert;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type NewContentVersion = typeof contentVersions.$inferInsert;
