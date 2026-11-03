import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPayment, paymentTransition, assertClaimable, assertSettlement } from '../src/lib/payment-rules.js';
import { merchantChargeSchema, customerChargeSchema } from '../src/validators/payment.js';

test('sale of R$100 preserves R$88 merchant, R$10 cashback and R$2 commission', () => {
  assert.deepEqual(splitPayment(10000, 1000, 200), { grossCents: 10000, merchantCents: 8800, cashbackCents: 1000, commissionCents: 200, gatewayFeeCents: 0 });
  const withFee = splitPayment(10000, 1000, 200, 99);
  assert.equal(withFee.merchantCents, 8701);
});
test('rounding conserves every cent and rejects splits exceeding the gross amount', () => {
  for (const amount of [1, 9, 99, 1999, 99999, 100000000]) {
    const split = splitPayment(amount, 333, 200);
    assert.equal(split.merchantCents + split.cashbackCents + split.commissionCents + split.gatewayFeeCents, amount);
  }
  for (const args of [[1, 5000, 5000], [100, 9500, 1000], [100, -1, 1], [100.5, 1000, 200], [0, 1, 1], [100, 1000, 200, 100], [100000001, 1, 1]]) {
    assert.throws(() => splitPayment(...args), { code: 'INVALID_SPLIT' });
  }
});
test('refund is terminal even when settlement is delivered later or twice', () => {
  assert.equal(paymentTransition('PENDING', 'SETTLED'), 'PAID');
  assert.equal(paymentTransition('PAID', 'SETTLED'), 'PAID');
  assert.equal(paymentTransition('PAID', 'REFUNDED'), 'REFUNDED');
  assert.equal(paymentTransition('REFUNDED', 'SETTLED'), 'REFUNDED');
  assert.equal(paymentTransition('PENDING', 'REFUNDED'), 'REFUNDED');
});
test('a sale cannot be claimed by another wallet, after expiration or payment', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const open = { status: 'PENDING', walletId: null, expiresAt: new Date('2026-10-14T12:15:00Z') };
  assert.doesNotThrow(() => assertClaimable(open, 'wallet-1', now));
  assert.doesNotThrow(() => assertClaimable({ ...open, walletId: 'wallet-1' }, 'wallet-1', now));
  assert.throws(() => assertClaimable({ ...open, walletId: 'wallet-2' }, 'wallet-1', now), { code: 'SALE_CLAIMED' });
  assert.throws(() => assertClaimable({ ...open, expiresAt: now }, 'wallet-1', now), { code: 'SALE_CLOSED' });
  assert.throws(() => assertClaimable({ ...open, status: 'PAID' }, 'wallet-1', now), { code: 'SALE_CLOSED' });
});
test('confirmation must match total, every split leg, currency and validity', () => {
  const charge = { ...splitPayment(10000, 1000, 200), expiresAt: new Date('2026-10-14T12:15:00Z') };
  const event = { ...charge, currency: 'BRL', type: 'SETTLED', occurredAt: new Date('2026-10-14T12:14:59Z') };
  assert.doesNotThrow(() => assertSettlement(charge, event));
  assert.throws(() => assertSettlement(charge, { ...event, cashbackCents: 2000 }), { code: 'SETTLEMENT_MISMATCH' });
  assert.throws(() => assertSettlement(charge, { ...event, currency: 'USD' }), { code: 'SETTLEMENT_MISMATCH' });
  assert.throws(() => assertSettlement(charge, { ...event, occurredAt: new Date('2026-10-14T12:16:00Z') }), { code: 'LATE_PAYMENT_REVIEW' });
});
test('cashier cannot supply split rates, paid status or a recipient bank account', () => {
  const input = { offerId: '6bcae09b-1af7-4566-8b13-b4cb432b5d0a', amountCents: 10000, requestKey: 'sale_request_key_001' };
  assert.equal(merchantChargeSchema.safeParse(input).success, true);
  for (const field of ['cashbackBps', 'commissionBps', 'status', 'walletId', 'pixKey']) assert.equal(merchantChargeSchema.safeParse({ ...input, [field]: 'tampered' }).success, false);
  assert.equal(customerChargeSchema.safeParse({ merchantCode: input.offerId, amountCents: 10000, requestKey: input.requestKey, userId: input.offerId }).success, false);
});
