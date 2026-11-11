import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  local = join(root, '.local'),
  data = join(local, 'postgres');
const env = {
  ...process.env,
  PATH: `${process.env.PG_BIN ?? '/opt/homebrew/bin'}:${process.env.PATH}`,
};
function run(command, args, options = {}) {
  const r = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', ...options });
  if (r.error) throw new Error(`${command} is unavailable. Install PostgreSQL 14+ or set PG_BIN.`);
  if (r.status !== 0) throw new Error(`${command} failed (${r.status}).`);
}
mkdirSync(local, { recursive: true, mode: 0o700 });
if (process.argv[2] === 'stop') {
  run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  process.exit(0);
}
if (!existsSync(join(data, 'PG_VERSION')))
  run('initdb', [
    '-D',
    data,
    '-U',
    'lumiere_local',
    '--auth-local=trust',
    '--auth-host=scram-sha-256',
    '--encoding=UTF8',
    '--locale=C',
  ]);
const status = spawnSync('pg_ctl', ['-D', data, 'status'], { env, stdio: 'ignore' });
if (status.status !== 0)
  run('pg_ctl', [
    '-D',
    data,
    '-l',
    join(local, 'postgres.log'),
    '-o',
    `-k '${local.replaceAll("'", "'\\''")}' -p 55440 -h ''`,
    '-w',
    'start',
  ]);
const base = `postgresql://lumiere_local@localhost:55440/`,
  suffix = `?host=${encodeURIComponent(local)}`;
const admin = new pg.Client({ connectionString: base + 'postgres' + suffix });
await admin.connect();
try {
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lumiere'")).rowCount)
    await admin.query('CREATE DATABASE lumiere');
} finally {
  await admin.end();
}
const url = base + 'lumiere' + suffix,
  envFile = join(root, 'apps/api/.env');
if (existsSync(envFile) && !readFileSync(envFile, 'utf8').includes(url)) {
  console.log(
    'Local database started. Existing apps/api/.env preserved. Configure DATABASE_URL manually to use this database.',
  );
  process.exit(0);
}
if (!existsSync(envFile))
  writeFileSync(envFile, `PORT=3001\nDATABASE_URL=${url}\n`, { mode: 0o600 });
run('npm', ['run', 'db:migrate', '-w', 'apps/api']);
run('npm', ['run', 'db:seed', '-w', 'apps/api']);
const db = new pg.Client({ connectionString: url });
await db.connect();
let hasAdmin;
try {
  hasAdmin = (await db.query("SELECT 1 FROM users WHERE role='ADMIN' LIMIT 1")).rowCount;
} finally {
  await db.end();
}
if (!hasAdmin) {
  const password = randomBytes(15).toString('base64url'),
    email = 'admin@lumiere.local';
  run('npm', ['run', 'admin:create', '-w', 'apps/api'], {
    env: { ...env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: 'Lumière Admin' },
  });
  writeFileSync(
    join(local, 'admin-login.txt'),
    `Local demo administrator\nEmail: ${email}\nPassword: ${password}\n`,
    { mode: 0o600 },
  );
}
console.log(
  'Database ready. Admin credentials: .local/admin-login.txt (not tracked). Run npm run dev.',
);
