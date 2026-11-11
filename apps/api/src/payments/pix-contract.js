import { createHash } from 'node:crypto';
const hash = (value) => createHash('sha256').update(value).digest('hex');
export const ticketGeneration = (ticket) => hash(JSON.stringify([ticket.id, ticket.createdAt, ticket.sectorId, ticket.quantity, ticket.priceCents, ticket.expiresAt]));
export function publicIntent(intent, now = new Date()) {
  const payable = intent.state === 'PENDING' && !intent.cancelRequestedAt && !intent.refundRequestedAt && intent.expiresAt > now;
  return { provider: intent.provider || 'asaas', id: intent.id, ticketId: intent.ticketId, chargeId: intent.chargeId, shopOrderId: intent.shopOrderId || null, environment: intent.environment, state: intent.state, amountCents: intent.amountCents, refundedCents: intent.refundedCents, pixPayload: payable ? intent.pixPayload : null, expiresAt: intent.expiresAt, failureCode: intent.failureCode, serverTime: now.toISOString() };
}
