import * as SQLite from 'expo-sqlite';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
async function initializeDatabase() {
  const database = await SQLite.openDatabaseAsync('psicodesk-mobile.db');
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
      last_error TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE INDEX IF NOT EXISTS idx_mutation_due ON mutation_queue(next_attempt_at, created_at);
    CREATE TABLE IF NOT EXISTS sync_state (
      resource TEXT PRIMARY KEY NOT NULL,
      cursor TEXT,
      synced_at TEXT,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS batch_outbox (batch_id TEXT PRIMARY KEY NOT NULL, envelope TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT);
    CREATE INDEX IF NOT EXISTS idx_batch_outbox_due ON batch_outbox(status,next_attempt_at);
    CREATE TABLE IF NOT EXISTS batch_inbox (batch_id TEXT PRIMARY KEY NOT NULL, envelope TEXT NOT NULL, imported_payload TEXT NOT NULL, received_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS batch_state (id INTEGER PRIMARY KEY CHECK(id=1), cursor TEXT NOT NULL DEFAULT '0', synced_at TEXT);
    CREATE TABLE IF NOT EXISTS mobile_projection (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL, encrypted_payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(entity_type,entity_id));
    CREATE INDEX IF NOT EXISTS idx_mobile_projection_type ON mobile_projection(entity_type,updated_at DESC);
    CREATE TABLE IF NOT EXISTS mobile_projection_conflicts (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, remote_revision INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(mutation_queue)');
  if (!columns.some((column) => column.name === 'status'))
    await database.execAsync(
      "ALTER TABLE mutation_queue ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
    );
  return database;
}
export async function getDatabase() {
  databasePromise ??= initializeDatabase().catch((cause) => {
    databasePromise = null;
    throw cause;
  });
  return databasePromise;
}
