import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { DatabasePool } from '../infrastructure/database.js';
import { inTransaction } from '../infrastructure/database.js';
import {
  authenticate,
  hashPassword,
  verifyPassword,
  issueSession,
  readToken,
  tokenHash,
  type Account,
} from '../infrastructure/auth.js';
import {
  bookingServices,
  discountContext,
  expireBookings,
  lockInventory,
} from '../infrastructure/booking-repository.js';
import { HttpError } from './errors.js';
const id = z.string().uuid();
const text = z.string().trim().min(1).max(200);
const date = z.string().datetime({ offset: true });
const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
});
const production = z.object({
  title: text,
  description: z.string().max(5000),
  type: z.enum(['FILM', 'PLAY']),
  durationMinutes: z.number().int().min(1).max(600),
  archived: z.boolean().default(false),
});
const prices = z.object({
  STANDARD: z.number().int().min(0).max(100000000),
  VIP: z.number().int().min(0).max(100000000),
  BALCONY: z.number().int().min(0).max(100000000),
});
const sessionSchema = z.object({
  productionId: id,
  hallId: id,
  startsAt: date,
  prices,
  archived: z.boolean().default(false),
});
const discount = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,32}$/),
  percent: z.number().int().min(1).max(100),
  validFrom: date,
  validTo: date,
  active: z.boolean().default(true),
});
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 3600 * 1000,
};
const account = (res: Parameters<RequestHandler>[1]) => res.locals.account as Account;

export function apiRoutes(pool: DatabasePool): Router {
  const router = Router();
  router.use(async (req, res, next) => {
    res.locals.account = await authenticate(pool, req.headers.cookie);
    next();
  });
  router.use((req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowed = process.env.APP_ORIGIN?.split(',') ?? [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:4173',
        'http://127.0.0.1:4173',
      ];
      if (req.headers.origin && !allowed.includes(req.headers.origin))
        throw new HttpError(403, 'Недозволене джерело запиту.');
      if (!req.is('application/json')) throw new HttpError(415, 'Потрібен JSON-запит.');
    }
    next();
  });
  const requireUser: RequestHandler = (_req, res, next) => {
    if (!res.locals.account) throw new HttpError(401, 'Увійдіть у свій обліковий запис.');
    next();
  };
  const requireAdmin: RequestHandler = (_req, res, next) => {
    if (account(res)?.role !== 'ADMIN') throw new HttpError(403, 'Потрібні права адміністратора.');
    next();
  };
  router.use(
    '/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { message: 'Забагато спроб. Спробуйте пізніше.' } },
    }),
  );
  router.post('/auth/register', async (req, res) => {
    const input = credentials.extend({ displayName: text.max(100) }).parse(req.body);
    const row = (
      await pool.query(
        'INSERT INTO users(email,password_hash,display_name) VALUES ($1,$2,$3) RETURNING id',
        [input.email, await hashPassword(input.password), input.displayName],
      )
    ).rows[0];
    res.cookie('lumiere_session', await issueSession(pool, row.id), cookieOptions);
    res.status(201).json({ id: row.id });
  });
  router.post('/auth/login', async (req, res) => {
    const input = credentials.parse(req.body),
      user = (await pool.query('SELECT id,password_hash FROM users WHERE email=$1', [input.email]))
        .rows[0];
    if (!(await verifyPassword(input.password, user?.password_hash ?? '')))
      throw new HttpError(401, 'Неправильна пошта або пароль.');
    res.cookie('lumiere_session', await issueSession(pool, user.id), cookieOptions);
    res.json({ id: user.id });
  });
  router.get('/auth/me', (_req, res) => res.json({ user: res.locals.account ?? null }));
  router.post('/auth/logout', async (req, res) => {
    const token = readToken(req.headers.cookie);
    if (token)
      await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [tokenHash(token)]);
    res.clearCookie('lumiere_session', cookieOptions);
    res.status(204).end();
  });
  router.get('/productions', async (_req, res) =>
    res.json(
      (await pool.query('SELECT * FROM productions WHERE NOT archived ORDER BY title LIMIT 200'))
        .rows,
    ),
  );
  router.get('/sessions', async (_req, res) => {
    await expireBookings(pool);
    res.json(
      (
        await pool.query(`SELECT s.*,p.title,p.description,p.type,p.duration_minutes,h.name AS hall_name,
   (SELECT min(price_kopecks) FROM session_prices WHERE session_id=s.id) AS min_price,
   (SELECT count(*)::int FROM session_seats WHERE session_id=s.id AND status='AVAILABLE') AS available
   FROM sessions s JOIN productions p ON p.id=s.production_id JOIN halls h ON h.id=s.hall_id
   WHERE s.starts_at>now() AND NOT s.archived AND NOT p.archived ORDER BY s.starts_at LIMIT 200`)
      ).rows,
    );
  });
  router.get('/sessions/:id/seats', async (req, res) => {
    const sessionId = id.parse(req.params.id);
    await expireBookings(pool);
    const session = (
      await pool.query(
        `SELECT s.*,p.title,p.type,p.description,h.name AS hall_name FROM sessions s JOIN productions p ON p.id=s.production_id JOIN halls h ON h.id=s.hall_id WHERE s.id=$1 AND NOT s.archived AND NOT p.archived`,
        [sessionId],
      )
    ).rows[0];
    if (!session) throw new HttpError(404, 'Сеанс не знайдено.');
    const seats = await pool.query(
      `SELECT ss.seat_id AS id,ss.status,s.row_number,s.seat_number,s.category,p.price_kopecks
   FROM session_seats ss JOIN seats s ON s.id=ss.seat_id JOIN session_prices p ON p.session_id=ss.session_id AND p.category=ss.category
   WHERE ss.session_id=$1 ORDER BY s.row_number,s.seat_number`,
      [sessionId],
    );
    res.json({ session, seats: seats.rows });
  });
  router.post('/bookings', requireUser, async (req, res) => {
    const input = z
      .object({
        sessionId: id,
        seatIds: z.array(id).min(1).max(8),
        promoCode: z.string().trim().toUpperCase().max(32).optional(),
      })
      .parse(req.body);
    if (new Set(input.seatIds).size !== input.seatIds.length)
      throw new HttpError(400, 'Місця не можуть повторюватися.');
    await expireBookings(pool);
    const session = (
      await pool.query(
        'SELECT starts_at FROM sessions WHERE id=$1 AND NOT archived AND starts_at>now()',
        [input.sessionId],
      )
    ).rows[0];
    if (!session) throw new HttpError(404, 'Сеанс недоступний.');
    const seats = (
      await pool.query(
        `SELECT ss.seat_id AS "seatId",p.price_kopecks AS "basePriceKopecks" FROM session_seats ss JOIN session_prices p ON p.session_id=ss.session_id AND p.category=ss.category WHERE ss.session_id=$1 AND ss.seat_id=ANY($2::uuid[])`,
        [input.sessionId, input.seatIds],
      )
    ).rows;
    if (seats.length !== input.seatIds.length) throw new HttpError(400, 'Некоректні місця.');
    const { service } = bookingServices(pool, input.promoCode || undefined);
    const result = await service.reserve({
      userId: account(res).id,
      sessionId: input.sessionId,
      startsAt: new Date(session.starts_at).getTime(),
      seats,
      discount: await discountContext(pool, account(res).id, input.promoCode || undefined),
    });
    if (result.observerFailures.length) console.error('Booking audit failed.');
    res.status(201).json(result.booking.snapshot);
  });
  router.get('/bookings/mine', requireUser, async (_req, res) => {
    await expireBookings(pool);
    res.json(
      (
        await pool.query(
          `SELECT b.*,p.title,s.starts_at,h.name AS hall_name,
   (SELECT coalesce(sum(final_price_kopecks),0)::int FROM booking_items WHERE booking_id=b.id) AS total_kopecks,
   (SELECT json_agg(json_build_object('id',bi.id,'row',st.row_number,'seat',st.seat_number,'category',st.category,'price',bi.final_price_kopecks,'discount',bi.discount_name,'ticketId',t.id) ORDER BY st.row_number,st.seat_number)
     FROM booking_items bi JOIN seats st ON st.id=bi.seat_id LEFT JOIN tickets t ON t.booking_item_id=bi.id WHERE bi.booking_id=b.id) AS items
   FROM bookings b JOIN sessions s ON s.id=b.session_id JOIN productions p ON p.id=s.production_id JOIN halls h ON h.id=s.hall_id
   WHERE b.user_id=$1 ORDER BY b.created_at DESC LIMIT 200`,
          [account(res).id],
        )
      ).rows,
    );
  });
  for (const action of ['pay', 'cancel'] as const)
    router.post(`/bookings/:id/${action}`, requireUser, async (req, res) => {
      await expireBookings(pool);
      const { service, repository } = bookingServices(pool);
      const booking = await repository.load(id.parse(req.params.id));
      if (booking.snapshot.userId !== account(res).id)
        throw new HttpError(403, 'Це бронювання належить іншому користувачу.');
      const result = await service[action](account(res).id, booking);
      if (result.observerFailures.length) console.error('Booking audit failed.');
      res.json(result.booking.snapshot);
    });
  router.use('/admin', requireUser, requireAdmin);
  router.get('/admin/productions', async (_req, res) =>
    res.json((await pool.query('SELECT * FROM productions ORDER BY title')).rows),
  );
  router.post('/admin/productions', async (req, res) => {
    const p = production.parse(req.body);
    res
      .status(201)
      .json(
        (
          await pool.query(
            'INSERT INTO productions(title,description,type,duration_minutes,archived) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [p.title, p.description, p.type, p.durationMinutes, p.archived],
          )
        ).rows[0],
      );
  });
  router.patch('/admin/productions/:id', async (req, res) => {
    const p = production.parse(req.body),
      key = id.parse(req.params.id);
    const row = await inTransaction(pool, async (c) => {
      await lockInventory(c);
      if (
        p.archived &&
        (
          await c.query(
            "SELECT 1 FROM bookings b JOIN sessions s ON s.id=b.session_id WHERE s.production_id=$1 AND s.starts_at>now() AND b.status IN ('PENDING','PAID') LIMIT 1",
            [key],
          )
        ).rowCount
      )
        throw new HttpError(409, 'Є майбутні бронювання або продажі.');
      return (
        await c.query(
          'UPDATE productions SET title=$1,description=$2,type=$3,duration_minutes=$4,archived=$5 WHERE id=$6 RETURNING *',
          [p.title, p.description, p.type, p.durationMinutes, p.archived, key],
        )
      ).rows[0];
    });
    if (!row) throw new HttpError(404, 'Подію не знайдено.');
    res.json(row);
  });
  router.get('/admin/halls', async (_req, res) =>
    res.json(
      (
        await pool.query(
          'SELECT h.*,count(s.id)::int AS capacity FROM halls h LEFT JOIN seats s ON s.hall_id=h.id GROUP BY h.id ORDER BY h.name',
        )
      ).rows,
    ),
  );
  router.post('/admin/halls', async (req, res) => {
    const p = z
      .object({
        name: text,
        rows: z.number().int().min(1).max(20),
        seatsPerRow: z.number().int().min(1).max(30),
        vipRows: z.array(z.number().int().min(1).max(20)).default([]),
        balconyRows: z.array(z.number().int().min(1).max(20)).default([]),
      })
      .parse(req.body);
    if (
      [...p.vipRows, ...p.balconyRows].some((r) => r > p.rows) ||
      p.vipRows.some((r) => p.balconyRows.includes(r))
    )
      throw new HttpError(400, 'Перевірте категорії рядів.');
    const hall = await inTransaction(pool, async (c) => {
      const h = (await c.query('INSERT INTO halls(name) VALUES ($1) RETURNING *', [p.name]))
        .rows[0];
      for (let row = 1; row <= p.rows; row++)
        for (let seat = 1; seat <= p.seatsPerRow; seat++)
          await c.query(
            'INSERT INTO seats(hall_id,row_number,seat_number,category) VALUES ($1,$2,$3,$4)',
            [
              h.id,
              row,
              seat,
              p.vipRows.includes(row)
                ? 'VIP'
                : p.balconyRows.includes(row)
                  ? 'BALCONY'
                  : 'STANDARD',
            ],
          );
      return h;
    });
    res.status(201).json(hall);
  });
  router.patch('/admin/halls/:id', async (req, res) => {
    const p = z.object({ name: text }).parse(req.body);
    const row = (
      await pool.query('UPDATE halls SET name=$1 WHERE id=$2 RETURNING *', [
        p.name,
        id.parse(req.params.id),
      ])
    ).rows[0];
    if (!row) throw new HttpError(404, 'Зал не знайдено.');
    res.json(row);
  });
  router.get('/admin/sessions', async (_req, res) =>
    res.json(
      (
        await pool.query(
          `SELECT s.*,p.title,h.name AS hall_name,(SELECT json_object_agg(category,price_kopecks) FROM session_prices WHERE session_id=s.id) AS prices FROM sessions s JOIN productions p ON p.id=s.production_id JOIN halls h ON h.id=s.hall_id ORDER BY starts_at DESC LIMIT 300`,
        )
      ).rows,
    ),
  );
  const saveSession =
    (update: boolean): RequestHandler =>
    async (req, res) => {
      const p = sessionSchema.parse(req.body),
        key = update ? id.parse(req.params.id) : undefined;
      if (new Date(p.startsAt).getTime() <= Date.now())
        throw new HttpError(400, 'Початок сеансу має бути в майбутньому.');
      const row = await inTransaction(pool, async (c) => {
        await lockInventory(c);
        const prod = (
          await c.query('SELECT duration_minutes FROM productions WHERE id=$1 AND NOT archived', [
            p.productionId,
          ])
        ).rows[0];
        if (!prod) throw new HttpError(400, 'Подія недоступна.');
        if (!(await c.query('SELECT 1 FROM seats WHERE hall_id=$1 LIMIT 1', [p.hallId])).rowCount)
          throw new HttpError(400, 'Зал має містити місця.');
        if (
          key &&
          (await c.query('SELECT 1 FROM bookings WHERE session_id=$1 LIMIT 1', [key])).rowCount
        )
          throw new HttpError(409, 'Сеанс з історією бронювань не можна змінювати.');
        if (key) {
          await c.query('DELETE FROM session_seats WHERE session_id=$1', [key]);
          await c.query('DELETE FROM session_prices WHERE session_id=$1', [key]);
        }
        const end = new Date(new Date(p.startsAt).getTime() + prod.duration_minutes * 60000);
        const result = key
          ? await c.query(
              'UPDATE sessions SET production_id=$1,hall_id=$2,starts_at=$3,ends_at=$4,archived=$5 WHERE id=$6 RETURNING *',
              [p.productionId, p.hallId, p.startsAt, end, p.archived, key],
            )
          : await c.query(
              'INSERT INTO sessions(production_id,hall_id,starts_at,ends_at,archived) VALUES ($1,$2,$3,$4,$5) RETURNING *',
              [p.productionId, p.hallId, p.startsAt, end, p.archived],
            );
        const s = result.rows[0];
        if (!s) throw new HttpError(404, 'Сеанс не знайдено.');
        for (const category of ['STANDARD', 'VIP', 'BALCONY'] as const)
          await c.query(
            'INSERT INTO session_prices(session_id,category,price_kopecks) VALUES ($1,$2,$3)',
            [s.id, category, p.prices[category]],
          );
        await c.query(
          'INSERT INTO session_seats(session_id,seat_id,hall_id,category) SELECT $1,id,hall_id,category FROM seats WHERE hall_id=$2',
          [s.id, p.hallId],
        );
        return s;
      });
      res.status(update ? 200 : 201).json(row);
    };
  router.post('/admin/sessions', saveSession(false));
  router.patch('/admin/sessions/:id', saveSession(true));
  return router;
}
