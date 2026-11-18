import { and, asc, desc, eq, gt, gte, lt, inArray, count, sum, sql } from 'drizzle-orm';
import type {
  DiscountInput,
  HallInput,
  ProductionInput,
  SessionInput,
} from '../types/admin-input.js';
import { HttpError } from '../middleware/errors.js';
import { lockInventory } from './booking-repository.js';
import { inTransaction, type DatabasePool } from '../config/database.js';
import { orm } from '../config/orm.js';
import {
  discounts,
  halls,
  productions,
  users,
  sessions,
  seats,
  bookings,
  session_prices,
  session_seats,
  booking_items,
  tickets,
} from '../models/schema.js';
export class PostgresAdminRepository {
  constructor(private readonly pool: DatabasePool) {}
  async productions() {
    return await orm(this.pool).select().from(productions).orderBy(asc(productions.title));
  }
  async halls() {
    return orm(this.pool)
      .select({ id: halls.id, name: halls.name, capacity: count(seats.id) })
      .from(halls)
      .leftJoin(seats, eq(seats.hall_id, halls.id))
      .groupBy(halls.id, halls.name)
      .orderBy(asc(halls.name));
  }
  async sessions() {
    const db = orm(this.pool);
    const rows = await db
      .select({ session: sessions, title: productions.title, hall_name: halls.name })
      .from(sessions)
      .innerJoin(productions, eq(productions.id, sessions.production_id))
      .innerJoin(halls, eq(halls.id, sessions.hall_id))
      .orderBy(desc(sessions.starts_at))
      .limit(300);
    if (!rows.length) return [];
    const prices = await db
      .select()
      .from(session_prices)
      .where(
        inArray(
          session_prices.session_id,
          rows.map((r) => r.session.id),
        ),
      );
    return rows.map(({ session, ...details }) => ({
      ...session,
      ...details,
      prices: Object.fromEntries(
        prices.filter((p) => p.session_id === session.id).map((p) => [p.category, p.price_kopecks]),
      ),
    }));
  }
  async discounts() {
    return await orm(this.pool).select().from(discounts).orderBy(asc(discounts.code));
  }
  async users() {
    return await orm(this.pool)
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        role: users.role,
        student_verified: users.student_verified,
      })
      .from(users)
      .orderBy(desc(users.created_at))
      .limit(300);
  }
  async createProduction(p: ProductionInput) {
    const [row] = await orm(this.pool)
      .insert(productions)
      .values({
        title: p.title,
        description: p.description,
        type: p.type,
        duration_minutes: p.durationMinutes,
        archived: p.archived,
      })
      .returning();
    return row;
  }
  async updateProduction(key: string, p: ProductionInput) {
    const row = await inTransaction(this.pool, async (c) => {
      await lockInventory(c);
      const active = p.archived
        ? await orm(c)
            .select({ id: bookings.id })
            .from(bookings)
            .innerJoin(sessions, eq(sessions.id, bookings.session_id))
            .where(
              and(
                eq(sessions.production_id, key),
                gt(sessions.starts_at, new Date()),
                inArray(bookings.status, ['PENDING', 'PAID']),
              ),
            )
            .limit(1)
        : [];
      if (active.length) throw new HttpError(409, 'Є майбутні бронювання або продажі.');
      return (
        await orm(c)
          .update(productions)
          .set({
            title: p.title,
            description: p.description,
            type: p.type,
            duration_minutes: p.durationMinutes,
            archived: p.archived,
          })
          .where(eq(productions.id, key))
          .returning()
      )[0];
    });
    if (!row) throw new HttpError(404, 'Подію не знайдено.');
    return row;
  }
  async createHall(p: HallInput) {
    const hall = await inTransaction(this.pool, async (c) => {
      const db = orm(c);
      const [h] = await db.insert(halls).values({ name: p.name }).returning();
      const positions: (typeof seats.$inferInsert)[] = [];
      for (let row = 1; row <= p.rows; row++)
        for (let seat = 1; seat <= p.seatsPerRow; seat++)
          positions.push({
            hall_id: h.id,
            row_number: row,
            seat_number: seat,
            category: p.vipRows.includes(row)
              ? 'VIP'
              : p.balconyRows.includes(row)
                ? 'BALCONY'
                : 'STANDARD',
          });
      await db.insert(seats).values(positions);
      return h;
    });
    return hall;
  }
  async renameHall(key: string, p: { name: string }) {
    const [row] = await orm(this.pool)
      .update(halls)
      .set({ name: p.name })
      .where(eq(halls.id, key))
      .returning();
    if (!row) throw new HttpError(404, 'Зал не знайдено.');
    return row;
  }
  async saveSession(key: string | undefined, p: SessionInput) {
    const row = await inTransaction(this.pool, async (c) => {
      await lockInventory(c);
      const db = orm(c);
      const [prod] = await db
        .select({ duration_minutes: productions.duration_minutes })
        .from(productions)
        .where(and(eq(productions.id, p.productionId), eq(productions.archived, false)));
      if (!prod) throw new HttpError(400, 'Подія недоступна.');
      const positions = await db.select().from(seats).where(eq(seats.hall_id, p.hallId));
      if (!positions.length) throw new HttpError(400, 'Зал має містити місця.');
      if (
        key &&
        (
          await db
            .select({ id: bookings.id })
            .from(bookings)
            .where(eq(bookings.session_id, key))
            .limit(1)
        ).length
      )
        throw new HttpError(409, 'Сеанс з історією бронювань не можна змінювати.');
      if (key) {
        await db.delete(session_seats).where(eq(session_seats.session_id, key));
        await db.delete(session_prices).where(eq(session_prices.session_id, key));
      }
      const values = {
        production_id: p.productionId,
        hall_id: p.hallId,
        starts_at: new Date(p.startsAt),
        ends_at: new Date(new Date(p.startsAt).getTime() + prod.duration_minutes * 60000),
        archived: p.archived,
      };
      const [s] = key
        ? await db.update(sessions).set(values).where(eq(sessions.id, key)).returning()
        : await db.insert(sessions).values(values).returning();
      if (!s) throw new HttpError(404, 'Сеанс не знайдено.');
      await db
        .insert(session_prices)
        .values(
          (['STANDARD', 'VIP', 'BALCONY'] as const).map((category) => ({
            session_id: s.id,
            category,
            price_kopecks: p.prices[category],
          })),
        );
      await db
        .insert(session_seats)
        .values(
          positions.map((seat) => ({
            session_id: s.id,
            seat_id: seat.id,
            hall_id: seat.hall_id,
            category: seat.category,
          })),
        );
      return s;
    });
    return row;
  }
  async saveDiscount(key: string | undefined, p: DiscountInput) {
    const row = await inTransaction(this.pool, async (c) => {
      await lockInventory(c);
      const values = {
        code: p.code,
        percent: p.percent,
        valid_from: new Date(p.validFrom),
        valid_to: new Date(p.validTo),
        active: p.active,
      };
      return (
        key
          ? await orm(c)
              .update(discounts)
              .set(values)
              .where(and(eq(discounts.id, key!), eq(discounts.type, 'PROMO')))
              .returning()
          : await orm(c)
              .insert(discounts)
              .values({ ...values, type: 'PROMO' })
              .returning()
      )[0];
    });
    if (!row) throw new HttpError(404, 'Знижку не знайдено.');
    return row;
  }
  async verifyStudent(key: string, p: { studentVerified: boolean }) {
    const row = await inTransaction(this.pool, async (c) => {
      await lockInventory(c);
      return (
        await orm(c)
          .update(users)
          .set({ student_verified: p.studentVerified })
          .where(eq(users.id, key))
          .returning({ id: users.id, student_verified: users.student_verified })
      )[0];
    });
    if (!row) throw new HttpError(404, 'Користувача не знайдено.');
    return row;
  }
  async reports(p: { from: string; to: string }) {
    const db = orm(this.pool),
      from = new Date(p.from),
      to = new Date(p.to);
    const paid = and(
      eq(bookings.status, 'PAID'),
      gte(tickets.sold_at, from),
      lt(tickets.sold_at, to),
    );
    const [sales] = await db
      .select({
        tickets: count(tickets.id),
        revenue: sql<string>`coalesce(${sum(booking_items.final_price_kopecks)},0)`,
      })
      .from(tickets)
      .innerJoin(booking_items, eq(booking_items.id, tickets.booking_item_id))
      .innerJoin(bookings, eq(bookings.id, booking_items.booking_id))
      .where(paid);
    const revenue = await db
      .select({
        title: productions.title,
        session_id: sessions.id,
        starts_at: sessions.starts_at,
        tickets: count(tickets.id),
        revenue: sum(booking_items.final_price_kopecks),
      })
      .from(tickets)
      .innerJoin(booking_items, eq(booking_items.id, tickets.booking_item_id))
      .innerJoin(bookings, eq(bookings.id, booking_items.booking_id))
      .innerJoin(sessions, eq(sessions.id, bookings.session_id))
      .innerJoin(productions, eq(productions.id, sessions.production_id))
      .where(paid)
      .groupBy(productions.title, sessions.id, sessions.starts_at)
      .orderBy(asc(sessions.starts_at));
    const day = sql<string>`to_char(${sessions.starts_at} AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD')`;
    const sold = sql<number>`count(*) filter(where ${session_seats.status}='SOLD')`.mapWith(Number);
    const reserved = sql<number>`count(*) filter(where ${session_seats.status}='RESERVED')`.mapWith(
      Number,
    );
    const occupancy = await db
      .select({
        day,
        hall: halls.name,
        capacity: count(),
        sold,
        reserved,
        percent: sql<string>`round(100.0*${sold}/nullif(count(*),0),1)`,
      })
      .from(session_seats)
      .innerJoin(sessions, eq(sessions.id, session_seats.session_id))
      .innerJoin(halls, eq(halls.id, sessions.hall_id))
      .where(
        and(
          gte(sessions.starts_at, from),
          lt(sessions.starts_at, to),
          eq(sessions.archived, false),
        ),
      )
      .groupBy(day, halls.name)
      .orderBy(asc(day), asc(halls.name));
    return { summary: sales, revenue, occupancy };
  }
}
