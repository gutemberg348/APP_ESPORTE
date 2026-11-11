import { createHttpServer } from './http/server.js';
import { env } from './config/env.js';
import { db } from './config/database.js';
import { routes } from './routes/index.js';
import { authService } from './services/auth.service.js';
import { startPaymentWorker } from './services/pix.service.js';
import { startMailWorker } from './services/password-recovery.service.js';
import { createDevelopmentOriginPolicy } from './http/development-origins.js';

const server = createHttpServer({ routes, authenticate: authService.authenticate, corsOrigins: env.corsOrigins, trustProxy: env.TRUST_PROXY, allowDevelopmentOrigin: createDevelopmentOriginPolicy({ enabled: env.NODE_ENV === 'development', origins: env.corsOrigins }), readiness: () => db.$queryRaw`SELECT 1` });
let stopPaymentWorker = async () => {};
let stopMailWorker = async () => {};
server.listen(env.PORT, env.HOST, () => { console.log(`Nacional API: http://${env.HOST}:${env.PORT}`); stopPaymentWorker = startPaymentWorker(); stopMailWorker = startMailWorker(); });
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => { await Promise.all([stopPaymentWorker(), stopMailWorker()]); await db.$disconnect(); clearTimeout(deadline); });
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
