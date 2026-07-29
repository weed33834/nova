#!/usr/bin/env node
/**
 * SQLite → PostgreSQL data migration script.
 *
 * Reads all data from the local SQLite database and inserts it into a
 * PostgreSQL database specified by DATABASE_URL.
 *
 * Usage:
 *   1. Install postgres: pnpm add postgres
 *   2. Set DATABASE_URL to your PostgreSQL connection string
 *   3. Run: node scripts/migrate-sqlite-to-postgres.mjs
 *
 * This script is idempotent for INSERTs — it uses ON CONFLICT DO NOTHING
 * so re-running it after a partial failure won't create duplicates.
 *
 * Tables migrated:
 *   users, accounts, sessions, verification_tokens, classrooms, skills,
 *   usage_records, audit_logs, api_keys, learning_events, content_versions
 */
import Database from 'better-sqlite3';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = process.env.NOVA_DB_PATH || path.join(__dirname, '..', 'data', 'nova.db');
const pgUrl = process.env.DATABASE_URL;

if (!pgUrl) {
  console.error('ERROR: DATABASE_URL is not set.');
  console.error('Set it to your PostgreSQL connection string, e.g.:');
  console.error('  DATABASE_URL=postgresql://user:pass@host:5432/nova node scripts/migrate-sqlite-to-postgres.mjs');
  process.exit(1);
}

console.log(`Source: SQLite at ${sqlitePath}`);
console.log(`Target: PostgreSQL at ${pgUrl.replace(/\/\/[^@]+@/, '//***@')}`);

const sqlite = new Database(sqlitePath, { readonly: true });
sqlite.pragma('journal_mode = WAL');
const sql = postgres(pgUrl, { max: 5, ssl: pgUrl.includes('localhost') ? false : { rejectUnauthorized: true } });

const TABLES = [
  'users',
  'accounts',
  'sessions',
  'verification_tokens',
  'classrooms',
  'skills',
  'usage_records',
  'audit_logs',
  'api_keys',
  'learning_events',
  'content_versions',
];

async function migrateTable(tableName) {
  const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 rows (skipped)`);
    return 0;
  }

  // Get column names from the first row
  const columns = Object.keys(rows[0]);
  const colList = columns.join(', ');
  const paramList = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updateList = columns
    .filter((c) => c !== 'id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');

  let migrated = 0;
  for (const row of rows) {
    const values = columns.map((c) => {
      const v = row[c];
      // SQLite stores booleans as 0/1, PostgreSQL uses true/false
      if (typeof v === 'number' && (v === 0 || v === 1)) {
        // Check if this column is a boolean column
        if (['disabled', 'deleted', 'enabled'].includes(c)) {
          return v === 1;
        }
      }
      return v;
    });

    try {
      await sql.unsafe(
        `INSERT INTO ${tableName} (${colList}) VALUES (${paramList})
         ON CONFLICT DO NOTHING`,
        values,
      );
      migrated++;
    } catch (err) {
      console.error(`  Error migrating row in ${tableName}:`, err.message);
    }
  }

  console.log(`  ${tableName}: ${migrated}/${rows.length} rows migrated`);
  return migrated;
}

async function main() {
  console.log('\nStarting migration...\n');

  let totalMigrated = 0;
  for (const table of TABLES) {
    try {
      totalMigrated += await migrateTable(table);
    } catch (err) {
      console.error(`  ${table}: FAILED - ${err.message}`);
    }
  }

  console.log(`\nMigration complete: ${totalMigrated} total rows migrated.`);

  // Verify counts
  console.log('\nVerifying row counts:');
  for (const table of TABLES) {
    const sqliteCount = sqlite.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
    const pgRows = await sql`SELECT COUNT(*) as count FROM ${sql(table)}`;
    const pgCount = pgRows[0]?.count ?? 0;
    const status = sqliteCount === pgCount ? 'OK' : 'MISMATCH';
    console.log(`  ${table}: SQLite=${sqliteCount}, PostgreSQL=${pgCount} [${status}]`);
  }

  sqlite.close();
  await sql.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
