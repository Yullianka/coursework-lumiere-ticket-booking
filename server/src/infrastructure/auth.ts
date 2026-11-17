import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import type { DatabasePool } from './database.js';
const scrypt = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    derive(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key))),
  );
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await scrypt(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [type, salt, hex] = stored.split(':');
  if (type !== 'scrypt' || !salt || !hex) {
    await scrypt(password, 'invalid-account');
    return false;
  }
  const expected = Buffer.from(hex, 'hex'),
    actual = await scrypt(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function issueSession(pool: DatabasePool, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await pool.query(
    "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '7 days')",
    [tokenHash(token), userId],
  );
  return token;
}
export const readToken = (cookie?: string) =>
  cookie
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('lumiere_session='))
    ?.slice(16);
export interface Account {
  id: string;
  email: string;
  display_name: string;
  role: 'CLIENT' | 'ADMIN';
  student_verified: boolean;
}
export async function authenticate(
  pool: DatabasePool,
  cookie?: string,
): Promise<Account | undefined> {
  const token = readToken(cookie);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return (
    await pool.query<Account>(
      `SELECT u.id,u.email,u.display_name,u.role,u.student_verified FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()`,
      [tokenHash(token)],
    )
  ).rows[0];
}
