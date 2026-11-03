import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../config/database.js';
import { serializable } from '../lib/business-rules.js';
import { hashToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { splitPayment, assertClaimable, assertSettlement, paymentTransition } from '../lib/payment-rules.js';
import { paymentGateway } from '../payments/gateway.js';

const includeCharge = { offer: { include: { tenant: true, merchant: true } } };
const customerCode = () => `NC-${randomBytes(16).toString('hex').toUpperCase()}`;
async function findTenant(client, slug) {
  const tenant = await client.tenant.findUnique({ where: { slug } });
  if (!tenant?.active) throw new AppError(404, 'TENANT_NOT_FOUND', 'Instituição indisponível.');
  return tenant;
}
async function ensureWallet(client, userId, tenantId) {
  return client.cashWallet.upsert({ where: { tenantId_userId: { tenantId, userId } }, update: {}, create: { tenantId, userId, customerCode: customerCode() } });
}
async function assertOperator(client, userId, merchantId) {
  const operator = await client.merchantOperator.findUnique({ where: { userId_merchantId: { userId, merchantId } }, include: { merchant: true } });
  if (!operator?.active || !operator.merchant.active) throw new AppError(403, 'MERCHANT_ACCESS_DENIED', 'Você não tem acesso a este caixa.');
}

export const paymentModel = {
  async wallet(userId, tenantSlug) {
    const tenant = await findTenant(db, tenantSlug);
    const wallet = await ensureWallet(db, userId, tenant.id);
    const [entries, charges] = await Promise.all([
      db.cashEntry.findMany({ where: { walletId: wallet.id }, include: { charge: includeCharge }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
      db.paymentCharge.findMany({ where: { walletId: wallet.id }, include: includeCharge, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
    ]);
    return { wallet, tenant, entries, charges };
  },
  async merchantSetup(userId) {
    return db.merchantOperator.findMany({ where: { userId, active: true, merchant: { active: true } }, include: { merchant: { include: { offers: { where: { active: true, tenant: { active: true } }, include: { tenant: true } } } } } });
  },
  async merchantCharges(userId) {
    return db.paymentCharge.findMany({ where: { offer: { merchant: { active: true, operators: { some: { userId, active: true } } } } }, include: includeCharge, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 });
  },
  async resolveSale(userId, code) {
    const charge = await db.paymentCharge.findUnique({ where: { claimCode: code }, include: { ...includeCharge, wallet: true } });
    if (!charge || !charge.offer.active || !charge.offer.tenant.active || !charge.offer.merchant.active) throw new AppError(404, 'SALE_NOT_FOUND', 'Venda indisponível.');
    if (charge.wallet && charge.wallet.userId !== userId) throw new AppError(403, 'SALE_NOT_OWNED', 'Esta venda pertence a outra conta.');
    return charge;
  },
  claimSale(userId, code) {
    return serializable(db, async (tx) => {
      const charge = await tx.paymentCharge.findUnique({ where: { claimCode: code }, include: includeCharge });
      if (!charge || !charge.offer.active || !charge.offer.tenant.active || !charge.offer.merchant.active) throw new AppError(404, 'SALE_NOT_FOUND', 'Venda indisponível.');
      const wallet = await ensureWallet(tx, userId, charge.offer.tenantId);
      assertClaimable(charge, wallet.id);
      // Conditional assignment plus Serializable prevents competing claims.
      return tx.paymentCharge.update({ where: { id: charge.id }, data: { walletId: wallet.id }, include: includeCharge });
    });
  },
  async ownCharge(userId, id) {
    const charge = await db.paymentCharge.findFirst({ where: { id, wallet: { userId } }, include: includeCharge });
    if (!charge) throw new AppError(404, 'SALE_NOT_FOUND', 'Venda não encontrada na sua conta.');
    return charge;
  },
  createCharge(userId, input, channel, tenantSlug) {
    return serializable(db, async (tx) => {
      let offer;
      if (channel === 'CASHIER_QR') {
        offer = await tx.merchantOffer.findUnique({ where: { id: input.offerId }, include: { merchant: true, tenant: true } });
        if (offer) await assertOperator(tx, userId, offer.merchantId);
      } else {
        const tenant = await findTenant(tx, tenantSlug);
        offer = await tx.merchantOffer.findFirst({ where: { tenantId: tenant.id, merchant: { publicCode: input.merchantCode } }, include: { merchant: true, tenant: true } });
        if (offer && !offer.customerQrEnabled) throw new AppError(409, 'CUSTOMER_QR_DISABLED', 'O QR fixo ainda não foi habilitado nesta loja.');
      }
      if (!offer?.active || !offer.tenant.active || !offer.merchant.active) throw new AppError(404, 'OFFER_NOT_FOUND', 'Parceria indisponível.');
      let wallet = null;
      if (channel === 'CUSTOMER_QR') wallet = await ensureWallet(tx, userId, offer.tenantId);
      else if (input.customerCode) {
        wallet = await tx.cashWallet.findFirst({ where: { tenantId: offer.tenantId, customerCode: input.customerCode } });
        if (!wallet) throw new AppError(422, 'CUSTOMER_NOT_FOUND', 'Código do torcedor não encontrado nesta instituição.');
      }
      const previous = await tx.paymentCharge.findUnique({ where: { creatorId_requestKey: { creatorId: userId, requestKey: input.requestKey } }, include: includeCharge });
      if (previous) {
        // Binding after issuance does not alter the identity of the original request.
        if (previous.offerId !== offer.id || previous.grossCents !== input.amountCents || previous.channel !== channel || (wallet && previous.walletId !== wallet.id)) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Este identificador já foi usado para outra venda.');
        return previous;
      }
      const id = randomUUID();
      const split = splitPayment(input.amountCents, offer.cashbackBps, offer.commissionBps);
      const expiresAt = new Date(Date.now() + 15 * 60000);
      // The demo adapter does no IO. Real providers must use an outbox/recovery
      // workflow and charge.id as their idempotency key before being enabled.
      const gateway = await paymentGateway.createCharge({ chargeId: id, offer, wallet, ...split, expiresAt });
      return tx.paymentCharge.create({ data: { id, offerId: offer.id, creatorId: userId, walletId: wallet?.id, channel, requestKey: input.requestKey, claimCode: randomBytes(24).toString('base64url'), ...split, ...gateway }, include: includeCharge });
    });
  },
  async simulateEvent(userId, { chargeId, type, eventId }) {
    const charge = await db.paymentCharge.findUnique({ where: { id: chargeId }, include: includeCharge });
    if (!charge) throw new AppError(404, 'SALE_NOT_FOUND', 'Venda não encontrada.');
    await assertOperator(db, userId, charge.offer.merchantId);
    if (charge.provider !== 'demo') throw new AppError(403, 'REAL_PAYMENT_PROTECTED', 'Somente cobranças demonstrativas podem ser simuladas.');
    return paymentModel.applyVerifiedEvent({ provider: 'demo', externalId: eventId, chargeId, type, currency: 'BRL', grossCents: charge.grossCents, merchantCents: charge.merchantCents, cashbackCents: charge.cashbackCents, commissionCents: charge.commissionCents, gatewayFeeCents: charge.gatewayFeeCents, occurredAt: new Date() });
  },
  // Only a verified adapter or the protected non-production simulator may call
  // this method. There is no public endpoint accepting normalized trusted events.
  applyVerifiedEvent(event) {
    const fingerprint = hashToken(JSON.stringify([event.chargeId, event.type, event.currency, event.grossCents, event.merchantCents, event.cashbackCents, event.commissionCents, event.gatewayFeeCents]));
    return serializable(db, async (tx) => {
      const prior = await tx.paymentEvent.findUnique({ where: { provider_externalId: { provider: event.provider, externalId: event.externalId } } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new AppError(409, 'EVENT_ID_CONFLICT', 'Identificador de evento já utilizado.');
        return { duplicate: true };
      }
      const charge = await tx.paymentCharge.findUnique({ where: { id: event.chargeId }, include: includeCharge });
      if (!charge || charge.provider !== event.provider) throw new AppError(404, 'SALE_NOT_FOUND', 'Cobrança não encontrada para este provedor.');
      assertSettlement(charge, event);
      const next = paymentTransition(charge.status, event.type);
      if (next === 'PAID' && charge.status !== 'PAID' && !charge.walletId) throw new AppError(409, 'CUSTOMER_REQUIRED', 'Vincule um torcedor antes de concluir esta venda demonstrativa.');
      await tx.paymentEvent.create({ data: { chargeId: charge.id, provider: event.provider, externalId: event.externalId, fingerprint, type: event.type, occurredAt: event.occurredAt } });
      if (next === charge.status) return { duplicate: false, ignored: true };
      if (charge.walletId && charge.cashbackCents > 0 && (next === 'PAID' || (next === 'REFUNDED' && charge.status === 'PAID'))) {
        const amountCents = next === 'PAID' ? charge.cashbackCents : -charge.cashbackCents;
        const wallet = await tx.cashWallet.update({ where: { id: charge.walletId }, data: { balanceCents: { increment: amountCents } } });
        await tx.cashEntry.create({ data: { walletId: wallet.id, chargeId: charge.id, kind: next === 'PAID' ? 'CASHBACK' : 'REVERSAL', amountCents, balanceAfterCents: wallet.balanceCents } });
      }
      await tx.paymentCharge.update({ where: { id: charge.id }, data: { status: next, ...(next === 'PAID' ? { paidAt: event.occurredAt } : { refundedAt: event.occurredAt }) } });
      return { duplicate: false, status: next };
    });
  },
};
