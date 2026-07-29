/**
 * Database backup script.
 *
 * Creates a timestamped backup of the Nova SQLite database using the
 * SQLite Online Backup API (non-blocking, consistent snapshot).
 *
 * Retention: keeps the last 30 backups, older ones are pruned.
 *
 * Usage:
 *   node scripts/backup/backup-db.js
 *
 * Environment:
 *   NOVA_DB_PATH        - Path to the database file (default: data/nova.db)
 *   NOVA_BACKUP_DIR     - Directory for backups (default: data/backups)
 *   NOVA_BACKUP_RETENTION - Number of backups to keep (default: 30)
 */
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const dbPath = process.env.NOVA_DB_PATH || path.join(process.cwd(), 'data', 'nova.db');
  const backupDir = process.env.NOVA_BACKUP_DIR || path.join(process.cwd(), 'data', 'backups');
  const retention = parseInt(process.env.NOVA_BACKUP_RETENTION || '30', 10);

  // Ensure backup directory exists
  await fs.mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `nova-${timestamp}.db`);

  console.log(`[backup] Starting backup: ${dbPath} → ${backupPath}`);

  // Open source database in read-only mode
  const sourceDb = new Database(dbPath, { readonly: true, fileMustExist: true });

  // Use SQLite's Online Backup API for a consistent, non-blocking snapshot
  sourceDb.backup(backupPath)
    .then(() => {
      console.log(`[backup] Backup completed successfully: ${backupPath}`);

      // Also create a WAL checkpoint to ensure consistency
      const backupDb = new Database(backupPath);
      backupDb.pragma('wal_checkpoint(TRUNCATE)');
      backupDb.close();
      sourceDb.close();

      // Prune old backups
      return pruneOldBackups(backupDir, retention);
    })
    .then((pruned) => {
      if (pruned.length > 0) {
        console.log(`[backup] Pruned ${pruned.length} old backup(s)`);
      }
      console.log('[backup] Done');
    })
    .catch((err) => {
      console.error('[backup] Backup failed:', err);
      sourceDb.close();
      process.exit(1);
    });
}

async function pruneOldBackups(backupDir, retention) {
  const files = await fs.readdir(backupDir);
  const backups = files
    .filter((f) => f.startsWith('nova-') && f.endsWith('.db'))
    .sort()
    .reverse(); // newest first

  const toDelete = backups.slice(retention);
  const deleted = [];
  for (const file of toDelete) {
    const filePath = path.join(backupDir, file);
    await fs.unlink(filePath);
    deleted.push(file);
  }
  return deleted;
}

main().catch((err) => {
  console.error('[backup] Fatal error:', err);
  process.exit(1);
});
