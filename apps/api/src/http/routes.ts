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
  return router;
}
