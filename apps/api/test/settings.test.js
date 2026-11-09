import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createSettingsStore } from '../src/models/settings.store.js';
import { createEngagementModel } from '../src/models/engagement.model.js';
import { createShopStore } from '../src/models/shop.store.js';
import { createPaymentModel } from '../src/models/payment.model.js';
import { createAsaasStore } from '../src/models/asaas.store.js';
import { createPartnerStore } from '../src/models/partner.store.js';
import { createTicketCheckoutStore } from '../src/models/ticket-checkout.store.js';
import { captureFinancialPolicy } from '../src/lib/ticket-finance.js';
import { captureMerchantPolicy, paymentDestination } from '../src/lib/merchant-payment-policy.js';
import { businessSettingsSchema, rewardCreateSchema } from '../src/validators/settings.js';
import { routes } from '../src/routes/index.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';

test('business administration rejects unauthorized roles and invalid monetary/operational settings', async () => {
  for (const role of ['USER', 'GATE', 'CASHIER']) {
    const app = createApp({ routes, logger: { info() {}, error() {} }, authenticate: async () => ({ user: { id: randomUUID(), role, active: true } }) });
    for (const route of routes.filter((r) => ['/v1/admin/settings', '/v1/admin/rewards'].includes(r.path))) {
      assert.equal((await inject(app, route.path, { method: route.method, headers: { Authorization: 'Bearer test.header.signature', 'Content-Type': 'application/json' }, body: route.method === 'GET' ? undefined : '{}' })).status, 403);
    }
  }
  assert.equal(businessSettingsSchema.safeParse({ version: 0, ticketReservationMinutes: -1 }).success, false);
  assert.equal(rewardCreateSchema.safeParse({ title: 'Teste', description: '', cost: 0, stock: -1, active: true, icon: 'gift' }).success, false);
});

test('partner destinations and agreed percentages remain fixed across admin edits and environment changes', () => {
  const merchantId = randomUUID(), sandbox = randomUUID(), production = randomUUID(), legacy = randomUUID();
  const settings = { ASAAS_ENVIRONMENT: 'sandbox', asaasMerchantWallets: { [merchantId]: legacy } };
  const offer = { merchantId, cashbackBps: 700, commissionBps: 200, merchant: { asaasSandboxWalletId: sandbox, asaasProductionWalletId: production } };
  const policy = captureMerchantPolicy(offer, settings);
  offer.merchant.asaasSandboxWalletId = randomUUID(); offer.cashbackBps = 999;
  const charge = { paymentPolicy: policy, offer: { merchantId } };
  assert.equal(paymentDestination(charge, null, settings), sandbox);
  assert.equal(policy.cashbackBps, 700);
  assert.equal(captureMerchantPolicy(offer, { ...settings, ASAAS_ENVIRONMENT: 'production' }).merchantWallet, production);
  assert.throws(() => paymentDestination(charge, null, { ...settings, ASAAS_ENVIRONMENT: 'production' }), { code: 'ASAAS_ENVIRONMENT_MISMATCH' });
  assert.equal(paymentDestination({ offer: { merchantId } }, { environment: 'sandbox', snapshot: { merchantWallet: sandbox } }, { ...settings, asaasMerchantWallets: {} }), sandbox);
  offer.merchant.asaasSandboxWalletId = '';
  assert.throws(() => paymentDestination({ ...charge, paymentPolicy: captureMerchantPolicy(offer, settings) }, null, settings), { code: 'ASAAS_MERCHANT_NOT_CONFIGURED' });
  offer.merchant.asaasSandboxWalletId = null;
  assert.equal(captureMerchantPolicy(offer, settings).merchantWallet, legacy);
});

test('persisted business configuration controls reservations, points and reward stock without rewriting history', { timeout: 120000 }, async (t) => {
  const pg = await PGlite.create(), migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(migrations, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1, connectionTimeoutMillis: 5000 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  const users = await Promise.all(['ADMIN', 'USER', 'USER'].map((role, i) => db.user.create({ data: { name: 'Configuração teste', email: `settings${i}@test.local`, passwordHash: 'test-only', role } })));
  const [admin, user, other] = users, store = createSettingsStore(db), engagement = createEngagementModel(db);
  const editable = ({ id, updatedAt, ...row }) => row;
  const initial = await store.settings();
  const changed = await store.saveSettings(admin.id, businessSettingsSchema.parse({ ...editable(initial), ticketReservationMinutes: 7, shopReservationMinutes: 9, shopQuoteMinutes: 2, cashChargeMinutes: 6, shopPendingOrderLimit: 1, checkInPoints: 73 }));
  await assert.rejects(store.saveSettings(admin.id, editable(initial)), { code: 'SETTINGS_CHANGED' });
  assert.equal((await store.settings()).checkInPoints, 73);
  const entry = await engagement.checkIn(user.id, '2026-11-09'); assert.equal(entry.entry.amount, 73);
  await assert.rejects(engagement.checkIn(user.id, '2026-11-09'), { code: 'ALREADY_CHECKED_IN' });
  const reward = await store.saveReward(admin.id, { title: 'Visita ao estádio', description: 'Condições teste', cost: 50, stock: 1, icon: 'flag', active: true });
  const redemption = await engagement.redeem(user.id, reward.id); assert.equal(redemption.cost, 50);
  await assert.rejects(store.saveReward(admin.id, { ...reward, title: 'Outro título', stock: 5 }), { code: 'REWARD_CHANGED' });
  const latestReward = await db.reward.findUnique({ where: { id: reward.id } });
  await store.saveReward(admin.id, { id: reward.id, version: latestReward.version, title: 'Visita revisada', description: '', cost: 70, stock: 2, icon: 'flag', active: false });
  assert.equal((await db.redemption.findUnique({ where: { id: redemption.id } })).cost, 50);
  assert.equal((await db.user.findUnique({ where: { id: user.id } })).points, 23);
  const paused = await store.saveSettings(admin.id, { ...editable(changed), checkInEnabled: false, checkInPoints: 100 });
  await assert.rejects(engagement.checkIn(other.id, '2026-11-10'), { code: 'CHECK_IN_DISABLED' });
  assert.equal((await db.pointEntry.findUnique({ where: { id: entry.entry.id } })).amount, 73);

  const clock = new Date(), match = await db.match.create({ data: { slug: 'settings-match', competition: 'Teste', homeTeam: 'Esporte', awayTeam: 'Teste', stadium: 'Estádio', startsAt: new Date(clock.getTime() + 7200000), published: true, salesEnabled: true } });
  const sector = await db.sector.create({ data: { matchId: match.id, name: 'Arquibancada', capacity: 20, priceCents: 5000 } });
  const tickets = createTicketCheckoutStore(db, { now: () => clock });
  const ticket = await tickets.reserve(user.id, { matchId: match.id, sectorId: sector.id, quantity: 1, expectedTotalCents: 5000 });
  assert.equal(new Date(ticket.expiresAt).getTime() - clock.getTime(), 7 * 60000);
  const originalPolicy = (await db.ticket.findUnique({ where: { id: ticket.id } })).financialPolicy;
  assert.equal(originalPolicy.companyBps, 1000);
  await db.financialSettings.update({ where: { id: 'main' }, data: { companyBps: 1700, gatewayFixedCents: 99, version: { increment: 1 } } });
  assert.equal((await captureFinancialPolicy(db)).companyBps, 1700);
  assert.deepEqual((await db.ticket.findUnique({ where: { id: ticket.id } })).financialPolicy, originalPolicy);

  const shop = createShopStore(db, { now: () => clock });
  await db.shopSettings.create({ data: { id: 'main', enabled: true, pickupEnabled: true, pickupAddress: 'Rua teste' } });
  const product = await db.product.create({ data: { name: 'Camisa', description: '', category: 'Teste', active: true, images: [], priceCents: 12345, costCents: 4000, weightGrams: 300, widthCm: 20, heightCm: 5, lengthCm: 25, variants: { create: { label: 'M', sku: randomUUID(), stock: 5 } } }, include: { variants: true } });
  const cart = { items: [{ variantId: product.variants[0].id, quantity: 1 }], deliveryMethod: 'PICKUP', postalCode: '' };
  const quote = await shop.quote(user.id, cart);
  assert.equal(new Date(quote.expiresAt).getTime() - clock.getTime(), 2 * 60000);
  assert.equal(quote.reservationMinutes, 9);
  const checkout = { ...cart, quoteId: quote.id, shippingOptionId: 'pickup', expectedTotalCents: 12345, recipient: 'Pessoa teste', phone: '83999999999', requestKey: randomUUID() };
  const order = await shop.reserve(user.id, checkout);
  assert.equal(new Date(order.expiresAt).getTime() - clock.getTime(), 9 * 60000);
  await assert.rejects(shop.reserve(user.id, { ...checkout, requestKey: randomUUID() }), { code: 'SHOP_PENDING_LIMIT' });
  await db.product.update({ where: { id: product.id }, data: { priceCents: 15555, version: { increment: 1 } } });
  await store.saveSettings(admin.id, { ...editable(paused), ticketReservationMinutes: 2, shopReservationMinutes: 3 });
  assert.equal((await db.shopOrder.findUnique({ where: { id: order.id } })).totalCents, 12345);
  assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).expiresAt.getTime() - clock.getTime(), 7 * 60000);
  assert.equal((await db.shopOrder.findUnique({ where: { id: order.id } })).expiresAt.getTime() - clock.getTime(), 9 * 60000);
  const tenant = await db.tenant.create({ data: { slug: 'settings-test', name: 'Teste' } }), partners = createPartnerStore(db, tenant.slug);
  const sandbox = randomUUID(), production = randomUUID();
  const partner = await partners.create(admin.id, { name: 'Parceiro', discount: 'Oferta', category: 'Teste', receivingWallets: { sandbox, production }, offer: { cashbackBps: 700, commissionBps: 200, active: true, customerQrEnabled: true } });
  assert.equal(partner.merchant.asaasSandboxWalletId, sandbox); assert.equal(partner.merchant.asaasProductionWalletId, production);
  const runtime = { PAYMENT_MODE: 'asaas', ASAAS_ENVIRONMENT: 'sandbox', ASAAS_DATA_SECRET: 'a'.repeat(64), asaasMerchantWallets: {} };
  const cash = createPaymentModel(db, { settings: runtime, now: () => clock });
  const chargeInput = { merchantCode: partner.merchant.publicCode, amountCents: 10000, requestKey: randomUUID() };
  const charge = await cash.createCharge(user.id, chargeInput, 'CUSTOMER_QR', tenant.slug);
  assert.equal(charge.expiresAt.getTime() - clock.getTime(), 6 * 60000);
  assert.equal(charge.paymentPolicy.merchantWallet, sandbox); assert.equal(charge.cashbackCents, 700); assert.equal(charge.commissionCents, 200);
  const replacement = randomUUID();
  let updatedPartner = await partners.update(admin.id, { id: partner.id, updatedAt: partner.updatedAt.toISOString(), name: partner.name, receivingWallets: { sandbox: replacement }, offer: { cashbackBps: 900, commissionBps: 300, active: true, customerQrEnabled: true } });
  assert.equal(updatedPartner.merchant.asaasProductionWalletId, production, 'editing sandbox does not clear the production beneficiary');
  const asaas = createAsaasStore(db, { settings: runtime, api: {}, now: () => clock });
  await asaas.saveProfile(user.id, '52998224725');
  const intent = await asaas.cashPix(user.id, charge.id);
  assert.equal((await db.gatewayIntent.findUnique({ where: { id: intent.id } })).snapshot.merchantWallet, sandbox);
  assert.equal((await cash.createCharge(user.id, chargeInput, 'CUSTOMER_QR', tenant.slug)).id, charge.id, 'retry retains original commercial policy');
  const nextCharge = await cash.createCharge(user.id, { ...chargeInput, requestKey: randomUUID() }, 'CUSTOMER_QR', tenant.slug);
  assert.equal(nextCharge.paymentPolicy.merchantWallet, replacement); assert.equal(nextCharge.cashbackCents, 900); assert.equal(nextCharge.commissionCents, 300);
  updatedPartner = await partners.update(admin.id, { id: partner.id, updatedAt: updatedPartner.updatedAt.toISOString(), name: partner.name, receivingWallets: { sandbox: '' } });
  assert.equal((await asaas.cashPix(user.id, charge.id)).id, intent.id);
  const count = await db.paymentCharge.count();
  await assert.rejects(cash.createCharge(user.id, { ...chargeInput, requestKey: randomUUID() }, 'CUSTOMER_QR', tenant.slug), { code: 'ASAAS_MERCHANT_NOT_CONFIGURED' });
  assert.equal(await db.paymentCharge.count(), count, 'invalid receiver cannot leave a pending unpayable charge');

  assert.ok(await db.auditLog.count({ where: { action: 'BUSINESS_SETTINGS_UPDATED' } }) >= 3);
});
