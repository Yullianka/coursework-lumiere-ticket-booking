import { and, eq, lte, asc } from 'drizzle-orm';
import { orm } from '../config/orm.js';
import { bookings, auth_sessions } from '../models/schema.js';
import type { DatabasePool } from '../config/database.js';
export class ExpirationRepository {
  constructor(private readonly pool: DatabasePool) {}
  pending() {
    return orm(this.pool)
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.status, 'PENDING'), lte(bookings.expires_at, new Date())))
      .orderBy(asc(bookings.expires_at))
      .limit(200);
  }
  async clearSessions() {
    await orm(this.pool).delete(auth_sessions).where(lte(auth_sessions.expires_at, new Date()));
  }
}
