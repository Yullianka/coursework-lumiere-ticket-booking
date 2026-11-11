import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
if (existsSync('apps/api/.env')) process.loadEnvFile('apps/api/.env');
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL first.');
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
await admin.connect();
try {
  for (const suite of ['db', 'http']) {
    const name = `lumiere_${suite}_${randomBytes(6).toString('hex')}_test`;
    await admin.query(`CREATE DATABASE "${name}"`);
    try {
      const url = new URL(process.env.DATABASE_URL);
      url.pathname = '/' + name;
      const result = spawnSync('npm', ['run', `test:${suite}`, '-w', 'apps/api'], {
        env: { ...process.env, TEST_DATABASE_URL: url.toString() },
        stdio: 'inherit',
      });
      if (result.status !== 0) throw new Error(`${suite} integration suite failed.`);
    } finally {
      // Only remove the disposable database created by this invocation.
      await admin.query(`DROP DATABASE "${name}"`);
    }
  }
} finally {
  await admin.end();
}
