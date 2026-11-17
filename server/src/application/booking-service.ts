import { Booking } from '../domain/booking.js';
import { PricingService, type DiscountContext } from '../domain/pricing.js';
import {
  BookingEventPublisher,
  type BookingEventType,
  type ObserverFailure,
} from './booking-events.js';

/** Implementations must atomically check inventory and persist the booking.
 * A transition must compare the previous status/version and reject stale writes.
 * Database failure must roll back the booking, tickets and inventory together.
 */
export interface BookingRepository {
  save(next: Booking, previous?: Booking): Promise<void>;
}
export interface BookingResult {
  readonly booking: Booking;
  readonly observerFailures: readonly ObserverFailure[];
}

export class BookingService {
  constructor(
    private readonly repository: BookingRepository,
    private readonly pricing = new PricingService(),
    private readonly events = new BookingEventPublisher(),
    private readonly clock: () => number = Date.now,
  ) {}

  /** Inputs must come from trusted catalog/account data, not directly from HTTP JSON. */
  async reserve(input: {
    userId: string;
    sessionId: string;
    startsAt: number;
    seats: readonly { seatId: string; basePriceKopecks: number }[];
    discount: Omit<DiscountContext, 'now'>;
  }): Promise<BookingResult> {
    const now = this.clock();
    const booking = Booking.create({
      ...input,
      now,
      items: input.seats.map((seat) => ({
        seatId: seat.seatId,
        ...this.pricing.calculate(seat.basePriceKopecks, { ...input.discount, now }),
      })),
    });
    await this.repository.save(booking);
    return this.notify(booking, 'BOOKING_CREATED', now);
  }

  pay(userId: string, booking: Booking): Promise<BookingResult> {
    return this.change('pay', booking, userId);
  }
  cancel(userId: string, booking: Booking): Promise<BookingResult> {
    return this.change('cancel', booking, userId);
  }
  expire(booking: Booking): Promise<BookingResult> {
    return this.change('expire', booking);
  }

  private async change(
    action: 'pay' | 'cancel' | 'expire',
    previous: Booking,
    userId?: string,
  ): Promise<BookingResult> {
    if (action !== 'expire' && userId !== previous.snapshot.userId)
      throw new Error('Booking does not belong to this customer.');
    const now = this.clock();
    const booking = previous.transition(action, now);
    if (booking === previous) return { booking, observerFailures: [] };
    await this.repository.save(booking, previous);
    const types = {
      pay: 'BOOKING_PAID',
      cancel: 'BOOKING_CANCELLED',
      expire: 'BOOKING_EXPIRED',
    } as const;
    return this.notify(booking, types[action], now);
  }

  private async notify(
    booking: Booking,
    type: BookingEventType,
    now: number,
  ): Promise<BookingResult> {
    const observerFailures = await this.events.publish(
      Object.freeze({ type, occurredAt: now, booking: booking.snapshot }),
    );
    return { booking, observerFailures };
  }
}
