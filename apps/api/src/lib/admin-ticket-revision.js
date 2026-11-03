import { createHash } from 'node:crypto';

// Includes the generation date because checkout can reuse a cancelled ticket ID.
export function adminTicketRevision(ticket) {
  return createHash('sha256').update(JSON.stringify([
    ticket.id, ticket.createdAt, ticket.status, ticket.sectorId, ticket.quantity,
    ticket.priceCents, ticket.expiresAt, ticket.entryVersion, ticket.usedQuantity,
    ticket.payment?.id ?? null,
  ])).digest('hex');
}
