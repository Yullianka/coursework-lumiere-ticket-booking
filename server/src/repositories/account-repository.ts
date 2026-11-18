import { eq } from 'drizzle-orm';
import {
  hashPassword,
  issueSession,
  tokenHash,
  verifyPassword,
} from '../repositories/session-repository.js';
import type { DatabasePool } from '../config/database.js';
import { orm } from '../config/orm.js';
import { auth_sessions, users } from '../models/schema.js';
export class AccountRepository {
  constructor(private readonly pool: DatabasePool) {}
  async create(input: { email: string; password: string; displayName: string }) {
    const [row] = await orm(this.pool)
      .insert(users)
      .values({
        email: input.email,
        password_hash: await hashPassword(input.password),
        display_name: input.displayName,
      })
      .returning({ id: users.id });
    return row;
  }
  async verify(email: string, password: string) {
    const [row] = await orm(this.pool)
      .select({ id: users.id, password_hash: users.password_hash })
      .from(users)
      .where(eq(users.email, email));
    return (await verifyPassword(password, row?.password_hash ?? '')) ? row?.id : undefined;
  }
  issue(userId: string) {
    return issueSession(this.pool, userId);
  }
  async revoke(token: string) {
    await orm(this.pool)
      .delete(auth_sessions)
      .where(eq(auth_sessions.token_hash, tokenHash(token)));
  }
}
