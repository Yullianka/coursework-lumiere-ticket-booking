import { Booking, type BookingItem } from '../domain/booking.js';
import { PricingService, type DiscountContext } from '../domain/pricing.js';
import type { BookingStatus } from '../domain/booking-state.js';
import { BookingService, type BookingRepository } from '../application/booking-service.js';
import { BookingEventPublisher, type BookingObserver } from '../application/booking-events.js';
import { inTransaction, type DatabasePool, type DatabaseClient } from './database.js';
import { HttpError } from '../http/errors.js';
// One small venue: serialize inventory/schedule writes with a common transaction lock.
export const lockInventory = (client: DatabaseClient) =>
  client.query('SELECT pg_advisory_xact_lock(1171201)');
export async function discountContext(
  db: DatabasePool | DatabaseClient,
  userId: string,
  promoCode?: string,
): Promise<DiscountContext> {
  const user = (await db.query('SELECT student_verified FROM users WHERE id=$1', [userId])).rows[0];
  if (!user) throw new HttpError(401, 'Потрібно увійти.');
  let promo: DiscountContext['promo'];
  if (promoCode) {
    const row = (
      await db.query(
        "SELECT * FROM discounts WHERE upper(code)=upper($1) AND type='PROMO' AND active AND valid_from<=now() AND valid_to>now()",
        [promoCode],
      )
    ).rows[0];
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
    const row = (await this.pool.query('SELECT * FROM bookings WHERE id=$1', [id])).rows[0];
    if (!row) throw new HttpError(404, 'Бронювання не знайдено.');
    const items = await this.pool.query(
      `SELECT seat_id AS "seatId",base_price_kopecks AS "basePriceKopecks",discount_kopecks AS "discountKopecks",final_price_kopecks AS "finalPriceKopecks",discount_name AS "discountName" FROM booking_items WHERE booking_id=$1 ORDER BY seat_id`,
      [id],
    );
    return Booking.restore({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      createdAt: new Date(row.created_at).getTime(),
      expiresAt: new Date(row.expires_at).getTime(),
      status: row.status as BookingStatus,
      items: items.rows as BookingItem[],
      totalKopecks: items.rows.reduce((sum, item) => sum + item.finalPriceKopecks, 0),
    });
  }
  async save(next: Booking, previous?: Booking): Promise<void> {
    const data = next.snapshot;
    await inTransaction(this.pool, async (client) => {
      await lockInventory(client);
      if (previous) {
        const stored = (
          await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [data.id])
        ).rows[0];
        if (!stored || stored.status !== previous.snapshot.status)
          throw new HttpError(409, 'Бронювання змінилося. Оновіть сторінку.');
        if (data.status === 'PAID' && new Date(stored.expires_at).getTime() <= Date.now())
          throw new HttpError(409, 'Строк бронювання минув.');
        await client.query('UPDATE bookings SET status=$1 WHERE id=$2', [data.status, data.id]);
        if (data.status === 'PAID') {
          const seats = await client.query(
            "UPDATE session_seats SET status='SOLD' WHERE booking_id=$1 AND status='RESERVED' RETURNING seat_id",
            [data.id],
          );
          if (seats.rowCount !== data.items.length)
            throw new HttpError(409, 'Місця вже недоступні.');
          await client.query(
            'INSERT INTO tickets(booking_item_id) SELECT id FROM booking_items WHERE booking_id=$1 ON CONFLICT(booking_item_id) DO NOTHING',
            [data.id],
          );
        } else
          await client.query(
            "UPDATE session_seats SET status='AVAILABLE',booking_id=NULL WHERE booking_id=$1 AND status='RESERVED'",
            [data.id],
          );
        return;
      }
      const session = (
        await client.query(
          'SELECT s.*,p.archived AS production_archived FROM sessions s JOIN productions p ON p.id=s.production_id WHERE s.id=$1',
          [data.sessionId],
        )
      ).rows[0];
      if (
        !session ||
        session.archived ||
        session.production_archived ||
        new Date(session.starts_at).getTime() <= Date.now() ||
        data.expiresAt <= Date.now() ||
        data.expiresAt > new Date(session.starts_at).getTime()
      )
        throw new HttpError(409, 'Сеанс недоступний.');
      const seats = await client.query(
        `SELECT ss.seat_id,ss.status,sp.price_kopecks FROM session_seats ss JOIN session_prices sp ON sp.session_id=ss.session_id AND sp.category=ss.category WHERE ss.session_id=$1 AND ss.seat_id=ANY($2::uuid[]) ORDER BY ss.seat_id FOR UPDATE OF ss`,
        [data.sessionId, data.items.map((i) => i.seatId)],
      );
      if (seats.rowCount !== data.items.length || seats.rows.some((r) => r.status !== 'AVAILABLE'))
        throw new HttpError(409, 'Одне з місць уже зайняте. Оновіть схему.');
      const ctx = await discountContext(client, data.userId, this.promoCode);
      for (const item of data.items) {
        const row = seats.rows.find((r) => r.seat_id === item.seatId);
        const price = new PricingService().calculate(row.price_kopecks, ctx);
        if (
          price.basePriceKopecks !== item.basePriceKopecks ||
          price.finalPriceKopecks !== item.finalPriceKopecks ||
          price.discountName !== item.discountName
        )
          throw new HttpError(409, 'Ціна змінилася. Повторіть бронювання.');
      }
      await client.query(
        'INSERT INTO bookings(id,user_id,session_id,status,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          data.id,
          data.userId,
          data.sessionId,
          data.status,
          new Date(data.createdAt),
          new Date(data.expiresAt),
        ],
      );
      for (const i of data.items)
        await client.query(
          'INSERT INTO booking_items(booking_id,session_id,seat_id,base_price_kopecks,discount_kopecks,final_price_kopecks,discount_name) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [
            data.id,
            data.sessionId,
            i.seatId,
            i.basePriceKopecks,
            i.discountKopecks,
            i.finalPriceKopecks,
            i.discountName,
          ],
        );
      await client.query(
        "UPDATE session_seats SET status='RESERVED',booking_id=$1 WHERE session_id=$2 AND seat_id=ANY($3::uuid[])",
        [data.id, data.sessionId, data.items.map((i) => i.seatId)],
      );
    });
  }
}
export class DatabaseAuditObserver implements BookingObserver {
  constructor(private readonly pool: DatabasePool) {}
  async onBookingChanged(event: Parameters<BookingObserver['onBookingChanged']>[0]): Promise<void> {
    await this.pool.query(
      'INSERT INTO booking_audit(booking_id,event_type,status,occurred_at) VALUES ($1,$2,$3,$4)',
      [event.booking.id, event.type, event.booking.status, new Date(event.occurredAt)],
    );
  }
}
export function bookingServices(pool: DatabasePool, promoCode?: string) {
  const repository = new PostgresBookingRepository(pool, promoCode),
    events = new BookingEventPublisher();
  events.subscribe(new DatabaseAuditObserver(pool));
  return { repository, service: new BookingService(repository, new PricingService(), events) };
}
export async function expireBookings(pool: DatabasePool): Promise<void> {
  const { repository, service } = bookingServices(pool);
  const rows = await pool.query(
    "SELECT id FROM bookings WHERE status='PENDING' AND expires_at<=now() ORDER BY expires_at LIMIT 200",
  );
  for (const row of rows.rows)
    try {
      const b = await repository.load(row.id);
      if (b.snapshot.status === 'PENDING') {
        const result = await service.expire(b);
        if (result.observerFailures.length) console.error('Expiration audit failed.');
      }
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 409)) throw e;
    }
  await pool.query('DELETE FROM auth_sessions WHERE expires_at<=now()');
}
