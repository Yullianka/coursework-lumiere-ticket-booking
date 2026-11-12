import { createDatabasePool } from '../infrastructure/database.js';
import { migrate, seed } from '../infrastructure/migrations.js';

const command = process.argv[2];
if (!['migrate', 'seed', 'check'].includes(command ?? '')) throw new Error('Usage: database.ts migrate|seed|check');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const pool = createDatabasePool(process.env.DATABASE_URL);
try {
  if (command === 'migrate') {
    const applied = await migrate(pool);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
  } else if (command === 'seed') {
    await seed(pool);
    console.log('Demo catalog is ready. Existing records were preserved.');
  } else {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connection is ready.');
  }
} catch (error) {
  // Do not log the connection string or credentials.
  console.error(error instanceof Error ? error.message : 'Database operation failed.');
  process.exitCode = 1;
} finally { await pool.end(); }
