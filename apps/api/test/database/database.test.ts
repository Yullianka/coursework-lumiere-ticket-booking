import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabasePool, inTransaction } from '../../src/infrastructure/database.js';
import { migrate, seed, databaseDirectory } from '../../src/infrastructure/migrations.js';
import { createApp } from '../../src/app.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point to a dedicated empty database ending in _test.');
}
const SESSION = '40000000-0000-4000-8000-000000000001';
const HALL = '10000000-0000-4000-8000-000000000001';
const SEAT = '20000000-0000-4000-8000-000000000001';

test('PostgreSQL migrations, seed and constraints', async (t) => {
  const pool = createDatabasePool(url);
  try {
    const existing = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    assert.equal(
      existing.rowCount,
      0,
      'Use a fresh empty test database; tests never erase existing data.',
    );
    await t.test('concurrent migration calls apply the schema exactly once', async () => {
      const results = await Promise.all([migrate(pool), migrate(pool)]);
      assert.equal(results.flat().length, 2);
      assert.deepEqual(await migrate(pool), []);
      const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
      assert.equal(tables.rowCount, 14);
    });
    await t.test('seed is repeatable and builds complete seat inventory', async () => {
      await seed(pool);
      const first = await pool.query('SELECT starts_at FROM sessions ORDER BY id');
      await seed(pool);
      assert.deepEqual(
        (await pool.query('SELECT starts_at FROM sessions ORDER BY id')).rows,
        first.rows,
      );
      for (const [table, count] of [
        ['halls', 1],
        ['seats', 48],
        ['productions', 2],
        ['sessions', 2],
        ['session_prices', 6],
        ['session_seats', 96],
      ] as const) {
        assert.equal(
          Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count),
          count,
        );
      }
      assert.equal(
        (await pool.query("SELECT * FROM session_seats WHERE status <> 'AVAILABLE'")).rowCount,
        0,
      );
    });
    await t.test(
      'database rejects negative prices, duplicate seats and overlapping sessions',
      async () => {
        await assert.rejects(
          pool.query('UPDATE session_prices SET price_kopecks=-1 WHERE session_id=$1', [SESSION]),
          { code: '23514' },
        );
        await assert.rejects(
          pool.query(
            "INSERT INTO seats (hall_id,row_number,seat_number,category) VALUES ($1,1,1,'STANDARD')",
            [HALL],
          ),
          { code: '23505' },
        );
        await assert.rejects(
          pool.query(
            `INSERT INTO sessions(production_id,hall_id,starts_at,ends_at)
        SELECT production_id,hall_id,starts_at + interval '1 minute',ends_at FROM sessions WHERE id=$1`,
            [SESSION],
          ),
          { code: '23P01' },
        );
        // Adjacent half-open intervals are valid; rollback keeps the seed unchanged.
        await inTransaction(pool, async (client) => {
          const adjacent = await client.query(
            `INSERT INTO sessions(production_id,hall_id,starts_at,ends_at)
          SELECT production_id,hall_id,ends_at,ends_at + interval '30 minutes' FROM sessions WHERE id=$1 RETURNING id`,
            [SESSION],
          );
          await client.query('DELETE FROM sessions WHERE id=$1', [adjacent.rows[0].id]);
        });
      },
    );
    await t.test(
      'inventory rejects a wrong hall and a reserved seat without a booking',
      async () => {
        await assert.rejects(
          pool.query(
            "UPDATE session_seats SET status='RESERVED' WHERE session_id=$1 AND seat_id=$2",
            [SESSION, SEAT],
          ),
          { code: '23514' },
        );
        await assert.rejects(
          pool.query(
            "UPDATE session_seats SET hall_id='10000000-0000-4000-8000-000000000099' WHERE session_id=$1 AND seat_id=$2",
            [SESSION, SEAT],
          ),
          { code: '23503' },
        );
      },
    );
    await t.test('seed preserves reservations; ticket and price constraints hold', async () => {
      const user = await pool.query(
        "INSERT INTO users(email,password_hash,display_name) VALUES ('fixture@example.invalid','test-fixture-not-a-login-hash','Test fixture') RETURNING id",
      );
      const booking = await pool.query(
        "INSERT INTO bookings(user_id,session_id,expires_at) VALUES ($1,$2,now()+interval '15 minutes') RETURNING id",
        [user.rows[0].id, SESSION],
      );
      await pool.query(
        "UPDATE session_seats SET status='RESERVED',booking_id=$1 WHERE session_id=$2 AND seat_id=$3",
        [booking.rows[0].id, SESSION, SEAT],
      );
      await seed(pool);
      const inventory = await pool.query(
        'SELECT status,booking_id FROM session_seats WHERE session_id=$1 AND seat_id=$2',
        [SESSION, SEAT],
      );
      assert.equal(inventory.rows[0].status, 'RESERVED');
      assert.equal(inventory.rows[0].booking_id, booking.rows[0].id);
      await assert.rejects(
        pool.query(
          'INSERT INTO booking_items(booking_id,session_id,seat_id,base_price_kopecks,discount_kopecks,final_price_kopecks) VALUES ($1,$2,$3,18000,1000,18000)',
          [booking.rows[0].id, SESSION, SEAT],
        ),
        { code: '23514' },
      );
      const item = await pool.query(
        'INSERT INTO booking_items(booking_id,session_id,seat_id,base_price_kopecks,final_price_kopecks) VALUES ($1,$2,$3,18000,18000) RETURNING id',
        [booking.rows[0].id, SESSION, SEAT],
      );
      await inTransaction(pool, async (client) => {
        await client.query("UPDATE bookings SET status='PAID' WHERE id=$1", [booking.rows[0].id]);
        await client.query("UPDATE session_seats SET status='SOLD' WHERE booking_id=$1", [
          booking.rows[0].id,
        ]);
        await client.query('INSERT INTO tickets(booking_item_id) VALUES ($1)', [item.rows[0].id]);
      });
      await assert.rejects(
        pool.query('INSERT INTO tickets(booking_item_id) VALUES ($1)', [item.rows[0].id]),
        { code: '23505' },
      );
    });
    await t.test('failed transactions leave no partial writes', async () => {
      await assert.rejects(
        inTransaction(pool, async (client) => {
          await client.query("INSERT INTO halls(name) VALUES ('Rollback probe')");
          throw new Error('Expected failure');
        }),
        /Expected failure/,
      );
      assert.equal(
        (await pool.query("SELECT * FROM halls WHERE name='Rollback probe'")).rowCount,
        0,
      );
    });
    await t.test('failed migrations roll back DDL and are not marked applied', async () => {
      const dir = pathToFileURL((await mkdtemp(join(tmpdir(), 'lumiere-migration-'))) + '/');
      await writeFile(
        new URL('001_initial.sql', dir),
        await readFile(new URL('001_initial.sql', databaseDirectory)),
      );
      await writeFile(
        new URL('002_auth_and_audit.sql', dir),
        await readFile(new URL('002_auth_and_audit.sql', databaseDirectory)),
      );
      await writeFile(
        new URL('003_failure.sql', dir),
        'CREATE TABLE failure_probe(id int); SELECT * FROM nonexistent_migration_table;',
      );
      await assert.rejects(migrate(pool, dir));
      assert.equal(
        (await pool.query("SELECT to_regclass('failure_probe') AS name")).rows[0].name,
        null,
      );
      assert.equal((await pool.query('SELECT * FROM schema_migrations')).rowCount, 2);
      await writeFile(new URL('001_initial.sql', dir), '-- changed');
      await assert.rejects(migrate(pool, dir), /missing or changed/);
    });
    await t.test('readiness checks the real database connection', async () => {
      const app = createApp(async () => {
        await pool.query('SELECT 1');
      });
      const server = app.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', resolve));
      try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/ready`);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).database, 'connected');
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  } finally {
    await pool.end();
  }
});
