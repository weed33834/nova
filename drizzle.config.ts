import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * - `generate`: create SQL migration files from schema changes
 *   (`pnpm drizzle-kit generate`)
 * - `migrate`: apply migrations (handled at runtime by `lib/db/client.ts`)
 * - `studio`: open the Drizzle Studio GUI (`pnpm drizzle-kit studio`)
 *
 * The database path defaults to `data/nova.db`, overridable via `NOVA_DB_PATH`.
 */
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.NOVA_DB_PATH || './data/nova.db',
  },
  verbose: true,
  strict: true,
});
