/**
 * Database layer barrel.
 *
 * Re-exports the Drizzle client, schema, and type aliases so the rest of the
 * app imports from a single path: `@/lib/db`.
 */
export { getDb, closeDb, resetDbForTests, resolveDbPath } from './client';
export * from './schema';
export { recordAuditLog, type AuditLogInput } from './audit';
