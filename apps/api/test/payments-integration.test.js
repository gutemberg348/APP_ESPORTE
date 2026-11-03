import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('cashback: tenant isolation, merchant scope, concurrent claims, replay and refunds', { skip: process.env.RUN_DB_TESTS !== 'true' }, async (t) => {
  const { env } = await import('../src/config/env.js');
  if (env.NODE_ENV === 'production') throw new Error('Use somente banco de desenvolvimento.');
  const beforeMode = env.PAYMENT_MODE;
  env.PAYMENT_MODE = 'demo';
  const { db } = await import('../src/config/database.js');
  const { paymentModel } = await import('../src/models/payment.model.js');
  const nonce = randomUUID();
  const userIds = [], tenantIds = [], merchantIds = [], offerIds = [];
  t.after(async () => {
    env.PAYMENT_MODE = beforeMode;
    // Every filter is restricted to this test's UUIDs, including on failure.
    await db.$transaction([
      db.paymentEvent.deleteMany({ where: { charge: { offerId: { in: offerIds } } } }),
      db.cashEntry.deleteMany({ where: { charge: { offerId: { in: offerIds } } } }),
      db.paymentCharge.deleteMany({ where: { offerId: { in: offerIds } } }),
      db.cashWallet.deleteMany({ where: { tenantId: { in: tenantIds } } }),
      db.merchantOperator.deleteMany({ where: { userId: { in: userIds } } }),
      db.merchantOffer.deleteMany({ where: { id: { in: offerIds } } }),
      db.merchant.deleteMany({ where: { id: { in: merchantIds } } }),
      db.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      db.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    await db.$disconnect();
  });
  async function user(label) {
    const result = await db.user.create({ data: { name: label, email: `${label}-${nonce}@payments.test.local`, passwordHash: 'not-used-in-model-test' } });
    userIds.push(result.id); return result;
  }
  const cashier = await user('cashier'), alice = await user('alice'), bob = await user('bob');
  const tenantA = await db.tenant.create({ data: { slug: `a-${nonce}`, name: 'Clube A teste' } }); tenantIds.push(tenantA.id);
  const tenantB = await db.tenant.create({ data: { slug: `b-${nonce}`, name: 'Clube B teste' } }); tenantIds.push(tenantB.id);
  const merchant = await db.merchant.create({ data: { slug: `store-${nonce}`, name: 'Loja teste' } }); merchantIds.push(merchant.id);
  const foreignMerchant = await db.merchant.create({ data: { slug: `other-${nonce}`, name: 'Outra loja' } }); merchantIds.push(foreignMerchant.id);
  await db.merchantOperator.create({ data: { userId: cashier.id, merchantId: merchant.id } });
  async function offer(tenantId, merchantId) {
    const result = await db.merchantOffer.create({ data: { tenantId, merchantId, cashbackBps: 1000, commissionBps: 200 } }); offerIds.push(result.id); return result;
  }
  const offerA = await offer(tenantA.id, merchant.id), offerB = await offer(tenantB.id, merchant.id), foreignOffer = await offer(tenantA.id, foreignMerchant.id);
  const aliceA = (await paymentModel.wallet(alice.id, tenantA.slug)).wallet;
  const aliceB = (await paymentModel.wallet(alice.id, tenantB.slug)).wallet;
  await paymentModel.wallet(bob.id, tenantA.slug);
  const input = { offerId: offerA.id, amountCents: 10000, requestKey: randomUUID() };
  await assert.rejects(paymentModel.createCharge(alice.id, input, 'CASHIER_QR'), { code: 'MERCHANT_ACCESS_DENIED' });
  await assert.rejects(paymentModel.createCharge(cashier.id, { ...input, offerId: foreignOffer.id }, 'CASHIER_QR'), { code: 'MERCHANT_ACCESS_DENIED' });
  await assert.rejects(paymentModel.createCharge(cashier.id, { ...input, customerCode: aliceB.customerCode }, 'CASHIER_QR'), { code: 'CUSTOMER_NOT_FOUND' });
  const sale = await paymentModel.createCharge(cashier.id, input, 'CASHIER_QR');
  assert.equal((await paymentModel.createCharge(cashier.id, input, 'CASHIER_QR')).id, sale.id);
  await assert.rejects(paymentModel.createCharge(cashier.id, { ...input, amountCents: 20000 }, 'CASHIER_QR'), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(sale.pixPayload, null);
  assert.equal(sale.walletId, null);
  assert.equal(sale.cashbackCents, 1000);
  await assert.rejects(paymentModel.simulateEvent(cashier.id, { chargeId: sale.id, type: 'SETTLED', eventId: randomUUID() }), { code: 'CUSTOMER_REQUIRED' });
  const claims = await Promise.allSettled([paymentModel.claimSale(alice.id, sale.claimCode), paymentModel.claimSale(bob.id, sale.claimCode)]);
  assert.equal(claims.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(claims.filter((r) => r.status === 'rejected').length, 1);
  const winner = claims[0].status === 'fulfilled' ? alice : bob;
  const loser = winner.id === alice.id ? bob : alice;
  await assert.rejects(paymentModel.ownCharge(loser.id, sale.id), { code: 'SALE_NOT_FOUND' });
  await assert.rejects(paymentModel.resolveSale(loser.id, sale.claimCode), { code: 'SALE_NOT_OWNED' });
  await assert.rejects(paymentModel.simulateEvent(winner.id, { chargeId: sale.id, type: 'SETTLED', eventId: randomUUID() }), { code: 'MERCHANT_ACCESS_DENIED' });
  const firstId = randomUUID();
  await Promise.all([
    paymentModel.simulateEvent(cashier.id, { chargeId: sale.id, type: 'SETTLED', eventId: firstId }),
    paymentModel.simulateEvent(cashier.id, { chargeId: sale.id, type: 'SETTLED', eventId: randomUUID() }),
  ]);
  assert.equal((await paymentModel.simulateEvent(cashier.id, { chargeId: sale.id, type: 'SETTLED', eventId: firstId })).duplicate, true);
  assert.equal((await paymentModel.wallet(winner.id, tenantA.slug)).wallet.balanceCents, 1000);
  assert.equal((await paymentModel.wallet(winner.id, tenantB.slug)).wallet.balanceCents, 0);
  assert.equal(await db.cashEntry.count({ where: { chargeId: sale.id, kind: 'CASHBACK' } }), 1);
  assert.equal((await db.user.findUnique({ where: { id: winner.id } })).points, 0);
  await paymentModel.simulateEvent(cashier.id, { chargeId: sale.id, type: 'REFUNDED', eventId: randomUUID() });
  await paymentModel.simulateEvent(cashier.id, { chargeId: sale.id, type: 'REFUNDED', eventId: randomUUID() });
  await paymentModel.simulateEvent(cashier.id, { chargeId: sale.id, type: 'SETTLED', eventId: randomUUID() });
  assert.equal((await paymentModel.wallet(winner.id, tenantA.slug)).wallet.balanceCents, 0);
  assert.equal(await db.cashEntry.count({ where: { chargeId: sale.id } }), 2);
  assert.equal((await db.paymentCharge.findUnique({ where: { id: sale.id } })).status, 'REFUNDED');
  const fixedInput = { merchantCode: merchant.publicCode, amountCents: 10000, requestKey: randomUUID() };
  await assert.rejects(paymentModel.createCharge(alice.id, fixedInput, 'CUSTOMER_QR', tenantA.slug), { code: 'CUSTOMER_QR_DISABLED' });
  await db.merchantOffer.update({ where: { id: offerA.id }, data: { customerQrEnabled: true } });
  const fixed = await paymentModel.createCharge(alice.id, fixedInput, 'CUSTOMER_QR', tenantA.slug);
  assert.equal(fixed.walletId, aliceA.id);
  assert.equal(fixed.channel, 'CUSTOMER_QR');
  await assert.rejects(paymentModel.simulateEvent(cashier.id, { chargeId: fixed.id, type: 'SETTLED', eventId: firstId }), { code: 'EVENT_ID_CONFLICT' });
  const expired = await paymentModel.createCharge(cashier.id, { ...input, requestKey: randomUUID() }, 'CASHIER_QR');
  await db.paymentCharge.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(paymentModel.claimSale(alice.id, expired.claimCode), { code: 'SALE_CLOSED' });
  assert.equal((await paymentModel.merchantCharges(alice.id)).length, 0);
  assert.equal((await paymentModel.merchantSetup(cashier.id))[0].merchant.offers.some((r) => r.id === offerB.id), true);
});
