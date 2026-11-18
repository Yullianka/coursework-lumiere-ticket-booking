import { and, eq, gt, inArray, desc, asc } from 'drizzle-orm';
import { discountContext } from './booking-repository.js';
import type { DatabasePool } from '../config/database.js';
import { orm } from '../config/orm.js';
import {
  session_prices,
  session_seats,
  sessions,
  bookings,
  productions,
  halls,
  booking_items,
  seats,
  tickets,
} from '../models/schema.js';
export class BookingQueryRepository {
  constructor(private readonly pool: DatabasePool) {}
  async session(id: string) {
    return (
      await orm(this.pool)
        .select({ starts_at: sessions.starts_at })
        .from(sessions)
        .where(
          and(
            eq(sessions.id, id),
            eq(sessions.archived, false),
            gt(sessions.starts_at, new Date()),
          ),
        )
    )[0];
  }
  seats(sessionId: string, seatIds: string[]) {
    return orm(this.pool)
      .select({ seatId: session_seats.seat_id, basePriceKopecks: session_prices.price_kopecks })
      .from(session_seats)
      .innerJoin(
        session_prices,
        and(
          eq(session_prices.session_id, session_seats.session_id),
          eq(session_prices.category, session_seats.category),
        ),
      )
      .where(and(eq(session_seats.session_id, sessionId), inArray(session_seats.seat_id, seatIds)));
  }
  discount(userId: string, promo?: string) {
    return discountContext(this.pool, userId, promo);
  }
  async mine(userId: string) {
    const db = orm(this.pool);
    const rows = await db
      .select({
        booking: bookings,
        title: productions.title,
        starts_at: sessions.starts_at,
        hall_name: halls.name,
      })
      .from(bookings)
      .innerJoin(sessions, eq(sessions.id, bookings.session_id))
      .innerJoin(productions, eq(productions.id, sessions.production_id))
      .innerJoin(halls, eq(halls.id, sessions.hall_id))
      .where(eq(bookings.user_id, userId))
      .orderBy(desc(bookings.created_at))
      .limit(200);
    if (!rows.length) return [];
    const items = await db
      .select({
        booking_id: booking_items.booking_id,
        id: booking_items.id,
        row: seats.row_number,
        seat: seats.seat_number,
        category: seats.category,
        price: booking_items.final_price_kopecks,
        discount: booking_items.discount_name,
        ticketId: tickets.id,
      })
      .from(booking_items)
      .innerJoin(seats, eq(seats.id, booking_items.seat_id))
      .leftJoin(tickets, eq(tickets.booking_item_id, booking_items.id))
      .where(
        inArray(
          booking_items.booking_id,
          rows.map((r) => r.booking.id),
        ),
      )
      .orderBy(asc(seats.row_number), asc(seats.seat_number));
    return rows.map(({ booking, ...details }) => {
      const positions = items
        .filter((i) => i.booking_id === booking.id)
        .map(({ booking_id, ...item }) => item);
      return {
        ...booking,
        ...details,
        total_kopecks: positions.reduce((sum, i) => sum + i.price, 0),
        items: positions,
      };
    });
  }
}
