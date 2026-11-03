import { AppError } from '../../lib/errors.js';

export function cors(origins) {
  const allowed = new Set(origins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (!allowed.has(origin)) throw new AppError(403, 'ORIGIN_DENIED', 'Origem não permitida.');
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      });
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}
