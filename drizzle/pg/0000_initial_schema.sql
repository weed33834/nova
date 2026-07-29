-- Nova PostgreSQL initial schema migration
-- Generated as part of the SQLite → PostgreSQL migration path (P2-1).
--
-- This file creates all tables with PostgreSQL-specific types and defaults.
-- Run with: pnpm db:pg:migrate
-- Or directly: psql $DATABASE_URL -f drizzle/pg/0000_initial_schema.sql

-- ── Auth tables (NextAuth.js compatible) ──────────────────────────────────

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
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

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
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS accounts_provider_idx ON accounts(provider);

CREATE TABLE IF NOT EXISTS sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ── Application tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS classrooms (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  stage_json TEXT NOT NULL,
  scenes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS classrooms_owner_id_idx ON classrooms(owner_id);
CREATE INDEX IF NOT EXISTS classrooms_created_at_idx ON classrooms(created_at);
CREATE INDEX IF NOT EXISTS classrooms_deleted_idx ON classrooms(deleted);

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
CREATE INDEX IF NOT EXISTS skills_owner_id_idx ON skills(owner_id);
CREATE INDEX IF NOT EXISTS skills_category_idx ON skills(category);

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
CREATE INDEX IF NOT EXISTS usage_records_created_at_idx ON usage_records(created_at);
CREATE INDEX IF NOT EXISTS usage_records_user_id_idx ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS usage_records_kind_idx ON usage_records(kind);

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
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

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
CREATE INDEX IF NOT EXISTS api_keys_owner_id_idx ON api_keys(owner_id);

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
CREATE INDEX IF NOT EXISTS learning_events_user_id_idx ON learning_events(user_id);
CREATE INDEX IF NOT EXISTS learning_events_classroom_id_idx ON learning_events(classroom_id);
CREATE INDEX IF NOT EXISTS learning_events_session_id_idx ON learning_events(session_id);
CREATE INDEX IF NOT EXISTS learning_events_verb_idx ON learning_events(verb);
CREATE INDEX IF NOT EXISTS learning_events_created_at_idx ON learning_events(created_at);

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
CREATE INDEX IF NOT EXISTS content_versions_classroom_id_idx ON content_versions(classroom_id);
CREATE INDEX IF NOT EXISTS content_versions_version_idx ON content_versions(version);

-- ── Drizzle migration metadata ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at NUMERIC
);
