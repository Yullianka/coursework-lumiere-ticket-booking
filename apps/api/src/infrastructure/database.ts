import pg from 'pg';
export const { Pool } = pg;
export type DatabasePool = pg.Pool;
export type DatabaseClient = pg.PoolClient;

export function createDatabasePool(connectionString: string): DatabasePool {
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000 });
  // Idle connection errors must not become unhandled EventEmitter errors.
  pool.on('error', () => console.error('An idle PostgreSQL connection failed.'));
  return pool;
}

export async function inTransaction<T>(pool: DatabasePool, work: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    failed = true;
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original error. */ }
    throw error;
  } finally { client.release(failed); }
}
