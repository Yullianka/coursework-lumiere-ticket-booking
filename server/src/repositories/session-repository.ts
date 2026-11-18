import { and, eq, gt } from 'drizzle-orm';
import { createHash, scrypt as derive, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Account } from '../types/services.js';
import type { DatabasePool } from '../config/database.js';
import { orm } from '../config/orm.js';
import { auth_sessions, users } from '../models/schema.js';
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
  await orm(pool)
    .insert(auth_sessions)
    .values({
      token_hash: tokenHash(token),
      user_id: userId,
      expires_at: new Date(Date.now() + 7 * 24 * 3600000),
    });
  return token;
}
export const readToken = (cookie?: string) =>
  cookie
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('lumiere_session='))
    ?.slice(16);
export type { Account } from '../types/services.js';

export async function authenticate(
  pool: DatabasePool,
  cookie?: string,
): Promise<Account | undefined> {
  const token = readToken(cookie);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return (
    await orm(pool)
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        role: users.role,
        student_verified: users.student_verified,
      })
      .from(users)
      .innerJoin(auth_sessions, eq(auth_sessions.user_id, users.id))
      .where(
        and(
          eq(auth_sessions.token_hash, tokenHash(token)),
          gt(auth_sessions.expires_at, new Date()),
        ),
      )
  )[0];
}
