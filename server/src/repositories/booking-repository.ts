import { eq, and, lte, gt, asc, inArray, sql } from 'drizzle-orm';
import { type BookingObserver } from '../patterns/booking-events.js';
import { type BookingRepository } from '../services/booking-service.js';
import { HttpError } from '../middleware/errors.js';
import type { BookingStatus } from '../patterns/booking-state.js';
import { Booking, type BookingItem } from '../models/booking.js';
import { PricingService, type DiscountContext } from '../patterns/pricing.js';
import { inTransaction, type DatabaseClient, type DatabasePool } from '../config/database.js';
import { orm } from '../config/orm.js';
import {
  discounts,
  session_seats,
  session_prices,
  sessions,
  productions,
  tickets,
  booking_audit,
  booking_items,
  bookings,
  users,
} from '../models/schema.js';
// One small venue: serialize inventory/schedule writes with a common transaction lock.
export const lockInventory = (client: DatabaseClient) =>
  client.query('SELECT pg_advisory_xact_lock(1171201)');
export async function discountContext(
  db: DatabasePool | DatabaseClient,
  userId: string,
  promoCode?: string,
): Promise<DiscountContext> {
  const user = (
    await orm(db)
      .select({ student_verified: users.student_verified })
      .from(users)
      .where(eq(users.id, userId))
  )[0];
  if (!user) throw new HttpError(401, 'Потрібно увійти.');
  let promo: DiscountContext['promo'];
  if (promoCode) {
    const [row] = await orm(db)
      .select()
      .from(discounts)
      .where(
        and(
          sql`upper(${discounts.code})=upper(${promoCode})`,
          eq(discounts.type, 'PROMO'),
          eq(discounts.active, true),
          lte(discounts.valid_from, new Date()),
          gt(discounts.valid_to, new Date()),
        ),
      )
      .limit(1);
    if (!row) throw new HttpError(400, 'Промокод не знайдено або його строк минув.');
    promo = {
      code: row.code,
      percent: row.percent,
      active: row.active,
      validFrom: new Date(row.valid_from).getTime(),
      validTo: new Date(row.valid_to).getTime(),
    };
  }
  return { studentVerified: user.student_verified, now: Date.now(), promo };
}
export class PostgresBookingRepository implements BookingRepository {
  constructor(
    private readonly pool: DatabasePool,
    private readonly promoCode?: string,
  ) {}
  async load(id: string): Promise<Booking> {
    const row = (await orm(this.pool).select().from(bookings).where(eq(bookings.id, id)))[0];
    if (!row) throw new HttpError(404, 'Бронювання не знайдено.');
    const items = await orm(this.pool)
      .select({
        seatId: booking_items.seat_id,
        basePriceKopecks: booking_items.base_price_kopecks,
        discountKopecks: booking_items.discount_kopecks,
        finalPriceKopecks: booking_items.final_price_kopecks,
        discountName: booking_items.discount_name,
      })
      .from(booking_items)
      .where(eq(booking_items.booking_id, id))
      .orderBy(asc(booking_items.seat_id));
    return Booking.restore({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      createdAt: new Date(row.created_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
      status: row.status as BookingStatus,
      items: items,
      totalKopecks: items.reduce((sum, item) => sum + item.finalPriceKopecks, 0),
    });
  }
  async save(next: Booking, previous?: Booking): Promise<void> {
    const data = next.snapshot;
    await inTransaction(this.pool, async (client) => {
      await lockInventory(client);
      if (previous) {
        const [stored] = await orm(client)
          .select()
          .from(bookings)
          .where(eq(bookings.id, data.id))
          .for('update');
        if (!stored || stored.status !== previous.snapshot.status)
          throw new HttpError(409, 'Бронювання змінилося. Оновіть сторінку.');
        if (data.status === 'PAID' && new Date(stored.expires_at).getTime() <= Date.now())
          throw new HttpError(409, 'Строк бронювання минув.');
        await orm(client)
          .update(bookings)
          .set({ status: data.status })
          .where(eq(bookings.id, data.id));
        if (data.status === 'PAID') {
          const sold = await orm(client)
            .update(session_seats)
            .set({ status: 'SOLD' })
            .where(and(eq(session_seats.booking_id, data.id), eq(session_seats.status, 'RESERVED')))
            .returning({ seat_id: session_seats.seat_id });
          if (sold.length !== data.items.length) throw new HttpError(409, 'Місця вже недоступні.');
          const positions = await orm(client)
            .select({ booking_item_id: booking_items.id })
            .from(booking_items)
            .where(eq(booking_items.booking_id, data.id));
          await orm(client)
            .insert(tickets)
            .values(positions)
            .onConflictDoNothing({ target: tickets.booking_item_id });
        } else
          await orm(client)
            .update(session_seats)
            .set({ status: 'AVAILABLE', booking_id: null })
            .where(
              and(eq(session_seats.booking_id, data.id), eq(session_seats.status, 'RESERVED')),
            );
        return;
      }
      const [session] = await orm(client)
        .select({
          archived: sessions.archived,
          starts_at: sessions.starts_at,
          production_archived: productions.archived,
        })
        .from(sessions)
        .innerJoin(productions, eq(productions.id, sessions.production_id))
        .where(eq(sessions.id, data.sessionId));
      if (
        !session ||
        session.archived ||
        session.production_archived ||
        new Date(session.starts_at).getTime() <= Date.now() ||
        data.expiresAt <= Date.now() ||
        data.expiresAt > new Date(session.starts_at).getTime()
      )
        throw new HttpError(409, 'Сеанс недоступний.');
      const inventory = await orm(client)
        .select({
          seat_id: session_seats.seat_id,
          status: session_seats.status,
          price_kopecks: session_prices.price_kopecks,
        })
        .from(session_seats)
        .innerJoin(
          session_prices,
          and(
            eq(session_prices.session_id, session_seats.session_id),
            eq(session_prices.category, session_seats.category),
          ),
        )
        .where(
          and(
            eq(session_seats.session_id, data.sessionId),
            inArray(
              session_seats.seat_id,
              data.items.map((i) => i.seatId),
            ),
          ),
        )
        .orderBy(asc(session_seats.seat_id))
        .for('update', { of: session_seats });
      if (
        inventory.length !== data.items.length ||
        inventory.some((row) => row.status !== 'AVAILABLE')
      )
        throw new HttpError(409, 'Одне з місць уже зайняте. Оновіть схему.');
      const ctx = await discountContext(client, data.userId, this.promoCode);
      for (const item of data.items) {
        const row = inventory.find((r) => r.seat_id === item.seatId);
        const price = new PricingService().calculate(row!.price_kopecks, ctx);
        if (
          price.basePriceKopecks !== item.basePriceKopecks ||
          price.finalPriceKopecks !== item.finalPriceKopecks ||
          price.discountName !== item.discountName
        )
          throw new HttpError(409, 'Ціна змінилася. Повторіть бронювання.');
      }
      await orm(client)
        .insert(bookings)
        .values({
          id: data.id,
          user_id: data.userId,
          session_id: data.sessionId,
          status: data.status,
          created_at: new Date(data.createdAt),
          expires_at: new Date(data.expiresAt),
        });
      await orm(client)
        .insert(booking_items)
        .values(
          data.items.map((i) => ({
            booking_id: data.id,
            session_id: data.sessionId,
            seat_id: i.seatId,
            base_price_kopecks: i.basePriceKopecks,
            discount_kopecks: i.discountKopecks,
            final_price_kopecks: i.finalPriceKopecks,
            discount_name: i.discountName,
          })),
        );
      await orm(client)
        .update(session_seats)
        .set({ status: 'RESERVED', booking_id: data.id })
        .where(
          and(
            eq(session_seats.session_id, data.sessionId),
            inArray(
              session_seats.seat_id,
              data.items.map((i) => i.seatId),
            ),
          ),
        );
    });
  }
}
export class DatabaseAuditObserver implements BookingObserver {
  constructor(private readonly pool: DatabasePool) {}
  async onBookingChanged(event: Parameters<BookingObserver['onBookingChanged']>[0]): Promise<void> {
    await orm(this.pool)
      .insert(booking_audit)
      .values({
        booking_id: event.booking.id,
        event_type: event.type,
        status: event.booking.status,
        occurred_at: new Date(event.occurredAt),
      });
  }
}
