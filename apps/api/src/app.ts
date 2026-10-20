import express, { type ErrorRequestHandler } from 'express';

export function createApp(databaseReady?: () => Promise<void>) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'lumiere-api', stage: 'database-foundation' });
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
    console.error(error);
    response
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера.' } });
  };
  app.use(handleError);

  return app;
}

export const app = createApp();
