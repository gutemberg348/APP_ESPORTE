import express from 'express';
import { requestContext } from './middleware/request-context.js';
import { cors } from './middleware/cors.js';
import { createAccessMiddleware } from './middleware/access.js';
import { errorHandler } from './middleware/errors.js';
import { createApiRouter } from './router.js';
import { AppError } from '../lib/errors.js';

export function createApp({ routes, authenticate, corsOrigins = [], readiness = async () => {}, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', false);
  app.set('case sensitive routing', true);
  app.set('strict routing', true);
  app.set('query parser', false);
  const access = createAccessMiddleware(authenticate);

  app.use(requestContext(logger));
  app.use(cors(corsOrigins));
  app.use(access.general);
  // Keep HEAD from falling through to Express's implicit GET support.
  app.all(['/health', '/ready'], (req, res, next) => {
    if (req.method !== 'GET') throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.');
    next();
  });
  app.get('/health', (req, res) => res.json({ data: { status: 'ok', service: 'nacional-api' } }));
  app.get('/ready', async (req, res) => {
    try { await readiness(); } catch { throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Banco de dados indisponível.'); }
    return res.json({ data: { status: 'ready' } });
  });
  app.use(createApiRouter(routes, access));
  app.use(() => { throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.'); });
  app.use(errorHandler(logger));
  return app;
}
