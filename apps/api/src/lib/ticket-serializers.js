export const ticketInclude = { match: { include: { sectors: true } }, sector: true, payment: true };
export function toTicket(ticket, now = new Date()) {
  const { entryToken, entryVersion, userId, user, admissions, payment, ...safe } = ticket;
  return {
    ...safe,
    status: ticket.status === 'PENDING' && ticket.expiresAt && ticket.expiresAt <= now ? 'EXPIRED' : ticket.status,
    serverTime: now.toISOString(),
    usedQuantity: ticket.usedQuantity,
    remainingQuantity: Math.max(0, ticket.quantity - ticket.usedQuantity),
    entryQr: null,
    payment: payment ? { method: payment.method, amountCents: payment.amountCents, confirmedAt: payment.confirmedAt } : null,
  };
}
export function toAdminTicket(ticket) {
  const { user, ...rest } = ticket;
  const safe = toTicket(rest);
  return { ...safe, entryQr: null, user: user ? { id: user.id, name: user.name, email: user.email } : undefined };
}
