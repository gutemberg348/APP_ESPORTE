import { randomUUID } from 'node:crypto';

export function requestContext(logger) {
  return (req, res, next) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.set({
      'X-Request-Id': requestId,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Origin',
    });
    res.on('finish', () => logger.info(JSON.stringify({ requestId, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, durationMs: Date.now() - startedAt })));
    res.locals.url = new URL(req.originalUrl, 'http://localhost');
    next();
  };
}
