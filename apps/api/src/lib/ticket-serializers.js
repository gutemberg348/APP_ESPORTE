import { adminTicketRevision } from './admin-ticket-revision.js';
export const ticketInclude = { match: { include: { sectors: true } }, sector: true, payment: true };
export function toTicket(ticket, now = new Date()) {
  const { entryToken, entryVersion, userId, user, admissions, payment, ...safe } = ticket;
  return {
    ...safe,
    status: ticket.status === 'PENDING' && ticket.expiresAt && ticket.expiresAt <= now ? 'EXPIRED' : ticket.status,
    serverTime: now.toISOString(),
    usedQuantity: ticket.usedQuantity,
    remainingQuantity: Math.max(0, ticket.quantity - ticket.usedQuantity - (ticket.voidedQuantity || 0)),
    entryQr: null,
    payment: payment ? { method: payment.method, amountCents: payment.amountCents, confirmedAt: payment.confirmedAt } : null,
  };
}
export function toAdminTicket(ticket, now = new Date()) {
  const { user, ...rest } = ticket;
  const safe = toTicket(rest, now);
  return { ...safe, revision: adminTicketRevision(ticket), entryQr: null, user: user ? { id: user.id, name: user.name, email: user.email } : undefined };
}
