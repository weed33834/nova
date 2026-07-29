import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for PostgreSQL.
 *
 * Use this config when generating or running PostgreSQL migrations:
 *   pnpm db:pg:generate  — generate SQL from pg-schema.ts
 *   pnpm db:pg:migrate    — apply migrations to the database
 *   pnpm db:pg:studio     — open Drizzle Studio for PostgreSQL
 *
 * Requires DATABASE_URL to be set to a PostgreSQL connection string.
 */
export default defineConfig({
  schema: './lib/db/pg-schema.ts',
  out: './drizzle/pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/nova',
  },
  verbose: true,
  strict: true,
});
