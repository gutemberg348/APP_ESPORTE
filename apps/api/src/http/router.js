import { Router } from 'express';
import { jsonBody } from './body.js';
import { AppError } from '../lib/errors.js';

export function createApiRouter(routes, access) {
  const router = Router({ caseSensitive: true, strict: true });
  const groups = new Map();
  for (const route of routes) {
    if (typeof route.handler !== 'function') throw new TypeError(`Handler inválido: ${route.method} ${route.path}`);
    const entries = groups.get(route.path) || [];
    if (entries.some((entry) => entry.method === route.method)) throw new TypeError(`Rota duplicada: ${route.method} ${route.path}`);
    entries.push(route); groups.set(route.path, entries);
  }
  for (const [path, entries] of groups) {
    const endpoint = router.route(path);
    // Express normally maps HEAD to GET. Keep the API's explicit method contract.
    endpoint.all((req, res, next) => {
      if (!entries.some((entry) => entry.method === req.method)) {
        res.set('Allow', entries.map((entry) => entry.method).join(', '));
        throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
      }
      next();
    });
    for (const route of entries) {
      const parseBody = ['POST', 'PATCH', 'PUT'].includes(route.method) && route.body !== false;
      endpoint[route.method.toLowerCase()](access.route(route), ...(parseBody ? jsonBody : []), async (req, res) => {
        const result = await route.handler({ req, url: res.locals.url, body: parseBody ? req.body : undefined, ...res.locals.auth });
        const status = result.status ?? 200;
        if (status === 204) return res.status(status).end();
        return res.status(status).json({ data: result.data });
      });
    }
  }
  return router;
}
