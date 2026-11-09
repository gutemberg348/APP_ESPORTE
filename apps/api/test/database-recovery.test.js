import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';

test('the PostgreSQL adapter reconnects after a database socket interruption without recreating Prisma', { timeout: 60000 }, async (t) => {
  const pg = await PGlite.create();
  let socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0, maxConnections: 1 });
  await socket.start();
  const address = socket.getServerConn(), port = Number(address.split(':').pop());
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${address}/postgres`, max: 1, connectionTimeoutMillis: 5000 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  assert.equal((await db.$queryRaw`SELECT 1 AS value`)[0].value, 1);
  await socket.stop();
  await assert.rejects(db.$queryRaw`SELECT 1 AS value`);
  socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port, maxConnections: 1 });
  await socket.start();
  assert.equal((await db.$queryRaw`SELECT 1 AS value`)[0].value, 1);
});
