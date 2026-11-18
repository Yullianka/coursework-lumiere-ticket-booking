import { and, asc, desc, eq, gt, sql, count, min } from 'drizzle-orm';
import type { CatalogFilter } from '../types/catalog.js';
import type { DatabasePool } from '../config/database.js';
import { orm } from '../config/orm.js';
import {
  productions,
  sessions,
  halls,
  seats,
  session_prices,
  session_seats,
} from '../models/schema.js';
export class PostgresCatalogRepository {
  constructor(private readonly pool: DatabasePool) {}
  productions() {
    return orm(this.pool)
      .select()
      .from(productions)
      .where(eq(productions.archived, false))
      .orderBy(asc(productions.title))
      .limit(200);
  }
  async sessions(input: CatalogFilter) {
    const db = orm(this.pool);
    const prices = db
      .select({
        session_id: session_prices.session_id,
        min_price: min(session_prices.price_kopecks).as('min_price'),
      })
      .from(session_prices)
      .groupBy(session_prices.session_id)
      .as('catalog_prices');
    const availability = db
      .select({ session_id: session_seats.session_id, available: count().as('available') })
      .from(session_seats)
      .where(eq(session_seats.status, 'AVAILABLE'))
      .groupBy(session_seats.session_id)
      .as('availability');
    const minimum = sql<number>`coalesce(${prices.min_price},0)`.mapWith(Number),
      available = sql<number>`coalesce(${availability.available},0)`.mapWith(Number);
    const title = sql`lower(translate(${productions.title},'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯЁЪЫЭ','абвгґдеєжзиіїйклмнопрстуфхцчшщьюяёъыэ'))`;
    const order = {
      date_asc: [asc(sessions.starts_at), asc(sessions.id)],
      date_desc: [desc(sessions.starts_at), asc(sessions.id)],
      price_asc: [asc(minimum), asc(sessions.starts_at), asc(sessions.id)],
      price_desc: [desc(minimum), asc(sessions.starts_at), asc(sessions.id)],
    }[input.sort];
    return db
      .select({
        id: sessions.id,
        title: productions.title,
        description: productions.description,
        type: productions.type,
        duration_minutes: productions.duration_minutes,
        starts_at: sessions.starts_at,
        hall_name: halls.name,
        min_price: minimum,
        available,
      })
      .from(sessions)
      .innerJoin(productions, eq(productions.id, sessions.production_id))
      .innerJoin(halls, eq(halls.id, sessions.hall_id))
      .leftJoin(prices, eq(prices.session_id, sessions.id))
      .leftJoin(availability, eq(availability.session_id, sessions.id))
      .where(
        and(
          gt(sessions.starts_at, new Date()),
          eq(sessions.archived, false),
          eq(productions.archived, false),
          input.type ? eq(productions.type, input.type) : undefined,
          sql`strpos(${title},${input.search.toLowerCase()})>0`,
          input.day
            ? sql`(${sessions.starts_at} AT TIME ZONE 'Europe/Kyiv')::date=${input.day}::date`
            : undefined,
        ),
      )
      .orderBy(...order)
      .limit(200);
  }
  async seating(id: string) {
    const db = orm(this.pool);
    const [session] = await db
      .select({
        id: sessions.id,
        starts_at: sessions.starts_at,
        title: productions.title,
        type: productions.type,
        description: productions.description,
        duration_minutes: productions.duration_minutes,
        hall_name: halls.name,
      })
      .from(sessions)
      .innerJoin(productions, eq(productions.id, sessions.production_id))
      .innerJoin(halls, eq(halls.id, sessions.hall_id))
      .where(
        and(eq(sessions.id, id), eq(sessions.archived, false), eq(productions.archived, false)),
      );
    if (!session) return undefined;
    const positions = await db
      .select({
        id: session_seats.seat_id,
        status: session_seats.status,
        row_number: seats.row_number,
        seat_number: seats.seat_number,
        category: seats.category,
        price_kopecks: session_prices.price_kopecks,
      })
      .from(session_seats)
      .innerJoin(seats, eq(seats.id, session_seats.seat_id))
      .innerJoin(
        session_prices,
        and(
          eq(session_prices.session_id, session_seats.session_id),
          eq(session_prices.category, session_seats.category),
        ),
      )
      .where(eq(session_seats.session_id, id))
      .orderBy(asc(seats.row_number), asc(seats.seat_number));
    return { session, seats: positions };
  }
}
