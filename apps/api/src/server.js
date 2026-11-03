import { createHttpServer } from './http/server.js';
import { env } from './config/env.js';
import { db } from './config/database.js';
import { routes } from './routes/index.js';
import { authService } from './services/auth.service.js';

const server = createHttpServer({ routes, authenticate: authService.authenticate, corsOrigins: env.corsOrigins, readiness: () => db.$queryRaw`SELECT 1` });
server.listen(env.PORT, env.HOST, () => console.log(`Nacional API: http://${env.HOST}:${env.PORT}`));
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => { await db.$disconnect(); clearTimeout(deadline); });
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
