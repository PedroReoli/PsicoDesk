ALTER TABLE sync_config ADD COLUMN key_id TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  batch_id TEXT NOT NULL UNIQUE,
  envelope_json TEXT NOT NULL,
  queue_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
