import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createShopStore } from '../src/models/shop.store.js';
import { createShopSkuStore } from '../src/models/shop-sku.store.js';
import { createAsaasStore } from '../src/models/asaas.store.js';
import * as schema from '../src/validators/shop.js';
import { createShippingProvider } from '../src/shipping/providers.js';
import { routes } from '../src/routes/index.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';
const baseProduct = { name: 'Camisa oficial', description: 'Produto teste', category: 'Camisas', images: [], priceCents: 9990, costCents: 4000, compareAtCents: null, weightGrams: 300, widthCm: 20, heightCm: 5, lengthCm: 25, active: true, featured: false, variants: [{ sku: 'CAM-M', label: 'M · Vermelha', lowStock: 2, initialStock: 5, active: true }] };
test('shop schemas reject forged totals, invalid contacts, links and duplicate variants', () => {
  assert.equal(schema.productSchema.safeParse(baseProduct).success, true);
  assert.equal(schema.productSchema.safeParse({ ...baseProduct, priceCents: -1 }).success, false);
  assert.equal(schema.productSchema.safeParse({ ...baseProduct, compareAtCents: 100 }).success, false);
  assert.equal(schema.productSchema.safeParse({ ...baseProduct, images: ['javascript:alert(1)'] }).success, false);
  assert.equal(schema.productSchema.safeParse({ ...baseProduct, variants: [baseProduct.variants[0], baseProduct.variants[0]] }).success, false);
  assert.equal(schema.cartSchema.safeParse({ items: [{ variantId: randomUUID(), quantity: 0 }], deliveryMethod: 'PICKUP' }).success, false);
  const variantId = randomUUID();
  assert.equal(schema.cartSchema.safeParse({ items: [{ variantId, quantity: 1 }, { variantId, quantity: 2 }], deliveryMethod: 'PICKUP' }).success, false);
  assert.equal(schema.cartSchema.safeParse({ items: [{ variantId, quantity: 1 }], deliveryMethod: 'DELIVERY', postalCode: '123' }).success, false);
});
test('shipping adapter sends only server-side catalog data and filters unavailable or invalid services', async () => {
  let sent;
  const shipping = createShippingProvider({ settings: { MELHOR_ENVIO_ENVIRONMENT: 'sandbox', MELHOR_ENVIO_TOKEN: 'private-token', MELHOR_ENVIO_CONTACT_EMAIL: 'test@example.com', MELHOR_ENVIO_SERVICES: '1,2' }, fetch: async (url, options) => { sent = { url, ...options }; return { ok: true, json: async () => [{ id: 1, name: 'PAC', company: { name: 'Correios' }, price: '20.50', custom_price: '19.90', delivery_time: 5, custom_delivery_time: 4, packages: [] }, { id: 2, error: 'Unavailable' }, { id: 9, price: '-1', delivery_time: 5 }] }; } });
  const options = await shipping.quote('58700000', '01001000', [{ variant: { id: 'variant', product: baseProduct }, quantity: 2 }]);
  assert.equal(options.length, 1); assert.equal(options[0].amountCents, 1990); assert.equal(options[0].maxDays, 4); assert.equal(options[0].testMode, true);
  assert.equal(sent.url, 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate'); assert.equal(sent.headers.Authorization, 'Bearer private-token');
  assert.equal(JSON.parse(sent.body).products[0].weight, 0.3); assert.equal(JSON.parse(sent.body).products[0].insurance_value, 99.9);
  const unavailable = createShippingProvider({ settings: {}, fetch: async () => { throw new Error('must not call'); } });
  await assert.rejects(unavailable.quote('58700000', '01001000', []), { code: 'SHIPPING_NOT_CONFIGURED' });
  const cep = createShippingProvider({ settings: {}, fetch: async () => ({ ok: true, json: async () => ({ erro: true }) }) });
  await assert.rejects(cep.postalCode('00000000'), { code: 'POSTAL_CODE_NOT_FOUND' });
});
test('shop administrative routes reject fan and gate sessions before database access', async () => {
  let role = 'USER';
  const app = createApp({ routes, logger: { info() {}, error() {} }, authenticate: async () => ({ user: { id: randomUUID(), role, active: true } }) });
  const headers = { Authorization: 'Bearer test.header.signature', 'Content-Type': 'application/json' };
  for (const route of routes.filter((route) => route.path.startsWith('/v1/admin/shop'))) assert.equal((await inject(app, route.path, { method: route.method, headers, body: ['POST','PATCH','PUT','DELETE'].includes(route.method) ? '{}' : undefined })).status, 403);
  role = 'GATE'; assert.equal((await inject(app, '/v1/shop/orders', { headers })).status, 403);
  role = 'ADMIN'; const invalid = await inject(app, '/v1/admin/shop/products', { method: 'POST', headers, body: JSON.stringify({ ...baseProduct, priceCents: -1 }) }); assert.equal(invalid.status, 422);
  const large = await inject(app, '/v1/admin/shop/products', { method: 'POST', headers, body: JSON.stringify({ ...baseProduct, description: 'a'.repeat(18000) }) }); assert.equal(large.status, 422, 'authorized product form uses scoped 64 KB body parser, then strict field validation');
});
test('shop lifecycle conserves inventory, immutable receipts, reservations and refunds in isolated PostgreSQL', { timeout: 120000 }, async (t) => {
  const pg = await PGlite.create(), migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(migrations, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  let clock = new Date(), counter = 0, remoteCounter = 0, refunds = 0;
  const runtime = { PAYMENT_MODE: 'asaas', ASAAS_ENVIRONMENT: 'sandbox', ASAAS_DATA_SECRET: 'a'.repeat(64), ASAAS_WEBHOOK_TOKEN: 'b'.repeat(64) };
  const store = createShopStore(db, { now: () => clock, settings: runtime, shipping: { quote: async () => [{ id: 'melhorenvio:1', name: 'Correios · PAC', amountCents: 2000, minDays: 4, maxDays: 7, testMode: true }] } });
  const users = await Promise.all(['ADMIN','USER','USER'].map((role, index) => db.user.create({ data: { name: 'Pessoa teste', email: `shop${index}@test.local`, passwordHash: 'test', role } })));
  const [admin, user, other] = users;
  await t.test('SKU suggestions avoid unsaved, existing, inactive and archived references; saving never duplicates a SKU', async () => {
    const existing = await store.saveProduct(admin.id, schema.productSchema.parse({ ...baseProduct, active: false, variants: [{ ...baseProduct.variants[0], sku: 'PRD-TAKEN', active: false }] }));
    await store.archive(admin.id, { id: existing.id, version: existing.version, reason: 'Teste de referência arquivada' });
    const candidates = ['PRD-DRAFT', 'PRD-TAKEN', 'PRD-FREE'];
    const skus = createShopSkuStore(db, { candidate: () => candidates.shift() });
    assert.equal((await skus.generate(['PRD-DRAFT'])).sku, 'PRD-FREE');
    assert.deepEqual(await skus.check([{ sku: 'PRD-FREE' }, { sku: 'PRD-TAKEN' }, { sku: 'PRD-TAKEN', variantId: existing.variants[0].id }]), [{ sku: 'PRD-FREE', status: 'AVAILABLE' }, { sku: 'PRD-TAKEN', status: 'USED' }, { sku: 'PRD-TAKEN', status: 'CURRENT' }]);
    await assert.rejects(store.saveProduct(admin.id, schema.productSchema.parse({ ...baseProduct, variants: [{ ...baseProduct.variants[0], sku: 'prd-taken' }] })), { code: 'SHOP_SKU_IN_USE' });
    assert.equal(await db.productVariant.count({ where: { sku: 'PRD-TAKEN' } }), 1);
    const failed = createShopSkuStore(db, { candidate: () => 'PRD-TAKEN' });
    await assert.rejects(failed.generate(), { code: 'SHOP_SKU_GENERATION_FAILED' });
    const generated = await Promise.all(Array.from({ length: 20 }, () => createShopSkuStore(db).generate()));
    assert.equal(new Set(generated.map((row) => row.sku)).size, 20);
    const before = await db.product.count();
    const duplicate = schema.productSchema.parse({ ...baseProduct, variants: [{ ...baseProduct.variants[0], sku: 'PRD-RACE' }] });
    const attempts = await Promise.allSettled([store.saveProduct(admin.id, duplicate), store.saveProduct(admin.id, duplicate)]);
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(await db.product.count(), before + 1);
    assert.equal(await db.productVariant.count({ where: { sku: 'PRD-RACE' } }), 1);
    const rejected = attempts.find((r) => r.status === 'rejected'); assert.equal(rejected.reason.code, 'SHOP_SKU_IN_USE');
    assert.equal(schema.generateSkuSchema.safeParse({ excludeSkus: Array(51).fill('X') }).success, false);
    assert.equal(schema.checkSkusSchema.safeParse({ items: [{ sku: ' a-b ' }] }).data.items[0].sku, 'A-B');
  });
  const config = schema.settingsSchema.parse({ name: 'Loja oficial', mode: 'INTERNAL', enabled: true, externalUrl: '', pickupEnabled: true, pickupAddress: 'Rua do clube, 10, Patos/PB', shippingProvider: 'RULES', originPostalCode: '58700000', paymentInstructions: 'Fale com o atendimento', supportPhone: '(83) 99999-9999' });
  await store.saveSettings(admin.id, config);
  const customerMap = new Map(), remoteMap = new Map();
  const api = {
    findCustomer: async (ref) => ({ data: [...customerMap.values()].filter((row) => row.externalReference === ref) }), createCustomer: async (body) => { const row = { ...body, id: `cus_${customerMap.size + 1}` }; customerMap.set(row.id, row); return row; },
    findPayments: async (ref) => ({ data: [...remoteMap.values()].filter((row) => row.externalReference === ref) }), createPayment: async (body) => { const row = { ...body, id: `pay_shop_${++remoteCounter}`, status: 'PENDING', netValue: body.value }; remoteMap.set(row.id, row); return structuredClone(row); },
    payment: async (id) => structuredClone(remoteMap.get(id)), pix: async () => ({ payload: '000201-pix-test-shop-without-real-value' }), cancel: async (id) => { remoteMap.get(id).deleted = true; }, refund: async (id, value) => { refunds++; Object.assign(remoteMap.get(id), { status: 'REFUNDED', refunds: [{ value, status: 'DONE' }] }); },
  };
  const asaas = createAsaasStore(db, { settings: runtime, api, now: () => clock });
  await asaas.saveProfile(user.id, '52998224725');
  async function product(stock = 5, price = 9990) { return store.saveProduct(admin.id, schema.productSchema.parse({ ...baseProduct, priceCents: price, variants: [{ ...baseProduct.variants[0], sku: `CAM-${++counter}`, initialStock: stock }] })); }
  async function purchase(value, { buyer = user, quantity = 1, method = 'PICKUP', postalCode = '' } = {}) {
    const cart = { items: [{ variantId: value.variants[0].id, quantity }], deliveryMethod: method, postalCode };
    const quote = await store.quote(buyer.id, schema.cartSchema.parse(cart));
    const body = schema.checkoutSchema.parse({ ...cart, quoteId: quote.id, shippingOptionId: quote.options[0].id, expectedTotalCents: quote.options[0].totalCents, recipient: buyer.name, phone: '(83) 99999-9999', ...(method === 'DELIVERY' ? { address: { postalCode, street: 'Rua teste', number: '1', complement: '', district: 'Centro', city: 'São Paulo', state: 'SP' } } : {}), requestKey: randomUUID() });
    return { order: await store.reserve(buyer.id, body), body, quote };
  }
  async function receive(order) { const intent = await asaas.shopPix(user.id, order.id); await asaas.process(intent.id); const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); remoteMap.get(raw.providerReference).status = 'RECEIVED'; await asaas.process(intent.id); return { intent, raw }; }
  await t.test('catalog hides internal cost and checkout is idempotent without duplicate holds', async () => {
    const value = await product(3), { order, body } = await purchase(value, { quantity: 2 });
    assert.equal((await store.reserve(user.id, body)).id, order.id); assert.equal(await db.shopOrder.count({ where: { id: order.id } }), 1);
    await assert.rejects(store.reserve(user.id, { ...body, recipient: 'Nome alterado' }), { code: 'SHOP_OPERATION_CONFLICT' });
    const list = await store.products({ limit: 100, offset: 0 }, false), item = list.items.find((row) => row.id === value.id);
    assert.equal(Object.hasOwn(item, 'costCents'), false); assert.equal(Object.hasOwn(item.variants[0], 'stock'), false); assert.equal(item.variants[0].available, 1);
    assert.equal(Object.hasOwn(order.items[0], 'costCents'), false); assert.equal(Object.hasOwn(order, 'requestHash'), false);
    await assert.rejects(purchase(value, { buyer: other, quantity: 2 }), { code: 'SHOP_OUT_OF_STOCK' });
    assert.equal((await store.orders(other.id, { limit: 25, offset: 0 })).items.some((row) => row.id === order.id), false);
    await assert.rejects(store.cancel(other.id, order.id), { code: 'SHOP_NOT_FOUND' });
    await store.cancel(user.id, order.id); assert.equal((await store.products({ limit: 100, offset: 0 }, false)).items.find((row) => row.id === value.id).variants[0].available, 3);
  });
  await t.test('server quotes include configured freight and reject forged shipping, stale price or another user', async () => {
    await store.saveShippingRule(admin.id, schema.shippingSchema.parse({ name: 'Entrega Brasil', postalCodeFrom: '00000000', postalCodeTo: '99999999', baseCents: 1000, perKgCents: 200, freeAboveCents: null, minDays: 2, maxDays: 7, active: true }));
    const value = await product(), { order, body } = await purchase(value, { method: 'DELIVERY', postalCode: '01001000' }); assert.equal(order.shippingCents, 1200); assert.equal(order.totalCents, 11190);
    await store.cancel(user.id, order.id);
    await assert.rejects(store.reserve(other.id, { ...body, requestKey: randomUUID() }), { code: 'SHOP_QUOTE_EXPIRED' });
    await assert.rejects(store.reserve(user.id, { ...body, requestKey: randomUUID(), shippingOptionId: 'free' }), { code: 'SHOP_INVALID_SHIPPING' });
    await assert.rejects(store.reserve(user.id, { ...body, requestKey: randomUUID(), expectedTotalCents: 1 }), { code: 'SHOP_PRICE_CHANGED' });
    await db.product.update({ where: { id: value.id }, data: { priceCents: 10000, version: { increment: 1 } } });
    await assert.rejects(store.reserve(user.id, { ...body, requestKey: randomUUID() }), { code: 'SHOP_QUOTE_EXPIRED' });
  });
  await t.test('two valid quotes for the last unit cannot both reserve it', async () => {
    const value = await product(1), cart = { items: [{ variantId: value.variants[0].id, quantity: 1 }], deliveryMethod: 'PICKUP', postalCode: '' };
    const buyers = [user, other], quotes = [];
    for (const buyer of buyers) quotes.push(await store.quote(buyer.id, cart));
    const attempts = await Promise.allSettled(buyers.map((buyer, index) => store.reserve(buyer.id, { ...cart, quoteId: quotes[index].id, shippingOptionId: 'pickup', expectedTotalCents: value.priceCents, recipient: buyer.name, phone: '83999999999', requestKey: randomUUID() })));
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.find((result) => result.status === 'rejected').reason.code, 'SHOP_OUT_OF_STOCK');
    const winner = attempts.find((result) => result.status === 'fulfilled').value; await store.cancel(winner.userId, winner.id);
  });
  await t.test('audit failure rolls back a multi-product payment and all stock deductions', async () => {
    const first = await product(3), second = await product(3), cart = { items: [first, second].map((value) => ({ variantId: value.variants[0].id, quantity: 1 })), deliveryMethod: 'PICKUP', postalCode: '' };
    const quote = await store.quote(user.id, cart), order = await store.reserve(user.id, { ...cart, quoteId: quote.id, shippingOptionId: 'pickup', expectedTotalCents: quote.subtotalCents, recipient: user.name, phone: '83999999999', requestKey: randomUUID() });
    const broken = db.$extends({ query: { auditLog: { async create({ args, query }) { if (args.data.action === 'SHOP_PAYMENT_CONFIRMED') throw new Error('audit offline'); return query(args); } } } });
    await assert.rejects(createShopStore(broken, { now: () => clock, settings: runtime }).confirm(admin.id, { orderId: order.id, receivedCents: order.totalCents, reference: randomUUID(), reason: 'Teste de atomicidade', paymentVerified: true }), /audit offline/);
    assert.equal(await db.shopPayment.count({ where: { orderId: order.id } }), 0); assert.equal(await db.stockMovement.count({ where: { orderId: order.id } }), 0);
    for (const value of [first, second]) assert.equal((await db.productVariant.findUnique({ where: { id: value.variants[0].id } })).stock, 3);
    await store.cancel(user.id, order.id);
  });
  await t.test('inventory adjustment protects reserved stock, versions and replay', async () => {
    const value = await product(5), variant = value.variants[0], { order } = await purchase(value, { quantity: 3 });
    await assert.rejects(store.adjustStock(admin.id, { variantId: variant.id, version: 0, quantity: -3, reason: 'Baixa de teste', requestKey: randomUUID() }), { code: 'SHOP_STOCK_RESERVED' });
    const input = { variantId: variant.id, version: 0, quantity: 2, reason: 'Entrada de mercadoria', requestKey: randomUUID() };
    const entry = await store.adjustStock(admin.id, input); assert.equal(entry.balanceAfter, 7); assert.equal((await store.adjustStock(admin.id, input)).id, entry.id);
    await assert.rejects(store.adjustStock(admin.id, { ...input, quantity: 3 }), { code: 'SHOP_OPERATION_CONFLICT' });
    await assert.rejects(store.adjustStock(admin.id, { ...input, requestKey: randomUUID() }), { code: 'SHOP_STALE' });
    await store.cancel(user.id, order.id);
  });
  await t.test('manual payment decrements once, fulfillment requires payment and uses valid transitions', async () => {
    const value = await product(4), { order } = await purchase(value, { quantity: 2 });
    const transition = { orderId: order.id, version: order.version, status: 'PREPARING', trackingCode: '', trackingUrl: '', notes: '', reason: 'Teste de separação' };
    await assert.rejects(store.fulfill(admin.id, transition), { code: 'SHOP_PAYMENT_REQUIRED' });
    const input = { orderId: order.id, receivedCents: order.totalCents, reference: randomUUID(), reason: 'Caixa conferido', paymentVerified: true };
    await assert.rejects(store.confirm(admin.id, { ...input, receivedCents: 1 }), { code: 'SHOP_NOT_PAYABLE' });
    const paid = await store.confirm(admin.id, input); await store.confirm(admin.id, input);
    assert.equal(await db.shopPayment.count({ where: { orderId: order.id } }), 1); assert.equal((await db.productVariant.findUnique({ where: { id: value.variants[0].id } })).stock, 2);
    await assert.rejects(store.cancel(user.id, order.id), { code: 'SHOP_CANCEL_PAID' });
    await assert.rejects(store.fulfill(admin.id, { ...transition, version: paid.version, status: 'SHIPPED' }), { code: 'SHOP_INVALID_TRANSITION' });
    const ready = await store.fulfill(admin.id, { ...transition, version: paid.version, status: 'READY' });
    const delivered = await store.fulfill(admin.id, { ...transition, version: ready.version, status: 'DELIVERED' }); assert.equal(delivered.status, 'DELIVERED');
  });
  await t.test('free orders settle atomically and expired reservations release without deducting stock', async () => {
    const free = await product(2, 0), { order } = await purchase(free); assert.equal(order.status, 'PAID'); assert.equal(order.payment.method, 'FREE');
    const value = await product(1), reservation = await purchase(value); clock = new Date(clock.getTime() + 31 * 60000);
    assert.equal((await store.orders(user.id, { limit: 100, offset: 0 })).items.find((row) => row.id === reservation.order.id).status, 'EXPIRED');
    assert.equal((await purchase(value, { buyer: other })).order.status, 'PENDING');
  });
  await t.test('manual refunds require full receipt, preserve original payment and restore inventory idempotently', async () => {
    const value = await product(3), { order } = await purchase(value, { quantity: 2 });
    await store.confirm(admin.id, { orderId: order.id, receivedCents: order.totalCents, reference: randomUUID(), reason: 'Conferido no caixa', paymentVerified: true });
    const input = { orderId: order.id, refundedCents: order.totalCents, reference: randomUUID(), reason: 'Devolução já transferida ao comprador', refundVerified: true };
    await assert.rejects(store.refundManual(admin.id, { ...input, refundedCents: 1 }), { code: 'SHOP_REFUND_AMOUNT' });
    const refunded = await store.refundManual(admin.id, input); assert.equal(refunded.status, 'REFUNDED'); assert.equal(refunded.payment.method, 'MANUAL'); assert.equal(refunded.payment.refundedCents, order.totalCents);
    await store.refundManual(admin.id, input);
    assert.equal((await db.productVariant.findUnique({ where: { id: value.variants[0].id } })).stock, 3); assert.equal(await db.stockMovement.count({ where: { orderId: order.id, kind: 'RETURN' } }), 1);
    await assert.rejects(store.refundManual(admin.id, { ...input, reference: randomUUID() }), { code: 'SHOP_ALREADY_REFUNDED' });
  });
  await t.test('Pix webhook settles a shop order once and full refund before shipment restores stock once', async () => {
    const value = await product(3), { order } = await purchase(value, { quantity: 2 });
    const intent = await asaas.shopPix(user.id, order.id); assert.equal((await asaas.shopPix(user.id, order.id)).id, intent.id);
    await asaas.process(intent.id); await assert.rejects(asaas.ownIntent(other.id, intent.id), { code: 'PAYMENT_NOT_FOUND' });
    await assert.rejects(store.confirm(admin.id, { orderId: order.id, receivedCents: order.totalCents, reference: randomUUID(), reason: 'Teste bloqueio', paymentVerified: true }), { code: 'PIX_IN_PROGRESS' });
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), remote = remoteMap.get(raw.providerReference); remote.status = 'RECEIVED';
    await asaas.webhook(runtime.ASAAS_WEBHOOK_TOKEN, { id: randomUUID(), event: 'PAYMENT_RECEIVED', payment: { id: remote.id, externalReference: remote.externalReference } }); await asaas.tick(); await asaas.process(intent.id);
    assert.equal((await db.productVariant.findUnique({ where: { id: value.variants[0].id } })).stock, 1); assert.equal(await db.shopPayment.count({ where: { orderId: order.id } }), 1);
    await asaas.requestRefund(admin.id, intent.id, 'Devolução solicitada'); const blocked = await db.shopOrder.findUnique({ where: { id: order.id } }); assert.equal(blocked.status, 'REFUND_REVIEW');
    await assert.rejects(store.fulfill(admin.id, { orderId: order.id, version: blocked.version, status: 'PREPARING', reason: 'Separação', trackingCode: '', trackingUrl: '', notes: '' }), { code: 'SHOP_PAYMENT_REQUIRED' });
    const before = refunds; await asaas.process(intent.id); await asaas.process(intent.id); assert.equal(refunds, before + 1);
    assert.equal((await db.shopOrder.findUnique({ where: { id: order.id } })).status, 'REFUNDED'); assert.equal((await db.productVariant.findUnique({ where: { id: value.variants[0].id } })).stock, 3);
    assert.equal(await db.stockMovement.count({ where: { orderId: order.id, kind: 'RETURN' } }), 1);
  });
  await t.test('late shop payment refunds without consuming stock or interfering with a newer reservation', async () => {
    const value = await product(1), { order } = await purchase(value); const intent = await asaas.shopPix(user.id, order.id); await asaas.process(intent.id);
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), remote = remoteMap.get(raw.providerReference); remote.status = 'RECEIVED';
    clock = new Date(clock.getTime() + 31 * 60000); await purchase(value, { buyer: other }); await asaas.process(intent.id);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).state, 'REFUNDED'); assert.equal(await db.shopPayment.count({ where: { orderId: order.id } }), 0); assert.equal((await db.productVariant.findUnique({ where: { id: value.variants[0].id } })).stock, 1);
  });
  await t.test('shipped goods are not restocked automatically after refund; snapshots retain original product values', async () => {
    const value = await product(3), { order } = await purchase(value, { method: 'DELIVERY', postalCode: '01001000' }), { intent } = await receive(order);
    const paid = await db.shopOrder.findUnique({ where: { id: order.id } }), body = { orderId: order.id, version: paid.version, status: 'PREPARING', reason: 'Separado para envio', trackingCode: '', trackingUrl: '', notes: '' };
    const preparing = await store.fulfill(admin.id, body);
    await assert.rejects(store.fulfill(admin.id, { ...body, version: preparing.version, status: 'SHIPPED' }), { code: 'SHOP_TRACKING_REQUIRED' });
    await store.fulfill(admin.id, { ...body, version: preparing.version, status: 'SHIPPED', trackingCode: 'AB123456789BR', trackingUrl: 'https://www.correios.com.br/' });
    await db.product.update({ where: { id: value.id }, data: { name: 'Nome novo', priceCents: 19990 } });
    await asaas.requestRefund(admin.id, intent.id, 'Devolução em trânsito'); await asaas.process(intent.id);
    assert.equal((await db.productVariant.findUnique({ where: { id: value.variants[0].id } })).stock, 2); assert.equal(await db.stockMovement.count({ where: { orderId: order.id, kind: 'RETURN' } }), 0);
    assert.equal((await db.shopOrderItem.findFirst({ where: { orderId: order.id } })).productName, 'Camisa oficial');
  });
  await t.test('archiving keeps order history and stale product edits cannot overwrite new values', async () => {
    const value = await product(), { order } = await purchase(value);
    await store.archive(admin.id, { id: value.id, version: value.version, reason: 'Descontinuado' });
    assert.equal((await store.products({ limit: 100, offset: 0 }, true)).items.some((row) => row.id === value.id), false);
    assert.ok(await db.shopOrder.findUnique({ where: { id: order.id } }));
    const otherProduct = await product();
    await assert.rejects(store.saveProduct(admin.id, { ...schema.productSchema.parse(baseProduct), id: otherProduct.id, version: 99 }), { code: 'SHOP_STALE' });
    // Exercise the database CHECK directly; no invalid write reaches the model's validated adjustment API.
    await assert.rejects(pg.query('UPDATE "ProductVariant" SET "stock" = -1 WHERE "id" = $1', [otherProduct.variants[0].id]));
  });
  await t.test('closing or redirecting the store rejects internal checkout while past orders remain accessible', async () => {
    const value = await product(), { order } = await purchase(value);
    const cart = { items: [{ variantId: value.variants[0].id, quantity: 1 }], deliveryMethod: 'PICKUP', postalCode: '' };
    await store.saveSettings(admin.id, { ...config, enabled: false }); await assert.rejects(store.quote(user.id, cart), { code: 'SHOP_CLOSED' });
    await store.saveSettings(admin.id, { ...config, mode: 'EXTERNAL', externalUrl: 'https://example.com/loja' }); await assert.rejects(store.quote(user.id, cart), { code: 'SHOP_CLOSED' });
    assert.ok((await store.orders(user.id, { limit: 100, offset: 0 })).items.find((item) => item.id === order.id));
    await store.cancel(user.id, order.id); await store.saveSettings(admin.id, config);
    await db.user.update({ where: { id: other.id }, data: { active: false } });
    await assert.rejects(store.quote(other.id, cart), { code: 'SHOP_ACCOUNT_REQUIRED' });
  });
});
