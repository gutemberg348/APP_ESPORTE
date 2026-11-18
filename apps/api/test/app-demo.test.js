import { createShopStore } from '../src/models/shop.store.js';
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
  assert.equal(await db.estadioIngressoV1.count(), 0, 'V1 fixtures must also roll back');
  await db.shopSettings.create({ data: { id: 'main' } });
  for (const key of ['camisa-torcedor', 'camisa-treino']) await access(new URL(`../public/shop/${images[key].split('/').pop()}`, import.meta.url));
  const first = await seedAppDemo(db, { images, enableShop: true, now: new Date('2026-11-17T12:00:00Z') });
  assert.equal(first.matchesCreated, 6); assert.equal(first.productsCreated, 5);
  assert.deepEqual(first.v1, { templatesCreated: 2, stadiumsCreated: 1, salesTemplatesCreated: 1, matchesCreated: 6 });
  assert.equal(await db.assentoIngressoV1.count(), 20);
  const v1 = await db.partidaIngressoV1.findFirst({ include: { alocacoesSetor: { include: { lotes: true } } } });
  assert.equal(v1.status, 'PUBLICADA'); assert.equal(v1.vendasAtivas, true); assert.equal(v1.alocacoesSetor.length, 2);
  assert.ok(v1.alocacoesSetor.every(row => row.lotes.length === 2 && row.lotes.reduce((sum,lote) => sum + lote.quantidadeMaxima,0) === row.capacidadeLiberada));
  const stand = { name: 'Arquibancada · TESTE', match: { slug: { startsWith: 'app-teste-jogo-' } } };
  const demoLot = { alocacao: { setor: { nome: '[TESTE APP] Arquibancada' } } };
  assert.equal(await db.sector.count({ where: { ...stand, priceCents: 10 } }), 6);
  assert.equal(await db.loteIngressoPartidaV1.count({ where: { ...demoLot, tipoCategoria: 'INTEIRA', precoCentavos: 10 } }), 6);
  await db.sector.updateMany({ where: stand, data: { priceCents: 100 } });
  await db.sector.updateMany({ where: { ...stand, match: { slug: 'app-teste-jogo-1' } }, data: { priceCents: 1234 } });
  for (const [tipoCategoria, precoCentavos] of [['INTEIRA',100],['MEIA',50]]) {
    await db.loteIngressoPartidaV1.updateMany({ where: { ...demoLot, tipoCategoria }, data: { precoCentavos } });
  }
  await pg.exec(await readFile(new URL('20261118200000_demo_pix_ticket_price/migration.sql', migrations), 'utf8'));
  assert.equal(await db.sector.count({ where: { ...stand, priceCents: 10 } }), 5);
  assert.equal(await db.sector.count({ where: { ...stand, priceCents: 1234 } }), 1);
  for (const [tipoCategoria, precoCentavos] of [['INTEIRA',10],['MEIA',5]]) {
    assert.equal(await db.loteIngressoPartidaV1.count({ where: { ...demoLot, tipoCategoria, precoCentavos } }), 6);
  }
  const catalog = await createShopStore(db, { settings: {} }).products({ limit: 24, offset: 0 }, false);
  assert.equal(catalog.items.length, 5); assert.ok(catalog.items.every(row => row.images.length && row.variants.some(size => size.available > 0)));
  const stadium = await db.estadioIngressoV1.findFirst();
  await db.estadioIngressoV1.update({ where: { id: stadium.id }, data: { nome: 'Editado pelo admin', ativo: false } });
  await db.partidaIngressoV1.update({ where: { id: v1.id }, data: { vendasAtivas: false } });
  assert.equal(await db.stockMovement.count(), 20);
  assert.equal((await db.shopSettings.findUnique({ where: { id: 'main' } })).enabled, true);
  assert.ok((await db.shopSettings.findUnique({ where: { id: 'main' } })).pickupAddress.includes('teste'));
  const match = await db.match.findFirst(), variant = await db.productVariant.findFirst();
  await db.productVariant.update({ where: { id: variant.id }, data: { stock: 3 } });
  await db.product.update({ where: { id: variant.productId }, data: { name: 'Editado pelo administrador', active: false } });
  await db.shopSettings.update({ where: { id: 'main' }, data: { enabled: false, mode: 'EXTERNAL', externalUrl: 'https://example.com', supportPhone: '83999999999' } });
  const second = await seedAppDemo(db, { images, now: new Date('2027-01-20T12:00:00Z') });
  assert.equal(second.matchesCreated, 0); assert.equal(second.productsCreated, 0);
  assert.deepEqual(second.v1, { templatesCreated: 0, stadiumsCreated: 0, salesTemplatesCreated: 0, matchesCreated: 0 });
  assert.equal((await db.estadioIngressoV1.findUnique({ where: { id: stadium.id } })).nome, 'Editado pelo admin');
  assert.equal((await db.partidaIngressoV1.findUnique({ where: { id: v1.id } })).vendasAtivas, false);
  assert.equal(await db.templateSetorIngressoV1.count(), 2); assert.equal(await db.assentoIngressoV1.count(), 20);
  assert.equal(await db.stockMovement.count(), 20);
  assert.equal((await db.productVariant.findUnique({ where: { id: variant.id } })).stock, 3);
  assert.equal((await db.product.findUnique({ where: { id: variant.productId } })).active, false);
  assert.equal((await db.match.findUnique({ where: { id: match.id } })).startsAt.toISOString(), match.startsAt.toISOString());
  assert.equal((await db.shopSettings.findUnique({ where: { id: 'main' } })).mode, 'EXTERNAL');
  assert.equal(await db.auditLog.count({ where: { action: 'APP_DEMO_SEEDED' } }), 2);
});
