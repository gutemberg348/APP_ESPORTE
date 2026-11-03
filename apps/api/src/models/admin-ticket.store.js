import { AppError } from '../lib/errors.js';
import { serializable, assertAvailability, ticketPrice } from '../lib/business-rules.js';
import { assertSalesOpen, inventoryWhere } from '../lib/ticket-rules.js';
import { isActiveMember } from '../lib/serializers.js';
import { ticketInclude, toAdminTicket } from '../lib/ticket-serializers.js';
import { adminTicketRevision } from '../lib/admin-ticket-revision.js';

const include = { ...ticketInclude, user: { include: { membership: { include: { plan: true } } } } };

export function createAdminTicketStore(client, { now = () => new Date() } = {}) {
  async function load(tx, { ticketId, revision }, editing) {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, include });
    if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Venda não encontrada. Atualize a lista.');
    if (ticket.payment || !['PENDING', 'CANCELED'].includes(ticket.status) || ticket.usedQuantity > 0 || await tx.ticketAdmission.count({ where: { ticketId } })) {
      throw new AppError(409, 'PAID_TICKET_PROTECTED', 'Vendas com ingresso emitido, pagamento ou entrada registrada exigem tratamento de devolução.');
    }
    if (revision !== adminTicketRevision(ticket)) throw new AppError(409, 'SALE_CHANGED', 'Esta venda mudou. Atualize a lista antes de continuar.');
    if (editing && (ticket.status !== 'PENDING' || !ticket.expiresAt || ticket.expiresAt <= now())) {
      throw new AppError(409, 'RESERVATION_EXPIRED', 'Somente reservas pendentes e dentro do prazo podem ser editadas.');
    }
    return ticket;
  }
  async function review(tx, input) {
    const ticket = await load(tx, input, true);
    const sector = ticket.match.sectors.find((item) => item.id === input.sectorId);
    if (!sector) throw new AppError(422, 'INVALID_SECTOR', 'O setor não pertence ao jogo desta venda.');
    if (!ticket.user?.active || !['USER', 'ADMIN'].includes(ticket.user.role)) throw new AppError(409, 'HOLDER_DISABLED', 'O titular desta reserva não está habilitado para comprar.');
    assertSalesOpen(ticket.match, sector, now());
    // The order being edited already occupies inventory; count only other orders.
    const reserved = await tx.ticket.aggregate({ where: { id: { not: ticket.id }, sectorId: sector.id, ...inventoryWhere(now()) }, _sum: { quantity: true } });
    const occupied = reserved._sum.quantity || 0;
    assertAvailability(sector.capacity, occupied, input.quantity);
    const instant = now();
    assertSalesOpen(ticket.match, sector, instant);
    if (ticket.expiresAt <= instant) throw new AppError(409, 'RESERVATION_EXPIRED', 'A reserva expirou durante a conferência.');
    const discountPercent = isActiveMember(ticket.user, instant) ? ticket.user.membership.plan.discountPercent : 0;
    const totalCents = ticketPrice(sector.priceCents, discountPercent, input.quantity);
    return { ticket, sector, available: Math.max(0, sector.capacity - occupied), discountPercent, totalCents, instant };
  }
  return {
    quote(input) {
      return serializable(client, async (tx) => {
        const { ticket, sector, available, discountPercent, totalCents, instant } = await review(tx, input);
        return {
          revision: adminTicketRevision(ticket), sector: { ...sector, available }, quantity: input.quantity,
          available, discountPercent, totalCents, unitPriceCents: ticketPrice(sector.priceCents, discountPercent, 1),
          serverTime: instant.toISOString(),
          expiresAt: new Date(Math.min(instant.getTime() + 60000, ticket.expiresAt.getTime(), ticket.match.startsAt.getTime(), ticket.match.salesCloseAt?.getTime() ?? Infinity, discountPercent > 0 ? ticket.user.membership.validUntil.getTime() : Infinity)).toISOString(),
        };
      });
    },
    update(actorId, input) {
      return serializable(client, async (tx) => {
        const { ticket, sector, totalCents, instant } = await review(tx, input);
        if (input.expectedTotalCents !== totalCents) throw new AppError(409, 'TICKET_PRICE_CHANGED', 'O preço ou desconto mudou. Confira o total novamente antes de salvar.');
        const free = totalCents === 0;
        // Never extend a reservation through administrative edits.
        const expiresAt = free ? null : new Date(Math.min(ticket.expiresAt.getTime(), ticket.match.startsAt.getTime(), ticket.match.salesCloseAt?.getTime() ?? Infinity));
        await tx.ticket.update({ where: { id: ticket.id }, data: {
          sectorId: sector.id, quantity: input.quantity, priceCents: totalCents,
          status: free ? 'ISSUED' : 'PENDING', expiresAt, entryToken: null, entryVersion: { increment: 1 },
        } });
        await tx.ticketAccessCode.deleteMany({ where: { ticketId: ticket.id } });
        if (free) await tx.ticketPayment.create({ data: { ticketId: ticket.id, method: 'FREE', amountCents: 0, reference: `FREE-${ticket.id}` } });
        await tx.auditLog.create({ data: { actorId, action: 'TICKET_SALE_UPDATED', entityId: ticket.id, details: {
          reason: input.reason, userId: ticket.userId, matchId: ticket.matchId,
          before: { sectorId: ticket.sectorId, quantity: ticket.quantity, totalCents: ticket.priceCents },
          after: { sectorId: sector.id, quantity: input.quantity, totalCents }, changedAt: instant.toISOString(),
        } } });
        return toAdminTicket(await tx.ticket.findUnique({ where: { id: ticket.id }, include }), now());
      });
    },
    remove(actorId, input) {
      return serializable(client, async (tx) => {
        const ticket = await load(tx, input, false);
        await tx.auditLog.create({ data: { actorId, action: 'TICKET_SALE_DELETED', entityId: ticket.id, details: {
          reason: input.reason, userId: ticket.userId, matchId: ticket.matchId, sectorId: ticket.sectorId,
          quantity: ticket.quantity, totalCents: ticket.priceCents, status: ticket.status,
          createdAt: ticket.createdAt.toISOString(), expiresAt: ticket.expiresAt?.toISOString() ?? null,
        } } });
        await tx.ticket.delete({ where: { id: ticket.id } });
        return { ticketId: ticket.id, deleted: true };
      });
    },
  };
}
