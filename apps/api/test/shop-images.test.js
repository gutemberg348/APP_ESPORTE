import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { SHOP_IMAGE_MAX_BYTES } from '@nacional/shared/shop-media';
import { normalizeShopImage } from '../src/lib/shop-images.js';
import { shopImageUploadSchema } from '../src/validators/shop-images.js';
import { productImage } from '../src/validators/shop.js';
import { createShopImageStore } from '../src/models/shop-image.store.js';
import { createShopStore } from '../src/models/shop.store.js';
import { createShopImageController } from '../src/controllers/shop-image.controller.js';
import { createApp } from '../src/http/app.js';
import { routes } from '../src/routes/index.js';
import { inject } from './helpers/inject.js';
const image = (format = 'png', width = 320, height = 180) => sharp({ create: { width, height, channels: 4, background: { r: 190, g: 30, b: 45, alpha: 1 } } }).toFormat(format).toBuffer();
const input = async (format = 'png') => ({ mimeType: `image/${format === 'jpg' ? 'jpeg' : format}`, base64: (await image(format)).toString('base64') });

test('image normalization decodes real files, rejects forged/truncated/oversized content and strips original metadata', async () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const row = await normalizeShopImage(await input(format));
    const meta = await sharp(row.content).metadata();
    assert.equal(meta.format, 'webp'); assert.equal(row.byteLength, row.content.length);
    assert.equal(row.width, 320); assert.equal(row.height, 180); assert.match(row.sha256, /^[a-f0-9]{64}$/);
  }
  const original = await sharp({ create: { width: 3000, height: 60, channels: 3, background: 'red' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await normalizeShopImage({ mimeType: 'image/jpeg', base64: original.toString('base64') });
  const meta = await sharp(result.content).metadata();
  assert.ok(result.width <= 2000 && result.height <= 2000); assert.ok(result.height > result.width);
  assert.equal(meta.exif, undefined); assert.equal(meta.orientation, undefined);
  for (const base64 of [Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'), Buffer.from('%PDF-1.4 invalid').toString('base64'), Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')])
    await assert.rejects(normalizeShopImage({ mimeType: 'image/png', base64 }), { code: 'INVALID_PRODUCT_IMAGE' });
  await assert.rejects(normalizeShopImage({ ...(await input('jpeg')), mimeType: 'image/png' }), { code: 'INVALID_PRODUCT_IMAGE' });
  await assert.rejects(normalizeShopImage({ mimeType: 'image/png', base64: Buffer.alloc(SHOP_IMAGE_MAX_BYTES + 1).toString('base64') }), { code: 'INVALID_PRODUCT_IMAGE' });
  assert.equal(shopImageUploadSchema.safeParse({ mimeType: 'image/svg+xml', base64: 'AAAA' }).success, false);
  assert.equal(shopImageUploadSchema.safeParse({ mimeType: 'image/png', base64: 'invalid base64' }).success, false);
  assert.equal(shopImageUploadSchema.safeParse({ mimeType: 'image/png', base64: Buffer.alloc(SHOP_IMAGE_MAX_BYTES).toString('base64') }).success, true, 'maximum-size base64 validation does not overflow the regexp stack');
  assert.equal(shopImageUploadSchema.safeParse({ ...(await input()), url: 'http://internal/' }).success, false);
  const photo = await input();
  const first = normalizeShopImage(photo), second = normalizeShopImage(photo);
  await assert.rejects(normalizeShopImage(photo), { code: 'SHOP_IMAGE_BUSY' });
  await Promise.all([first, second]);
  assert.ok((await normalizeShopImage(photo)).byteLength > 0, 'processing slots are released');
});

test('product image uploads are administrator-only and unauthorized large bodies are rejected before parsing', async () => {
  const headers = { Authorization: 'Bearer test.header.signature', 'Content-Type': 'application/json' };
  for (const role of ['USER', 'GATE', 'CASHIER']) {
    const app = createApp({ routes, logger: { info() {}, error() {} }, authenticate: async () => ({ user: { id: randomUUID(), role, active: true } }) });
    assert.equal((await inject(app, '/v1/admin/shop/images', { method: 'POST', headers, body: '{' })).status, 403);
  }
  const app = createApp({ routes, logger: { info() {}, error() {} }, authenticate: async () => ({ user: { id: randomUUID(), role: 'ADMIN', active: true } }) });
  assert.equal((await inject(app, '/v1/admin/shop/images', { method: 'POST', headers, body: JSON.stringify({ mimeType: 'image/svg+xml', base64: 'AAAA' }) })).status, 422);
  assert.equal((await inject(app, '/v1/admin/shop/images', { method: 'POST', headers, body: JSON.stringify({ mimeType: 'image/png', base64: 'a'.repeat(7100000) }) })).status, 413);
});

test('uploaded photos persist in PostgreSQL, deduplicate and serve immutable binary content without bloating product records', { timeout: 120000 }, async (t) => {
  const pg = await PGlite.create(), migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(migrations, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1, connectionTimeoutMillis: 5000 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  const user = await db.user.create({ data: { name: 'Admin de imagens', email: 'shop-images@test.local', passwordHash: 'test-only', role: 'ADMIN' } });
  const store = createShopImageStore(db), controller = createShopImageController(store);
  const app = createApp({ routes: routes.filter((r) => r.path === '/v1/admin/shop/images' || r.binary).map((r) => ({ ...r, handler: r.binary ? controller.read : controller.upload })), logger: { info() {}, error() {} }, corsOrigins: ['http://localhost:8081'], authenticate: async () => ({ user: { ...user, active: true } }) });
  const payload = await input();
  const upload = await inject(app, '/v1/admin/shop/images', { method: 'POST', headers: { Authorization: 'Bearer test.header.signature', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(upload.status, 201); const saved = (await upload.json()).data;
  assert.equal(productImage.safeParse(saved.url).success, true); assert.equal(saved.content, undefined); assert.equal(saved.base64, undefined);
  assert.equal((await store.upload(user.id, payload)).id, saved.id); assert.equal(await db.shopImage.count(), 1);
  const binary = await inject(app, saved.url, { headers: { Origin: 'http://localhost:8081' } });
  assert.equal(binary.status, 200); assert.equal(binary.headers.get('content-type'), 'image/webp');
  assert.equal(binary.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(binary.headers.get('x-content-type-options'), 'nosniff'); assert.equal(binary.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  const stored = await store.read(saved.id); assert.deepEqual(binary.bytes, Buffer.from(stored.content));
  assert.equal((await sharp(binary.bytes).metadata()).width, 320);
  assert.equal((await inject(app, `/media/shop/upload-${randomUUID()}.webp`)).status, 404);
  assert.equal((await inject(app, '/media/shop/upload-invalid.webp')).status, 404);
  const shop = createShopStore(db);
  const productInput = { name: 'Produto com upload', images: [saved.url], priceCents: 3000, description: '', category: 'Teste', costCents: 0, compareAtCents: null, weightGrams: 300, widthCm: 20, heightCm: 5, lengthCm: 25, active: true, featured: false, variants: [{ sku: 'UPLOAD-TEST', label: 'Único', active: true, initialStock: 1, lowStock: 0 }] };
  await assert.rejects(shop.saveProduct(user.id, { ...productInput, images: [`/media/shop/upload-${randomUUID()}.webp`] }), { code: 'SHOP_IMAGE_NOT_FOUND' });
  const product = await shop.saveProduct(user.id, productInput);
  assert.deepEqual(product.images, [saved.url]);
  await db.product.update({ where: { id: product.id }, data: { images: [] } });
  assert.equal((await inject(app, saved.url)).status, 200, 'removing a photo from a product preserves historic order image URLs');
  assert.equal(await db.auditLog.count({ where: { action: 'SHOP_IMAGE_UPLOADED', actorId: user.id } }), 2);
});
