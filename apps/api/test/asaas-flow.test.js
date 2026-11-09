import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createAsaasStore } from '../src/models/asaas.store.js';
import { createTicketCheckoutStore } from '../src/models/ticket-checkout.store.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';
import { AppError } from '../src/lib/errors.js';

// Disposable PostgreSQL WASM instance. No app, Docker or user database is started.
test('Asaas complete payment saga against isolated PostgreSQL and mocked provider', { timeout: 120000 }, async (t) => {
  const pg = await PGlite.create();
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(migrations, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 });
  await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1, connectionTimeoutMillis: 5000 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  let instant = new Date(), creates = 0, refunds = 0, uncertain = false;
  const payments = new Map(), customers = new Map();
  const api = {
    findCustomer: async (externalReference) => ({ data: [...customers.values()].filter((row) => row.externalReference === externalReference) }),
    createCustomer: async (body) => { const row = { ...body, id: `cus_${customers.size + 1}` }; customers.set(row.id, row); return row; },
    findPayments: async (externalReference) => ({ data: [...payments.values()].filter((row) => row.externalReference === externalReference).map((row) => structuredClone(row)) }),
    createPayment: async (body) => { creates++; const row = { ...body, id: `pay_${creates}`, netValue: body.value - 1, status: 'PENDING', split: [] }; payments.set(row.id, row); if (uncertain) { uncertain = false; throw new AppError(503, 'ASAAS_UNCERTAIN', 'timeout'); } return structuredClone(row); },
    payment: async (id) => { const row = payments.get(id); if (!row) throw new AppError(422, 'ASAAS_NOT_FOUND', 'not found'); return structuredClone(row); },
    updatePayment: async (id, body) => { const row = payments.get(id); row.split = body.split.map((split) => ({ ...split, status: 'PENDING' })); return structuredClone(row); },
    pix: async () => ({ payload: '000201-PIX-SANDBOX-FOR-TESTING-ONLY' }),
    cancel: async (id) => { payments.get(id).deleted = true; return { deleted: true }; },
    refund: async (id, value) => { refunds++; const row = payments.get(id); row.status = 'REFUNDED'; row.refunds = [{ value, status: 'DONE' }]; return structuredClone(row); },
  };
  const settings = { PAYMENT_MODE: 'asaas', ASAAS_ENVIRONMENT: 'sandbox', ASAAS_DATA_SECRET: 'a'.repeat(64), ASAAS_WEBHOOK_TOKEN: 'b'.repeat(64), asaasMerchantWallets: {} };
  const store = createAsaasStore(db, { settings, api, now: () => instant });
  const checkout = createTicketCheckoutStore(db, { now: () => instant });
  const admin = await db.user.create({ data: { name: 'Admin teste Asaas', email: 'admin-asaas@test.local', passwordHash: 'test-only', role: 'ADMIN' } });
  const match = await db.match.create({ data: { slug: randomUUID(), homeTeam: 'Esporte', awayTeam: 'Visitante', stadium: 'Teste', competition: 'Teste', published: true, startsAt: new Date(instant.getTime() + 86400000), sectors: { create: { name: 'Sol', capacity: 1000, priceCents: 2500 } } }, include: { sectors: true } });
  const sectorId = match.sectors[0].id;
  let index = 0;
  async function purchase() {
    const user = await db.user.create({ data: { name: 'Torcedor teste', email: `asaas-${++index}@test.local`, passwordHash: 'test-only' } });
    await store.saveProfile(user.id, '52998224725');
    const ticket = await checkout.reserve(user.id, { matchId: match.id, sectorId, quantity: 2 });
    const intent = await store.ticketPix(user.id, ticket.id);
    return { user, ticket, intent };
  }
  await t.test('queue creation is idempotent and settles once after authenticated durable webhook', async () => {
    const { user, ticket, intent } = await purchase();
    assert.equal((await store.ticketPix(user.id, ticket.id)).id, intent.id);
    await store.process(intent.id);
    const pending = await store.ownIntent(user.id, intent.id); assert.equal(pending.state, 'PENDING'); assert.ok(pending.pixPayload);
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } });
    const remote = payments.get(raw.providerReference); remote.status = 'RECEIVED';
    const payload = { id: 'evt_first', event: 'PAYMENT_RECEIVED', payment: { id: remote.id, externalReference: remote.externalReference, value: 0.01 }, ignoredNewField: true };
    await assert.rejects(store.webhook('wrong', payload), { code: 'INVALID_WEBHOOK_TOKEN' }); assert.equal(await db.gatewayWebhook.count(), 0);
    const app = createApp({ routes: [{ method: 'POST', path: '/webhook', handler: async ({ req, body }) => ({ data: await store.webhook(req.headers['asaas-access-token'], body) }) }], authenticate: async () => ({}), logger: { info() {}, error() {} } });
    const received = await inject(app, '/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': settings.ASAAS_WEBHOOK_TOKEN }, body: JSON.stringify(payload) });
    assert.equal(received.status, 200); assert.equal((await received.json()).data.received, true);
    assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).status, 'PENDING');
    assert.equal((await store.webhook(settings.ASAAS_WEBHOOK_TOKEN, payload)).duplicate, true);
    await assert.rejects(store.webhook(settings.ASAAS_WEBHOOK_TOKEN, { ...payload, event: 'PAYMENT_REFUNDED' }), { code: 'WEBHOOK_ID_CONFLICT' });
    await store.tick();
    assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).status, 'ISSUED');
    assert.equal((await db.ticketPayment.findUnique({ where: { ticketId: ticket.id } })).amountCents, 5000);
    const allocation = await db.ticketFinancial.findFirst({ where: { payment: { ticketId: ticket.id } } });
    assert.equal(allocation.gatewayFeeCents, 100); assert.equal(allocation.feeSource, 'PROVIDER');
    assert.equal(allocation.companyCents, 490); assert.equal(allocation.clubCents, 4410);
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 1);
    await store.process(intent.id); assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 1);
    instant = new Date(instant.getTime() + 16 * 60000);
    const previousRefunds = refunds; await store.process(intent.id); assert.equal(refunds, previousRefunds, 'paid ticket must not be refunded at original reservation deadline');
    await db.ticket.update({ where: { id: ticket.id }, data: { deletedAt: instant, voidedQuantity: 2, status: 'CANCELED' } });
    await store.process(intent.id); assert.equal(refunds, previousRefunds, 'administrative deletion must not implicitly refund a paid sale');
  });
  await t.test('ambiguous POST is recovered by external reference without creating twice', async () => {
    const { user, intent } = await purchase(); const before = creates; uncertain = true;
    await store.process(intent.id); assert.equal((await store.ownIntent(user.id, intent.id)).state, 'REVIEW');
    await store.process(intent.id); assert.equal(creates, before + 1); assert.equal((await store.ownIntent(user.id, intent.id)).state, 'PENDING');
  });
  await t.test('a missing result after ambiguous creation is kept in review rather than charged again', async () => {
    const { intent } = await purchase(); const before = creates; uncertain = true;
    await store.process(intent.id); payments.delete(`pay_${creates}`);
    await store.process(intent.id); assert.equal(creates, before + 1);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).failureCode, 'ASAAS_CREATION_UNCERTAIN');
  });
  await t.test('late receipts refund instead of issuing expired tickets; replay cannot resurrect them', async () => {
    const { intent, ticket } = await purchase(); await store.process(intent.id);
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); const remote = payments.get(raw.providerReference); remote.status = 'RECEIVED';
    instant = new Date(instant.getTime() + 16 * 60000); await store.process(intent.id);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).state, 'REFUNDED');
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    remote.status = 'RECEIVED'; remote.refunds = []; await store.process(intent.id);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).state, 'REFUNDED');
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    const cost=await db.ticketRefundCost.findUnique({where:{intentId:intent.id}});assert.equal(cost.gatewayFeeCents,100);assert.equal(cost.grossCents,cost.refundedCents);
    await store.process(intent.id);assert.equal(await db.ticketRefundCost.count({where:{intentId:intent.id}}),1);
  });
  await t.test('CONFIRMED is not RECEIVED and amount tampering never issues access', async () => {
    const { intent, ticket } = await purchase(); await store.process(intent.id);
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), remote = payments.get(raw.providerReference);
    remote.status = 'CONFIRMED'; await store.process(intent.id); assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).status, 'PENDING');
    remote.status = 'RECEIVED'; remote.value = 0.01; await store.process(intent.id);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).failureCode, 'ASAAS_PAYMENT_MISMATCH'); assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
  });
  await t.test('canceling an unpaid reservation cancels the bank charge and a late payment is refunded', async () => {
    const { intent, ticket, user } = await purchase(); await store.process(intent.id);
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), remote = payments.get(raw.providerReference);
    await assert.rejects(checkout.quote(user.id, { matchId: match.id, sectorId, quantity: 1 }), { code: 'PIX_IN_PROGRESS' });
    await db.ticket.update({ where: { id: ticket.id }, data: { status: 'CANCELED' } });
    await store.process(intent.id); assert.equal(remote.deleted, true); assert.equal((await store.ownIntent(user.id, intent.id)).pixPayload, null);
    remote.deleted = false; remote.status = 'RECEIVED'; await store.process(intent.id);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).state, 'REFUNDED'); assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
  });
  await t.test('leases prevent competing processes from provisioning the same charge', async () => {
    const { intent } = await purchase(), before = creates;
    await db.gatewayIntent.update({ where: { id: intent.id }, data: { lockedUntil: new Date(instant.getTime() + 60000), lockToken: randomUUID() } });
    await store.process(intent.id); assert.equal(creates, before);
    instant = new Date(instant.getTime() + 61000); await store.process(intent.id); assert.equal(creates, before + 1);
  });
  await t.test('a replaced worker cannot create a charge or overwrite the winning lease', async () => {
    const { intent } = await purchase(), before = creates, winner = randomUUID();
    const find = api.findPayments;
    api.findPayments = async (ref) => {
      const result = await find(ref);
      await db.gatewayIntent.update({ where: { id: intent.id }, data: { lockToken: winner, lockedUntil: new Date(instant.getTime() + 60000), failureCode: 'WINNER_OWNS_PROCESS' } });
      return result;
    };
    try { await store.process(intent.id); } finally { api.findPayments = find; }
    const row = await db.gatewayIntent.findUnique({ where: { id: intent.id } });
    assert.equal(creates, before); assert.equal(row.creationStartedAt, null);
    assert.equal(row.lockToken, winner); assert.equal(row.failureCode, 'WINNER_OWNS_PROCESS');
    instant = new Date(instant.getTime() + 61000); await store.process(intent.id);
    assert.equal(creates, before + 1);
  });
  await t.test('expired customer leases stop customer POSTs and recover safely', async () => {
    const { intent } = await purchase(), before = customers.size, chargeCount = creates;
    const find = api.findCustomer;
    api.findCustomer = async (ref) => { const result = await find(ref); instant = new Date(instant.getTime() + 121000); return result; };
    try { await store.process(intent.id); } finally { api.findCustomer = find; }
    assert.equal(customers.size, before); assert.equal(creates, chargeCount);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).failureCode, 'ASAAS_LEASE_LOST');
    await store.process(intent.id); assert.equal(customers.size, before + 1); assert.equal(creates, chargeCount + 1);
  });
  await t.test('lease takeover immediately after a financial marker stops creation and refund POSTs', async () => {
    for (const stage of ['creationStartedAt', 'refundStartedAt']) {
      const { intent } = await purchase();
      if (stage === 'refundStartedAt') {
        await store.process(intent.id);
        const row = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); payments.get(row.providerReference).status = 'RECEIVED';
        await store.process(intent.id); await store.requestRefund(admin.id, intent.id, 'Teste de troca de worker antes do POST');
      }
      const beforeCreates = creates, beforeRefunds = refunds, winner = randomUUID(); let takeovers = 0;
      const swapped = db.$extends({ query: { gatewayIntent: { async updateMany({ args, query }) {
        const result = await query(args);
        if (args.data[stage] instanceof Date && result.count === 1) {
          takeovers++;
          await db.gatewayIntent.update({ where: { id: intent.id }, data: { lockToken: winner, lockedUntil: new Date(instant.getTime() + 60000) } });
        }
        return result;
      } } } });
      await createAsaasStore(swapped, { settings, api, now: () => instant }).process(intent.id);
      assert.equal(takeovers, 1); assert.equal(creates, beforeCreates); assert.equal(refunds, beforeRefunds);
      const row = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); assert.equal(row.lockToken, winner); assert.ok(row[stage]);
    }
  });
  await t.test('expired payment leases cannot settle a received payment', async () => {
    const { intent, ticket } = await purchase(); await store.process(intent.id);
    const row = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); payments.get(row.providerReference).status = 'RECEIVED';
    const get = api.payment;
    api.payment = async (id) => { const result = await get(id); instant = new Date(instant.getTime() + 301000); return result; };
    try { await store.process(intent.id); } finally { api.payment = get; }
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).status, 'PENDING');
    await store.process(intent.id); assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 1);
  });
  await t.test('provider identity mismatches never issue, refund or cancel an unrelated charge', async () => {
    const { intent, ticket } = await purchase(); await store.process(intent.id);
    const row = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), remote = payments.get(row.providerReference);
    const original = structuredClone(remote), before = refunds;
    await store.requestRefund(admin.id, intent.id, 'Verificação de integridade antes do estorno');
    for (const tamper of [{ customer: 'cus_other' }, { externalReference: 'socio:other' }, { value: 0.01 }, { billingType: 'BOLETO' }, { deleted: true }]) {
      Object.assign(remote, original, { status: 'RECEIVED', deleted: false }, tamper);
      await store.process(intent.id);
      assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).failureCode, 'ASAAS_PAYMENT_MISMATCH');
      assert.equal(refunds, before); assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    }
    Object.assign(remote, original, { customer: 'cus_other', deleted: false });
    await store.process(intent.id); assert.ok(!remote.deleted, 'must not send cancellation for an unrelated pending charge');
  });
  await t.test('recovering an ambiguous creation validates the customer before binding the charge', async () => {
    const { intent } = await purchase(); uncertain = true; await store.process(intent.id);
    payments.get(`pay_${creates}`).customer = 'cus_unrelated';
    const before = creates; await store.process(intent.id);
    const row = await db.gatewayIntent.findUnique({ where: { id: intent.id } });
    assert.equal(row.providerReference, null); assert.equal(row.failureCode, 'ASAAS_PAYMENT_MISMATCH'); assert.equal(creates, before);
  });
  await t.test('expiration during the inventory query refunds instead of issuing late access', async () => {
    const { intent, ticket } = await purchase(); await store.process(intent.id);
    const row = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); payments.get(row.providerReference).status = 'RECEIVED';
    instant = new Date(ticket.expiresAt.getTime() - 1000);
    let queries = 0;
    const delayed = db.$extends({ query: { ticket: { async aggregate({ args, query }) { const result = await query(args); queries++; instant = new Date(instant.getTime() + 2000); return result; } } } });
    await createAsaasStore(delayed, { settings, api, now: () => instant }).process(intent.id);
    assert.equal(queries, 1, 'must cross the reservation deadline while reading actual inventory');
    assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).state, 'REFUNDED');
  });
  await t.test('reopening a canceled reservation never reuses its old Pix and ownership is enforced', async () => {
    const { intent, ticket, user } = await purchase(); await store.process(intent.id);
    await assert.rejects(store.ownIntent(admin.id, intent.id), { code: 'PAYMENT_NOT_FOUND' });
    await db.ticket.update({ where: { id: ticket.id }, data: { status: 'CANCELED' } }); await store.process(intent.id);
    instant = new Date(instant.getTime() + 1);
    await checkout.reserve(user.id, { matchId: match.id, sectorId, quantity: 1 });
    assert.equal(await store.ticketIntent(user.id, ticket.id), null);
    assert.notEqual((await store.ticketPix(user.id, ticket.id)).id, intent.id);
  });
  await t.test('a wakeup arriving while processing cannot be overwritten by the normal schedule', async () => {
    const { intent } = await purchase(); await store.process(intent.id);
    const getPayment = api.payment; let awakened = false;
    api.payment = async (id) => { const payment = await getPayment(id); if (!awakened) { awakened = true; await store.retry(intent.id); } return payment; };
    await store.process(intent.id); api.payment = getPayment;
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).nextAttemptAt.getTime(), instant.getTime());
  });
  await t.test('ambiguous refund is reconciled without a second financial request', async () => {
    const { intent } = await purchase(); await store.process(intent.id);
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), remote = payments.get(raw.providerReference); remote.status = 'RECEIVED'; await store.process(intent.id);
    await store.requestRefund(admin.id, intent.id, 'Teste de resposta inconclusiva');
    const refund = api.refund; let calls = 0;
    api.refund = async () => { calls++; throw new AppError(503, 'ASAAS_UNCERTAIN', 'timeout'); };
    await store.process(intent.id); await store.process(intent.id); assert.equal(calls, 1);
    remote.status = 'REFUNDED'; api.refund = refund; await store.process(intent.id);
    assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).state, 'REFUNDED');
  });
  await t.test('explicit refund disables admission, preserves receipt and used seats, and is idempotent', async () => {
    const { intent, ticket } = await purchase(); await store.process(intent.id);
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }); payments.get(raw.providerReference).status = 'RECEIVED'; await store.process(intent.id);
    await db.ticket.update({ where: { id: ticket.id }, data: { usedQuantity: 1 } });
    await store.requestRefund(admin.id, intent.id, 'Devolução solicitada pelo titular');
    assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).status, 'CANCELED');
    const before = refunds; await store.process(intent.id); await store.process(intent.id); assert.equal(refunds, before + 1);
    const receipt = await db.ticketPayment.findUnique({ where: { ticketId: ticket.id } }); assert.equal(receipt.refundedCents, 5000);
    const financial = await db.ticketFinancial.findUnique({ where: { paymentId: receipt.id } });
    assert.equal(financial.companyCents, 0); assert.equal(financial.clubCents, -100);
    const invalid = await db.ticket.findUnique({ where: { id: ticket.id } }); assert.equal(invalid.voidedQuantity, 1); assert.equal(invalid.usedQuantity, 1);
  });
  await t.test('cashback is credited only after split DONE, partial/full refunds conserve the wallet', async () => {
    const user = await db.user.create({ data: { name: 'Cliente cashback', email: 'cash-asaas@test.local', passwordHash: 'test-only' } }); await store.saveProfile(user.id, '52998224725');
    const tenant = await db.tenant.create({ data: { slug: 'asaas-test', name: 'Esporte' } });
    const merchant = await db.merchant.create({ data: { slug: 'loja-asaas', name: 'Loja' } });
    settings.asaasMerchantWallets[merchant.id] = randomUUID();
    const offer = await db.merchantOffer.create({ data: { tenantId: tenant.id, merchantId: merchant.id, cashbackBps: 1000, commissionBps: 200 } });
    const wallet = await db.cashWallet.create({ data: { userId: user.id, tenantId: tenant.id, customerCode: randomUUID() } });
    const charge = await db.paymentCharge.create({ data: { offerId: offer.id, creatorId: user.id, walletId: wallet.id, channel: 'CUSTOMER_QR', requestKey: randomUUID(), claimCode: randomUUID(), grossCents: 10000, merchantCents: 8800, cashbackCents: 1000, commissionCents: 200, provider: 'asaas', expiresAt: new Date(instant.getTime() + 900000) } });
    const intent = await store.cashPix(user.id, charge.id); await store.process(intent.id);
    const raw = await db.gatewayIntent.findUnique({ where: { id: intent.id } }), remote = payments.get(raw.providerReference);
    assert.equal(remote.split[0].fixedValue, 87); assert.equal((await db.paymentCharge.findUnique({ where: { id: charge.id } })).gatewayFeeCents, 100);
    remote.status = 'RECEIVED'; await store.process(intent.id); assert.equal((await db.cashWallet.findUnique({ where: { id: wallet.id } })).balanceCents, 0);
    remote.split[0].status = 'DONE'; await store.process(intent.id); await store.process(intent.id); assert.equal((await db.cashWallet.findUnique({ where: { id: wallet.id } })).balanceCents, 1000);
    remote.refunds = [{ value: 50, status: 'DONE' }]; await store.process(intent.id); await store.process(intent.id); assert.equal((await db.cashWallet.findUnique({ where: { id: wallet.id } })).balanceCents, 500);
    remote.status = 'REFUNDED'; await store.process(intent.id); assert.equal((await db.cashWallet.findUnique({ where: { id: wallet.id } })).balanceCents, 0);
    assert.equal(await db.cashEntry.count({ where: { chargeId: charge.id, kind: 'CASHBACK' } }), 1); assert.equal(await db.cashEntry.count({ where: { chargeId: charge.id, kind: 'REVERSAL' } }), 1);
  });
});
