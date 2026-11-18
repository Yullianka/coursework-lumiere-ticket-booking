import type { Booking } from '../models/booking.js';
import type { DiscountContext } from '../patterns/pricing.js';
import type { BookingService } from './booking-service.js';
import { HttpError } from '../middleware/errors.js';
export interface BookingQueries {
  session(id: string): Promise<{ starts_at: Date } | undefined>;
  seats(
    sessionId: string,
    seatIds: string[],
  ): Promise<{ seatId: string; basePriceKopecks: number }[]>;
  discount(userId: string, promo?: string): Promise<DiscountContext>;
  mine(
    userId: string,
  ): ReturnType<
    import('../repositories/booking-query-repository.js').BookingQueryRepository['mine']
  >;
}
export interface BookingOperations {
  service: BookingService;
  repository: { load(id: string): Promise<Booking> };
}
export class BookingWorkflow {
  constructor(
    private readonly queries: BookingQueries,
    private readonly operations: (promo?: string) => BookingOperations,
    private readonly expire: () => Promise<void>,
  ) {}
  async reserve(
    userId: string,
    input: { sessionId: string; seatIds: string[]; promoCode?: string },
  ) {
    if (new Set(input.seatIds).size !== input.seatIds.length)
      throw new HttpError(400, 'Місця не можуть повторюватися.');
    await this.expire();
    const session = await this.queries.session(input.sessionId);
    if (!session) throw new HttpError(404, 'Сеанс недоступний.');
    const seats = await this.queries.seats(input.sessionId, input.seatIds);
    if (seats.length !== input.seatIds.length) throw new HttpError(400, 'Некоректні місця.');
    const { service } = this.operations(input.promoCode || undefined);
    const result = await service.reserve({
      userId,
      sessionId: input.sessionId,
      startsAt: session.starts_at.getTime(),
      seats,
      discount: await this.queries.discount(userId, input.promoCode || undefined),
    });
    if (result.observerFailures.length) console.error('Booking audit failed.');
    return result.booking.snapshot;
  }
  async mine(userId: string) {
    await this.expire();
    return this.queries.mine(userId);
  }
  async change(userId: string, id: string, action: 'pay' | 'cancel') {
    await this.expire();
    const { service, repository } = this.operations();
    const booking = await repository.load(id);
    if (booking.snapshot.userId !== userId)
      throw new HttpError(403, 'Це бронювання належить іншому користувачу.');
    const result = await service[action](userId, booking);
    if (result.observerFailures.length) console.error('Booking audit failed.');
    return result.booking.snapshot;
  }
}
