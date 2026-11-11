import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createSicrediStore } from '../src/models/sicredi.store.js';
import { createAsaasStore } from '../src/models/asaas.store.js';
import { createTicketCheckoutStore } from '../src/models/ticket-checkout.store.js';
import { createPaymentModel } from '../src/models/payment.model.js';
import { createPixQueries } from '../src/services/pix.service.js';
import { assertTicketPaid } from '../src/lib/ticket-rules.js';
import { AppError } from '../src/lib/errors.js';
const clone = (value) => value ? structuredClone(value) : null;

test('Sicredi durable Pix saga with isolated PostgreSQL, refunds and legacy isolation', { timeout: 120000 }, async (t) => {
  const pg = await PGlite.create(), migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(migrations, { withFileTypes: true })).filter((row) => row.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1, connectionTimeoutMillis: 5000 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  let instant = new Date(), created = 0, returned = 0, creationTimeout = false, refundTimeout = false, onCreate;
  const charges = new Map(), receipts = new Map();
  const settings = { PAYMENT_MODE: 'sicredi', SICREDI_PIX_ENV: 'sandbox', SICREDI_PIX_RECEIVING_KEY: 'test-key', SICREDI_PIX_TXID_PREFIX: 'ESP', SICREDI_PIX_WEBHOOK_TOKEN: 'z'.repeat(64) };
  const api = {
    charge: async (txid) => clone(charges.get(txid)),
    create: async (txid, amount) => { created++; assert.equal((await db.gatewayIntent.findFirst({ where: { providerReference: txid } })).creationStartedAt instanceof Date, true); const row = { txid, chave: 'test-key', valor: { original: (amount / 100).toFixed(2), modalidadeAlteracao: 0 }, status: 'ATIVA', pixCopiaECola: '000201TEST_ONLY', pix: [] }; charges.set(txid, row); if (onCreate) await onCreate(txid); if (creationTimeout) { creationTimeout = false; throw new AppError(503, 'SICREDI_TIMEOUT', 'test timeout'); } return clone(row); },
    pix: async (e2e) => clone(receipts.get(e2e)),
    cancel: async (txid) => { charges.get(txid).status = 'REMOVIDA_PELO_USUARIO_RECEBEDOR'; },
    refundStatus: async (e2e, id) => clone(receipts.get(e2e).devolucoes?.find((row) => row.id === id)),
    refund: async (e2e, id, cents) => { returned++; const intent = await db.gatewayIntent.findFirst({ where: { pixEndToEndId: e2e } }); assert.equal(intent.refundId, id); assert.equal(intent.refundAmountCents, cents); receipts.get(e2e).devolucoes = [{ id, valor: (cents / 100).toFixed(2), status: 'DEVOLVIDO' }]; if (refundTimeout) { refundTimeout = false; throw new AppError(503, 'SICREDI_TIMEOUT', 'test timeout'); } return clone(receipts.get(e2e).devolucoes[0]); },
  };
  const store = createSicrediStore(db, { settings, api, now: () => instant });
  const checkout = createTicketCheckoutStore(db, { now: () => instant });
  const admin = await db.user.create({ data: { name: 'Admin', email: 'sicredi-admin@test.local', passwordHash: 'test', role: 'ADMIN' } });
  const match = await db.match.create({ data: { slug: randomUUID(), homeTeam: 'Esporte', awayTeam: 'Visitante', stadium: 'Teste', competition: 'Teste', published: true, startsAt: new Date(instant.getTime() + 86400000), sectors: { create: { name: 'Arquibancada', capacity: 1000, priceCents: 2500 } } }, include: { sectors: true } });
  await db.financialSettings.upsert({ where: { id: 'main' }, create: { companyBps: 1000, gatewayFixedCents: 99 }, update: { gatewayFixedCents: 99 } });
  let index = 0;
  async function purchase() {
    const user = await db.user.create({ data: { name: 'Torcedor', email: `sicredi-${++index}@test.local`, passwordHash: 'test' } });
    const ticket = await checkout.reserve(user.id, { matchId: match.id, sectorId: match.sectors[0].id, quantity: 2 });
    const intent = await store.ticketPix(user.id, ticket.id);
    return { user, ticket, intent };
  }
  async function pay(intent, overrides = {}) {
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), charge = charges.get(raw.providerReference);
    const e2e = `E${randomUUID().replace(/-/g, '').slice(0, 31)}`;
    const received = { endToEndId: e2e, txid: raw.providerReference, valor: (intent.amountCents / 100).toFixed(2), horario: instant.toISOString(), devolucoes: [], ...overrides };
    charge.status = 'CONCLUIDA'; charge.pix = [{ ...received }]; receipts.set(e2e, received);
    return received;
  }
  await t.test('billing is not sent to bank; persisted unique TXID precedes PUT, duplicate queueing reuses it', async () => {
    assert.equal((await store.profile()).configured, true);
    const { user, ticket, intent } = await purchase();
    assert.equal((await store.ticketPix(user.id, ticket.id)).id, intent.id);
    const saved = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); assert.match(saved.providerReference, /^ESP[A-Fa-f0-9]{32}$/); assert.equal(saved.customerId, null);
    await store.process(intent.id); assert.equal((await store.ownIntent(user.id, intent.id)).state, 'PENDING');
    await assert.rejects(store.ownIntent(admin.id, intent.id), { code: 'PAYMENT_NOT_FOUND' });
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
  });
  await t.test('webhook is only a wakeup, repeated and forged values cannot issue tickets, E2E reconciliation settles once', async () => {
    const { user, ticket, intent } = await purchase(); await store.process(intent.id);
    const received = await pay(intent);
    const body = { pix: [{ txid: received.txid, endToEndId: received.endToEndId, valor: '0.01' }] };
    await assert.rejects(store.webhook('wrong', body), { code: 'SICREDI_WEBHOOK_UNAUTHORIZED' });
    await store.webhook(settings.SICREDI_PIX_WEBHOOK_TOKEN, body); await store.webhook(settings.SICREDI_PIX_WEBHOOK_TOKEN, body);
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    await Promise.all([store.process(intent.id), store.process(intent.id)]);
    const paid = await db.ticket.findUnique({ where: { id: ticket.id }, include: { payment: true, user: true } });
    assert.equal(paid.status, 'ISSUED'); assert.equal(paid.payment.method, 'SICREDI'); assert.equal(paid.payment.amountCents, 5000); assertTicketPaid(paid);
    assert.equal((await store.ownIntent(user.id, intent.id)).state, 'RECEIVED');
    const financial = await db.ticketFinancial.findUnique({ where: { paymentId: paid.payment.id } });
    assert.equal(financial.feeSource, 'ESTIMATED'); assert.equal(financial.gatewayFeeCents, 99); assert.equal(financial.grossCents, financial.companyCents + financial.clubCents + financial.gatewayFeeCents);
    await store.process(intent.id); assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 1);
    assert.equal(await db.gatewayWebhook.count({ where: { provider: 'sicredi' } }), 1);
  });
  await t.test('uncertain creation is recovered by the same TXID and never creates a second bank charge', async () => {
    const { user, intent } = await purchase(), before = created; creationTimeout = true;
    await store.process(intent.id); assert.equal((await store.ownIntent(user.id, intent.id)).failureCode, 'SICREDI_TIMEOUT');
    await store.process(intent.id); assert.equal(created, before + 1); assert.equal((await store.ownIntent(user.id, intent.id)).state, 'PENDING');
  });
  await t.test('a definitive OAuth denial allows recovery with the same persisted TXID after configuration is corrected', async () => {
    const { intent } = await purchase(), original = api.create;
    api.create = async () => { throw new AppError(503, 'SICREDI_ACCESS_DENIED', 'test access denied'); };
    await store.process(intent.id);
    const before = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); assert.equal(before.creationStartedAt, null);
    api.create = original; await store.process(intent.id);
    const after = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); assert.equal(after.providerReference, before.providerReference); assert.equal(after.state, 'PENDING');
  });
  await t.test('bank QR from creation is retained when later charge queries omit pixCopiaECola', async () => {
    const { user, intent } = await purchase(), original = api.create;
    api.create = async (...args) => { const result = await original(...args); delete charges.get(args[0]).pixCopiaECola; return result; };
    await store.process(intent.id); api.create = original;
    assert.equal((await store.ownIntent(user.id, intent.id)).pixPayload, '000201TEST_ONLY');
    await store.process(intent.id); assert.equal((await store.ownIntent(user.id, intent.id)).pixPayload, '000201TEST_ONLY');
  });
  await t.test('mismatched charge, E2E, amount, account, paid state and QR cannot issue or expose a stale QR', async () => {
    for (const tamper of ['value', 'e2e', 'key', 'qr']) {
      const { user, ticket, intent } = await purchase(); await store.process(intent.id);
      const saved = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), charge = charges.get(saved.providerReference);
      if (tamper === 'value') charge.valor.original = '1.00';
      if (tamper === 'key') charge.chave = 'foreign-account';
      if (tamper === 'qr') charge.pixCopiaECola = 'https://phishing.invalid';
      if (tamper === 'e2e') { const receipt = await pay(intent); receipt.txid = 'X'.repeat(35); }
      await store.process(intent.id); const fresh = await store.ownIntent(user.id, intent.id);
      assert.ok(fresh.failureCode); assert.equal(fresh.pixPayload, null); assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    }
  });
  await t.test('refund blocks ticket immediately; timeout is reconciled without duplicate refund or financial entries', async () => {
    const { user, ticket, intent } = await purchase(); await store.process(intent.id); await pay(intent); await store.process(intent.id);
    await store.requestRefund(admin.id, intent.id, 'Teste de devolução');
    assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).status, 'CANCELED');
    const before = returned; refundTimeout = true; await store.process(intent.id); await store.process(intent.id);
    const final = await store.ownIntent(user.id, intent.id); assert.equal(final.state, 'REFUNDED'); assert.equal(final.refundedCents, intent.amountCents); assert.equal(returned, before + 1);
    const revisions = await db.ticketFinancialEntry.count({ where: { financial: { payment: { ticketId: ticket.id } } } });
    const version = (await db.ticket.findUnique({ where: { id: ticket.id } })).entryVersion;
    await store.process(intent.id); assert.equal(await db.ticketFinancialEntry.count({ where: { financial: { payment: { ticketId: ticket.id } } } }), revisions);
    assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).entryVersion, version);
  });
  await t.test('late payments refund the bank receipt without issuing tickets after reservation expiry', async () => {
    const { ticket, intent } = await purchase(); await store.process(intent.id); await pay(intent);
    instant = new Date(instant.getTime() + 3600000); await store.process(intent.id);
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).state, 'REFUNDED');
  });
  await t.test('shop payment consumes inventory once and a confirmed refund restores unshipped stock once', async () => {
    const user = await db.user.create({ data: { name: 'Cliente loja', email: 'sicredi-shop@test.local', passwordHash: 'test' } });
    const product = await db.product.create({ data: { name: 'Camisa de teste', active: true, priceCents: 5000, variants: { create: { sku: 'SICREDI-SHOP-TEST', stock: 3 } } }, include: { variants: true } });
    const variant = product.variants[0];
    const order = await db.shopOrder.create({ data: { userId: user.id, requestKey: randomUUID(), requestHash: 'a'.repeat(64), recipient: user.name, phone: '83999999999', address: { pickupAddress: 'Loja' }, deliveryMethod: 'PICKUP', shippingName: 'Retirada', shippingService: 'PICKUP', shippingDays: 0, subtotalCents: 5000, shippingCents: 0, totalCents: 5000, expiresAt: new Date(instant.getTime() + 900000), items: { create: { variantId: variant.id, productName: product.name, variantLabel: variant.label, sku: variant.sku, quantity: 1, unitPriceCents: 5000, costCents: 1000 } } } });
    const intent = await store.shopPix(user.id, order.id); await store.process(intent.id); await pay(intent); await store.process(intent.id); await store.process(intent.id);
    const paid = await db.shopOrder.findUnique({ where: { id: order.id }, include: { payment: true } });
    assert.equal(paid.status, 'PAID'); assert.equal(paid.payment.method, 'SICREDI'); assert.equal((await db.productVariant.findUnique({ where: { id: variant.id } })).stock, 2);
    await store.requestRefund(admin.id, intent.id, 'Devolução de teste da loja'); await store.process(intent.id); await store.process(intent.id);
    assert.equal((await db.shopOrder.findUnique({ where: { id: order.id } })).status, 'REFUNDED');
    assert.equal((await db.productVariant.findUnique({ where: { id: variant.id } })).stock, 3);
    assert.equal(await db.stockMovement.count({ where: { orderId: order.id, kind: 'RETURN' } }), 1);
  });
  await t.test('partial external refunds invalidate the ticket and remain visible as partial refunds', async () => {
    const { ticket, intent } = await purchase(); await store.process(intent.id); const receipt = await pay(intent); await store.process(intent.id);
    receipt.devolucoes = [{ id: 'external-refund', valor: '10.00', status: 'EM_PROCESSAMENTO' }];
    await store.process(intent.id); assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).status, 'CANCELED');
    receipt.devolucoes[0].status = 'DEVOLVIDO'; await store.process(intent.id);
    const current = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); assert.equal(current.state, 'PARTIAL_REFUND'); assert.equal(current.refundedCents, 1000);
  });
  await t.test('revoked worker cannot settle or overwrite another lease', async () => {
    const { ticket, intent } = await purchase();
    onCreate = async () => { await db.gatewayIntent.update({ where: { id: intent.id }, data: { lockToken: randomUUID(), lockedUntil: new Date(instant.getTime() + 600000) } }); };
    await store.process(intent.id); onCreate = null;
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    const row = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); assert.ok(row.lockToken); assert.equal(row.state, 'CREATING');
  });
  await t.test('Asaas transactions remain separate and cashback cannot fake a native split', async () => {
    const { user, ticket } = await purchase();
    await db.gatewayIntent.deleteMany({ where: { ticketId: ticket.id } });
    const legacy = createAsaasStore(db, { settings: { PAYMENT_MODE: 'asaas', ASAAS_ENVIRONMENT: 'sandbox', ASAAS_DATA_SECRET: 'a'.repeat(64) }, api: {} });
    await legacy.saveProfile(user.id, '52998224725'); const old = await legacy.ticketPix(user.id, ticket.id);
    await assert.rejects(store.ticketPix(user.id, ticket.id), { code: 'PAYMENT_PROVIDER_CONFLICT' });
    await store.process(old.id); assert.equal((await db.gatewayIntent.findUnique({ where: { id: old.id } })).attempts, 0);
    await db.gatewayIntent.update({ where: { id: old.id }, data: { state: 'PENDING', pixPayload: 'legacy-qr' } });
    const queries = createPixQueries(db, { PAYMENT_MODE: 'sicredi', SICREDI_PIX_ENV: 'sandbox' });
    const history = await queries.ownIntent(user.id, old.id);
    assert.equal(history.provider, 'asaas'); assert.equal(history.pixPayload, null); assert.equal(history.failureCode, 'PAYMENT_PROVIDER_NOT_ACTIVE');
    await assert.rejects(store.cashPix(user.id, randomUUID()), { code: 'SICREDI_SPLIT_UNAVAILABLE' });
    const model = createPaymentModel(db, { settings, gateway: {}, now: () => instant });
    assert.throws(() => model.createCharge(user.id, {}, 'CASHIER_QR'), { code: 'SICREDI_SPLIT_UNAVAILABLE' });
  });
});
