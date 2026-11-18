import { AdminService } from './services/admin-service.js';
import { AuthService } from './services/auth-service.js';
import { BookingWorkflow } from './services/booking-workflow.js';
import { CatalogService } from './services/catalog-service.js';
import type { Services } from './types/services.js';
import { AccountRepository } from './repositories/account-repository.js';
import { PostgresAdminRepository } from './repositories/admin-repository.js';
import { authenticate } from './repositories/session-repository.js';
import { BookingQueryRepository } from './repositories/booking-query-repository.js';
import { bookingServices } from './config/booking-services.js';
import { expireBookings } from './services/booking-expiration.js';
import { PostgresCatalogRepository } from './repositories/catalog-repository.js';
import type { DatabasePool } from './config/database.js';
/** The only assembly point for HTTP use cases and PostgreSQL adapters. */
export function createServices(pool: DatabasePool): Services {
  const expire = () => expireBookings(pool);
  return {
    auth: new AuthService(new AccountRepository(pool)),
    admin: new AdminService(new PostgresAdminRepository(pool), expire),
    catalog: new CatalogService(new PostgresCatalogRepository(pool), expire),
    bookings: new BookingWorkflow(
      new BookingQueryRepository(pool),
      (promo) => bookingServices(pool, promo),
      expire,
    ),
    authenticate: (cookie) => authenticate(pool, cookie),
  };
}
