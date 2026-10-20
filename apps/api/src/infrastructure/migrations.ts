import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { inTransaction, type DatabasePool } from './database.js';

export const databaseDirectory = new URL('../../../../database/', import.meta.url);
const LOCK_ID = 1171101;

export async function migrate(
  pool: DatabasePool,
  directory = databaseDirectory,
): Promise<string[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (!names.length) throw new Error('No migrations found.');
  const migrations = await Promise.all(
    names.map(async (name) => {
      const sql = await readFile(new URL(name, directory), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
  return inTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations ORDER BY name',
    );
    for (const row of applied.rows) {
      const migration = migrations.find((item) => item.name === row.name);
      if (!migration || migration.checksum !== row.checksum)
        throw new Error(`Applied migration is missing or changed: ${row.name}`);
    }
    const completed: string[] = [];
    const last = applied.rows.at(-1)?.name;
    for (const migration of migrations) {
      if (applied.rows.some((row) => row.name === migration.name)) continue;
      if (last && migration.name < last)
        throw new Error(`Out-of-order migration: ${migration.name}`);
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        migration.name,
        migration.checksum,
      ]);
      completed.push(migration.name);
    }
    return completed;
  });
}

/** Explicit demo-data command; never runs automatically at API startup. */
export async function seed(pool: DatabasePool): Promise<void> {
  const sql = await readFile(new URL('seed.sql', databaseDirectory), 'utf8');
  await inTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await client.query(sql);
  });
}
