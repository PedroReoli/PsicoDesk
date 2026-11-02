import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { PostgresDatabase } from './repositories/postgres/database.js';

const config = loadConfig();
const database = new PostgresDatabase(config.DATABASE_URL);
const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

try {
  await database.query('SELECT pg_advisory_lock($1)', [8_614_207]);
  await database.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const version of (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = await readFile(resolve(migrationsDirectory, version), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await database.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE version = $1',
      [version],
    );
    if (existing.rows[0]?.checksum && existing.rows[0].checksum !== checksum)
      throw new Error(`Migration checksum mismatch: ${version}`);
    if (existing.rows.length > 0) continue;

    await database.transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
        version,
        checksum,
      ]);
    });
    process.stdout.write(`Applied ${version}\n`);
  }
} finally {
  await database.query('SELECT pg_advisory_unlock($1)', [8_614_207]).catch(() => undefined);
  await database.close();
}
