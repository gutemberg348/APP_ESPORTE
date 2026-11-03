import { createRateLimiter } from '../rate-limit.js';
import { bearerToken } from '../authorization.js';
import { assertAdmin } from '../../lib/ticket-rules.js';
import { assertGateUser, assertGateRoute } from '../../lib/gate-rules.js';
import { AppError } from '../../lib/errors.js';

export function createAccessMiddleware(authenticate) {
  const limit = createRateLimiter();
  const authLimit = createRateLimiter({ max: 10, windowMs: 15 * 60000 });
  const refreshLimit = createRateLimiter({ max: 60, windowMs: 15 * 60000 });
  const gateLimit = createRateLimiter({ max: 90, windowMs: 60000 });
  function enforce(res, accepted, seconds, code, message) {
    if (accepted) return;
    res.set('Retry-After', String(seconds));
    throw new AppError(429, code, message);
  }
  return {
    general(req, res, next) {
      enforce(res, limit(req.socket.remoteAddress ?? 'unknown'), 60, 'RATE_LIMIT', 'Muitas requisições. Aguarde um minuto.');
      next();
    },
    route: (route) => async (req, res, next) => {
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (route.authLimit) enforce(res, authLimit(`${route.path}:${ip}`), 900, 'AUTH_RATE_LIMIT', 'Muitas tentativas. Aguarde 15 minutos.');
      if (route.refreshLimit) enforce(res, refreshLimit(ip), 900, 'REFRESH_RATE_LIMIT', 'Muitas renovações de sessão. Aguarde alguns minutos.');
      const auth = route.private ? await authenticate(bearerToken(req.headers.authorization)) : {};
      assertGateRoute(auth.user, route);
      if (route.admin) assertAdmin(auth.user);
      if (route.gate) {
        assertGateUser(auth.user);
        enforce(res, gateLimit(auth.user.id), 60, 'GATE_RATE_LIMIT', 'Muitas leituras. Aguarde um minuto.');
      }
      res.locals.auth = auth;
      next();
    },
  };
}
