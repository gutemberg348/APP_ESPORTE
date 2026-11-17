import { createHash, randomUUID } from 'node:crypto';
import { serializable } from '../lib/business-rules.js';
import { readBusinessSettings } from '../lib/business-settings.js';
import { AppError } from '../lib/errors.js';
export const membershipSignature = row => createHash('sha256').update(JSON.stringify(row ? [row.id, row.planId, row.status, row.validUntil, row.lastOrderId] : null)).digest('hex');
const fail = (code, message) => new AppError(409, code, message);
const render = row => ({ id: row.id, planName: row.planName, priceCents: row.priceCents, durationDays: row.durationDays, status: row.status, expiresAt: row.expiresAt, validUntil: row.validUntil, intentId: row.intent?.id || null, createdAt: row.createdAt });
export function createMembershipStore(db, settings, now = () => new Date()) {
  return {
    plans: () => db.plan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' }, take: 100 }),
    orders: async userId => (await db.membershipOrder.findMany({ where: { userId }, include: { intent: { select: { id: true } } }, orderBy: { createdAt: 'desc' }, take: 30 })).map(render),
    checkout: (userId, input) => serializable(db, async tx => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { membership: true } });
      if (!user?.active || user.role !== 'USER') throw new AppError(403, 'MEMBERSHIP_USER_ONLY', 'Use uma conta ativa de torcedor.');
      const existing = await tx.membershipOrder.findUnique({ where: { userId_requestKey: { userId, requestKey: input.requestKey } }, include: { intent: { select: { id: true } } } });
      if (existing) { if (existing.planId !== input.planId || existing.priceCents !== input.expectedPriceCents) throw fail('MEMBERSHIP_KEY_REUSED', 'A tentativa pertence a outro plano.'); return render(existing); }
      if (settings.PAYMENT_MODE !== 'sicredi') throw fail('MEMBERSHIP_PIX_DISABLED', 'O pagamento de planos ainda não foi habilitado pelo clube.');
      if (user.membership?.status === 'ACTIVE' && user.membership.validUntil > now()) throw fail('MEMBERSHIP_ALREADY_ACTIVE', 'Sua associação já está ativa. Aguarde o término para renovar ou fale com o clube.');
      const pending = await tx.membershipOrder.findFirst({ where: { userId, status: 'PENDING', expiresAt: { gt: now() } }, include: { intent: { select: { id: true } } } });
      if (pending) { if (pending.planId !== input.planId) throw fail('MEMBERSHIP_PENDING', 'Você já tem um Pix em aberto. Consulte seu pedido antes de escolher outro plano.'); return render(pending); }
      const plan = await tx.plan.findUnique({ where: { id: input.planId } });
      if (!plan?.active || plan.priceCents <= 0) throw fail('PLAN_UNAVAILABLE', 'Este plano não está disponível para compra por Pix. Consulte o clube.');
      if (plan.priceCents !== input.expectedPriceCents) throw fail('PLAN_PRICE_CHANGED', 'O valor mudou. Atualize os planos e confira antes de pagar.');
      const rules = await readBusinessSettings(tx);
      const id = randomUUID(), expiresAt = new Date(now().getTime() + rules.membershipPaymentMinutes * 60000);
      const order = await tx.membershipOrder.create({ data: { id, userId, planId: plan.id, planName: plan.name, priceCents: plan.priceCents, durationDays: plan.durationDays, requestKey: input.requestKey, beforeSignature: membershipSignature(user.membership), expiresAt, createdAt: now(), intent: { create: {
        provider: 'sicredi', environment: settings.SICREDI_PIX_ENV, generation: `membership:${id}`, amountCents: plan.priceCents, expiresAt,
        providerReference: `${settings.SICREDI_PIX_TXID_PREFIX}${randomUUID().replaceAll('-', '')}`,
        snapshot: { userId, receivingKeyHash: createHash('sha256').update(settings.SICREDI_PIX_RECEIVING_KEY).digest('hex') },
      } } }, include: { intent: { select: { id: true } } } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'MEMBERSHIP_PIX_REQUESTED', entityId: id, details: { planId: plan.id, priceCents: plan.priceCents, durationDays: plan.durationDays } } });
      return render(order);
    }),
  };
}
export async function settleMembership(tx, intent, received, now) {
  const order = await tx.membershipOrder.findUnique({ where: { id: intent.membershipOrderId }, include: { user: { include: { membership: true } } } });
  if (order?.appliedAt) return order.status === 'PAID';
  if (!order || order.status !== 'PENDING' || !order.user.active || order.user.role !== 'USER' || intent.cancelRequestedAt || intent.amountCents !== order.priceCents || Date.parse(received.horario) < Math.floor(order.createdAt.getTime() / 1000) * 1000 || Date.parse(received.horario) > order.expiresAt.getTime() || membershipSignature(order.user.membership) !== order.beforeSignature) return false;
  const validUntil = new Date(now().getTime() + order.durationDays * 86400000);
  await tx.membership.upsert({ where: { userId: order.userId }, create: { userId: order.userId, planId: order.planId, status: 'ACTIVE', memberId: `EC-${randomUUID().replaceAll('-', '').slice(0,16).toUpperCase()}`, validUntil, lastOrderId: order.id }, update: { planId: order.planId, status: 'ACTIVE', validUntil, lastOrderId: order.id } });
  await tx.membershipOrder.update({ where: { id: order.id }, data: { status: 'PAID', appliedAt: now(), validUntil } });
  await tx.auditLog.create({ data: { actorId: order.userId, action: 'MEMBERSHIP_PIX_ACTIVATED', entityId: order.id, details: { validUntil: validUntil.toISOString(), intentId: intent.id } } });
  return true;
}
export async function reverseMembership(tx, intent) {
  await tx.membershipOrder.updateMany({ where: { id: intent.membershipOrderId }, data: { status: 'REFUNDING' } });
  // A later manual grant or a different paid period must remain untouched.
  await tx.membership.updateMany({ where: { lastOrderId: intent.membershipOrderId }, data: { status: 'EXPIRED' } });
}
