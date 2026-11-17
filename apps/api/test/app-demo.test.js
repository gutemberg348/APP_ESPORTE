import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, access } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { demoMatches, seedAppDemo } from '../prisma/app-demo-core.js';

test('demo schedule uses Patos date, every three days into the future at 19:00', () => {
  for (const instant of ['2026-11-17T12:00:00Z', '2026-12-31T01:30:00Z']) {
    const now = new Date(instant), matches = demoMatches(now);
    assert.equal(matches.length, 6);
    for (const [index, match] of matches.entries()) {
      assert.ok(match.startsAt > now); assert.equal(match.startsAt.getUTCHours(), 22);
      if (index) assert.equal(match.startsAt - matches[index - 1].startsAt, 3 * 86400000);
    }
  }
});

test('app demo is atomic, repeatable, audited and preserves admin edits, stock and shop settings', async t => {
  const pg = await PGlite.create(), migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(migrations, { withFileTypes: true })).filter(row => row.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  const images = JSON.parse(await readFile(new URL('../prisma/shop-demo-images.json', import.meta.url), 'utf8'));
  await assert.rejects(seedAppDemo(db, { images }), /administrador/);
  await db.user.create({ data: { name: 'Admin', email: 'demo@test.local', role: 'ADMIN', passwordHash: 'not-a-real-hash' } });
  await assert.rejects(seedAppDemo(db, { images: {} }));
  assert.equal(await db.match.count(), 0, 'invalid product must roll back games');
  await db.shopSettings.create({ data: { id: 'main' } });
  for (const key of ['camisa-torcedor', 'camisa-treino']) await access(new URL(`../public/shop/${images[key].split('/').pop()}`, import.meta.url));
  const first = await seedAppDemo(db, { images, enableShop: true, now: new Date('2026-11-17T12:00:00Z') });
  assert.equal(first.matchesCreated, 6); assert.equal(first.productsCreated, 5);
  assert.equal(await db.stockMovement.count(), 20);
  assert.equal((await db.shopSettings.findUnique({ where: { id: 'main' } })).enabled, true);
  assert.ok((await db.shopSettings.findUnique({ where: { id: 'main' } })).pickupAddress.includes('teste'));
  const match = await db.match.findFirst(), variant = await db.productVariant.findFirst();
  await db.productVariant.update({ where: { id: variant.id }, data: { stock: 3 } });
  await db.product.update({ where: { id: variant.productId }, data: { name: 'Editado pelo administrador', active: false } });
  await db.shopSettings.update({ where: { id: 'main' }, data: { enabled: false, mode: 'EXTERNAL', externalUrl: 'https://example.com', supportPhone: '83999999999' } });
  const second = await seedAppDemo(db, { images, now: new Date('2027-01-20T12:00:00Z') });
  assert.equal(second.matchesCreated, 0); assert.equal(second.productsCreated, 0);
  assert.equal(await db.stockMovement.count(), 20);
  assert.equal((await db.productVariant.findUnique({ where: { id: variant.id } })).stock, 3);
  assert.equal((await db.product.findUnique({ where: { id: variant.productId } })).active, false);
  assert.equal((await db.match.findUnique({ where: { id: match.id } })).startsAt.toISOString(), match.startsAt.toISOString());
  assert.equal((await db.shopSettings.findUnique({ where: { id: 'main' } })).mode, 'EXTERNAL');
  assert.equal(await db.auditLog.count({ where: { action: 'APP_DEMO_SEEDED' } }), 2);
});
