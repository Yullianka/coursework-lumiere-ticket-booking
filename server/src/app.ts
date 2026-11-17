import express, { type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './http/errors.js';
import { InvalidTransitionError } from './domain/booking-state.js';
import { apiRoutes } from './http/routes.js';
import type { DatabasePool } from './infrastructure/database.js';

export function createApp(databaseReady?: () => Promise<void>, pool?: DatabasePool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'lumiere-api', stage: 'coursework' });
  });

  app.get('/api/ready', async (_request, response) => {
    if (!databaseReady) {
      response.status(503).json({ status: 'not-ready', database: 'not-configured' });
      return;
    }
    try {
      await databaseReady();
      response.json({ status: 'ready', database: 'connected' });
    } catch {
      response.status(503).json({ status: 'not-ready', database: 'unavailable' });
    }
  });

  if (pool) app.use('/api', apiRoutes(pool));

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Маршрут не знайдено.' } });
  });

  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Некоректний JSON.' } });
      return;
    }
    if (error?.type === 'entity.too.large') {
      response
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Запит завеликий.' } });
      return;
    }
    if (error instanceof ZodError) {
      response
        .status(400)
        .json({
          error: {
            code: 'VALIDATION',
            message: 'Перевірте заповнення полів.',
            details: error.issues.map((i) => ({ path: i.path, message: i.message })),
          },
        });
      return;
    }
    if (error instanceof HttpError) {
      response
        .status(error.status)
        .json({ error: { code: 'REQUEST_ERROR', message: error.message } });
      return;
    }
    if (error instanceof InvalidTransitionError) {
      response
        .status(409)
        .json({
          error: {
            code: 'INVALID_STATE',
            message: 'Ця дія недоступна для поточного стану бронювання.',
          },
        });
      return;
    }
    if (['23505', '23P01', '23503', '23514'].includes(error?.code)) {
      response
        .status(409)
        .json({
          error: {
            code: 'CONFLICT',
            message:
              error.code === '23P01'
                ? 'У цьому залі вже є сеанс у вибраний час.'
                : 'Дані конфліктують з наявними записами. Перевірте значення.',
          },
        });
      return;
    }
    console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
    response
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера.' } });
  };
  app.use(handleError);

  return app;
}

export const app = createApp();
