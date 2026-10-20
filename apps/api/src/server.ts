import { createApp } from './app.js';
import { createDatabasePool } from './infrastructure/database.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const pool = process.env.DATABASE_URL ? createDatabasePool(process.env.DATABASE_URL) : undefined;
const app = createApp(
  pool
    ? async () => {
        await pool.query('SELECT 1');
      }
    : undefined,
);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Lumière API: http://localhost:${port}/api/health`);
});
server.on('error', (error) => {
  console.error('Failed to start API:', error.message);
  process.exitCode = 1;
  void pool?.end();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () =>
    server.close(async () => {
      await pool?.end();
    }),
  );
}
