import { isIP } from 'node:net';
import express from 'express';
import { requestContext } from './middleware/request-context.js';
import { fileURLToPath } from 'node:url';
import { cors } from './middleware/cors.js';
import { createAccessMiddleware } from './middleware/access.js';
import { errorHandler } from './middleware/errors.js';
import { createApiRouter } from './router.js';
import { AppError } from '../lib/errors.js';
import { jsonBody } from './body.js';

export function createApp({ routes, authenticate, corsOrigins = [], allowDevelopmentOrigin, trustProxy = false, readiness = async () => {}, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', trustProxy === 'loopback' || (typeof trustProxy === 'string' && isIP(trustProxy)) ? trustProxy : false);
  app.set('case sensitive routing', true);
  app.set('strict routing', true);
  app.set('query parser', false);
  const access = createAccessMiddleware(authenticate);

  app.use(requestContext(logger));
  // Only versioned, public catalogue images. Paths never come from user input.
  app.use('/media/shop', express.static(fileURLToPath(new URL('../../public/shop/', import.meta.url)), {
    dotfiles: 'deny', index: false, immutable: true, maxAge: '365d',
    setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
  }));
  app.use(cors(corsOrigins, allowDevelopmentOrigin));
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
  // Exercise the same JSON POST/CORS path as login, without credentials,
  // account lookup, authentication quotas or any database mutation.
  app.all('/connection-check', (req, res, next) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST');
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
    }
    next();
  });
  app.post('/connection-check', jsonBody, (req, res) => {
    if (!req.body || Array.isArray(req.body) || req.body.probe !== true || Object.keys(req.body).length !== 1)
      throw new AppError(422, 'INVALID_CONNECTION_PROBE', 'Envie somente a verificação de conexão.');
    return res.json({ data: { status: 'ok', service: 'nacional-api', method: 'POST' } });
  });
  app.use(createApiRouter(routes, access));
  app.use(() => { throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.'); });
  app.use(errorHandler(logger));
  return app;
}
