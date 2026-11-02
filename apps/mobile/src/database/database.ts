import * as SQLite from 'expo-sqlite';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
export async function getDatabase() {
  databasePromise ??= SQLite.openDatabaseAsync('psicodesk-mobile.db');
  const database = await databasePromise;
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS cache_entries (
      resource TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (resource, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cache_resource_updated ON cache_entries(resource, updated_at DESC);
    CREATE TABLE IF NOT EXISTS mutation_queue (
      id TEXT PRIMARY KEY NOT NULL,
      resource TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      payload TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mutation_due ON mutation_queue(next_attempt_at, created_at);
    CREATE TABLE IF NOT EXISTS sync_state (
      resource TEXT PRIMARY KEY NOT NULL,
      cursor TEXT,
      synced_at TEXT,
      last_error TEXT
    );
  `);
  return database;
}
