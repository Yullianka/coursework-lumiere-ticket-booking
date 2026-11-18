import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Services } from '../types/services.js';

import { HttpError } from './errors.js';
import { account } from './validation.js';
export function configureAccess(router: Router, authenticate: Services['authenticate']) {
  router.use(async (req, res, next) => {
    res.locals.account = await authenticate(req.headers.cookie);
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
  const requireClient: RequestHandler = (_req, res, next) => {
    if (account(res)?.role !== 'CLIENT')
      throw new HttpError(
        403,
        'Бронювання та квитки доступні лише клієнтам. Увійдіть у клієнтський акаунт.',
      );
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
  router.use('/admin', requireUser, requireAdmin);
  return { requireUser, requireClient };
}
