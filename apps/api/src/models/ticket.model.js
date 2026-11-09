import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { serializable } from '../lib/business-rules.js';
import { inventoryWhere, occupiedQuantity, assertManualConfirmation, assertNoPendingPix } from '../lib/ticket-rules.js';
import { createTicketCheckoutStore } from './ticket-checkout.store.js';
import { ticketInclude, toTicket } from '../lib/ticket-serializers.js';
import { recordTicketFinancial } from '../lib/ticket-finance.js';

const checkout = createTicketCheckoutStore(db);
export const writeAudit = (tx, actorId, action, entityId, details) => tx.auditLog.create({ data: { actorId, action, entityId, details } });
export async function withAvailability(client, matches) {
  const ids = matches.flatMap((match) => match.sectors.map((sector) => sector.id));
  const inventory = ids.length ? await client.ticket.groupBy({ by: ['sectorId'], where: { sectorId: { in: ids }, ...inventoryWhere() }, _sum: { quantity: true, voidedQuantity: true } }) : [];
  const occupied = new Map(inventory.map((item) => [item.sectorId, occupiedQuantity(item._sum)]));
  const serverTime = new Date().toISOString();
  return matches.map((match) => ({ ...match, serverTime, sectors: match.sectors.map((sector) => ({ ...sector, available: Math.max(0, sector.capacity - (occupied.get(sector.id) || 0)) })) }));
}
export const ticketModel = {
  async matches() {
    const matches = await db.match.findMany({ where: { published: true, startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, include: { sectors: { orderBy: { priceCents: 'asc' } } }, take: 50 });
    return withAvailability(db, matches);
  },
  async tickets(userId) {
    const tickets = await db.ticket.findMany({ where: { userId, deletedAt: null }, include: ticketInclude, orderBy: { createdAt: 'desc' }, take: 100 });
    return tickets.map((ticket) => toTicket(ticket));
  },
  quote: checkout.quote,
  reserve: checkout.reserve,
  async confirm(actorId, { ticketId, receivedCents, reference, gatewayFeeCents = 0 }) {
    try { return await serializable(db, async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, include: ticketInclude });
      if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Reserva não encontrada.');
      if (ticket.deletedAt) throw new AppError(409, 'SALE_DELETED', 'Esta venda foi excluída pela administração.');
      if (ticket.payment) {
        if (ticket.payment.reference === reference && ticket.payment.amountCents === receivedCents && (!ticket.payment.financial || ticket.payment.financial.gatewayFeeCents === gatewayFeeCents)) return toTicket(ticket);
        throw new AppError(409, 'PAYMENT_ALREADY_CONFIRMED', 'Pagamento já registrado para esta reserva.');
      }
      assertManualConfirmation(ticket, receivedCents);
      assertNoPendingPix(ticket);
      await tx.ticketPayment.create({ data: { ticketId, method: 'MANUAL', amountCents: receivedCents, reference, confirmedById: actorId } });
      await recordTicketFinancial(tx, ticket, { manualFeeCents: gatewayFeeCents, reason: 'Recebimento manual confirmado' });
      const updated = await tx.ticket.update({ where: { id: ticketId }, data: { status: 'ISSUED', entryToken: null, expiresAt: null }, include: ticketInclude });
      await writeAudit(tx, actorId, 'TICKET_PAYMENT_CONFIRMED', ticketId, { receivedCents, reference });
      return toTicket(updated);
    }); } catch (error) {
      // Concurrent identical confirmations can hit the unique index rather
      // than a serialization error. Read the committed winner; never retry a
      // different receipt or silently accept a different total.
      if (error.code === 'P2002') {
        const committed = await db.ticket.findUnique({ where: { id: ticketId }, include: ticketInclude });
        if (!committed?.deletedAt && committed?.payment?.reference === reference && committed.payment.amountCents === receivedCents && (!committed.payment.financial || committed.payment.financial.gatewayFeeCents === gatewayFeeCents)) return toTicket(committed);
      }
      throw error;
    }
  },
  cancel(actorId, ticketId, admin = false) {
    return serializable(db, async (tx) => {
      const ticket = await tx.ticket.findFirst({ where: { id: ticketId, ...(admin ? {} : { userId: actorId }) }, include: ticketInclude });
      if (!ticket || ticket.deletedAt) throw new AppError(404, 'TICKET_NOT_FOUND', 'Reserva não encontrada.');
      if (ticket.status === 'CANCELED') return toTicket(ticket);
      if (ticket.status !== 'PENDING' || ticket.payment) throw new AppError(409, 'PAID_TICKET_PROTECTED', 'Ingresso emitido exige fluxo de devolução; não pode ser cancelado como reserva.');
      const updated = await tx.ticket.update({ where: { id: ticketId }, data: { status: 'CANCELED', entryToken: null }, include: ticketInclude });
      await writeAudit(tx, actorId, 'TICKET_RESERVATION_CANCELED', ticketId, {});
      return toTicket(updated);
    });
  },
  paymentInstructions: () => env.PAYMENT_MODE === 'asaas' ? 'Pague com Pix pelo app do seu banco. O ingresso será emitido automaticamente após a confirmação do Asaas. Não pague depois do vencimento da reserva.' : env.TICKET_PAYMENT_INSTRUCTIONS,
};
