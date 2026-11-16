import { AppError } from '../../lib/errors.js';

export function cors(origins, allowDevelopmentOrigin = () => false) {
  const allowed = new Set(origins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    // Only Apple's browser form callback. It is authenticated by one-use state + OIDC nonce.
    // No CORS permission is granted to other API endpoints or to credentialed requests.
    if (origin === 'https://appleid.apple.com' && req.method === 'POST' && req.path === '/v1/auth/social/apple/callback') return next();
    if (origin) {
      if (!allowed.has(origin) && !allowDevelopmentOrigin(origin)) throw new AppError(403, 'ORIGIN_DENIED', 'Origem não permitida.');
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Expose-Headers': 'X-Request-Id',
      });
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}
