import { bookingServices } from '../config/booking-services.js';
import { ExpirationRepository } from '../repositories/expiration-repository.js';
import type { DatabasePool } from '../config/database.js';
import { HttpError } from '../middleware/errors.js';
export async function expireBookings(pool: DatabasePool): Promise<void> {
  const { repository, service } = bookingServices(pool);
  const maintenance = new ExpirationRepository(pool);
  const rows = await maintenance.pending();
  for (const row of rows)
    try {
      const b = await repository.load(row.id);
      if (b.snapshot.status === 'PENDING') {
        const result = await service.expire(b);
        if (result.observerFailures.length) console.error('Expiration audit failed.');
      }
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 409)) throw e;
    }
  await maintenance.clearSessions();
}
