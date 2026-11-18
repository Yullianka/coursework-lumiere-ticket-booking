import { BookingService } from '../services/booking-service.js';
import { PricingService } from '../patterns/pricing.js';
import { BookingEventPublisher } from '../patterns/booking-events.js';
import {
  PostgresBookingRepository,
  DatabaseAuditObserver,
} from '../repositories/booking-repository.js';
import type { DatabasePool } from './database.js';
export function bookingServices(pool: DatabasePool, promoCode?: string) {
  const repository = new PostgresBookingRepository(pool, promoCode),
    events = new BookingEventPublisher();
  events.subscribe(new DatabaseAuditObserver(pool));
  return { repository, service: new BookingService(repository, new PricingService(), events) };
}
