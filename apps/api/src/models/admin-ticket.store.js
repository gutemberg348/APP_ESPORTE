import { AppError } from '../lib/errors.js';
import { serializable, assertAvailability, ticketPrice } from '../lib/business-rules.js';
import { assertSalesOpen, inventoryWhere, occupiedQuantity } from '../lib/ticket-rules.js';
import { isActiveMember } from '../lib/serializers.js';
import { ticketInclude, toAdminTicket } from '../lib/ticket-serializers.js';
import { adminTicketRevision } from '../lib/admin-ticket-revision.js';

const include = { ...ticketInclude, user: { include: { membership: { include: { plan: true } } } } };
const snapshot = (ticket) => ({ sectorId: ticket.sectorId, quantity: ticket.quantity, usedQuantity: ticket.usedQuantity, totalCents: ticket.priceCents, status: ticket.status, paymentId: ticket.payment?.id ?? null });

export function createAdminTicketStore(client, { now = () => new Date() } = {}) {
  async function load(tx, { ticketId, revision }, editing) {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, include });
    if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Venda não encontrada. Atualize a lista.');
    if (ticket.deletedAt) throw new AppError(409, 'SALE_DELETED', 'Esta venda já foi excluída. Consulte o histórico de excluídas.');
    if (revision !== adminTicketRevision(ticket)) throw new AppError(409, 'SALE_CHANGED', 'Esta venda mudou. Atualize a lista antes de continuar.');
    const entries = await tx.ticketAdmission.aggregate({ where: { ticketId }, _sum: { quantity: true } });
    if ((entries._sum.quantity || 0) !== ticket.usedQuantity) throw new AppError(409, 'SALE_ENTRY_INCONSISTENT', 'As entradas desta venda precisam de conferência antes da alteração.');
    if (editing) {
      if (ticket.payment) {
        const payment = ticket.payment;
        if (!['ISSUED', 'USED'].includes(ticket.status) || payment.amountCents !== ticket.priceCents || !['MANUAL', 'FREE'].includes(payment.method) || (payment.method === 'FREE' && ticket.priceCents !== 0) || (payment.method === 'MANUAL' && !payment.confirmedById)) throw new AppError(409, 'SALE_PAYMENT_INCONSISTENT', 'O pagamento desta venda precisa de conferência antes da edição.');
      } else if (ticket.usedQuantity > 0 || ticket.status !== 'PENDING' || !ticket.expiresAt || ticket.expiresAt <= now()) {
        throw new AppError(409, 'RESERVATION_EXPIRED', 'Reservas não pagas precisam estar pendentes e dentro do prazo para edição.');
      }
    }
    return ticket;
  }
  async function review(tx, input) {
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 4) throw new AppError(422, 'INVALID_QUANTITY', 'Informe de 1 a 4 entradas.');
    const ticket = await load(tx, input, true);
    const sector = ticket.match.sectors.find((item) => item.id === input.sectorId);
    if (!sector) throw new AppError(422, 'INVALID_SECTOR', 'O setor não pertence ao jogo desta venda.');
    if (input.quantity < ticket.usedQuantity) throw new AppError(409, 'QUANTITY_BELOW_USED', `Já foram utilizadas ${ticket.usedQuantity} entradas. A quantidade não pode ser menor.`);
    if (ticket.usedQuantity > 0 && sector.id !== ticket.sectorId) throw new AppError(409, 'USED_SECTOR_PROTECTED', 'Após uma entrada, mantenha o setor para preservar o histórico da portaria.');
    const paid = Boolean(ticket.payment);
    if (!paid) {
      if (!ticket.user?.active || !['USER', 'ADMIN'].includes(ticket.user.role)) throw new AppError(409, 'HOLDER_DISABLED', 'O titular desta reserva não está habilitado para comprar.');
      assertSalesOpen(ticket.match, sector, now());
    }
    const reserved = await tx.ticket.aggregate({ where: { id: { not: ticket.id }, sectorId: sector.id, ...inventoryWhere(now()) }, _sum: { quantity: true, voidedQuantity: true } });
    const occupied = occupiedQuantity(reserved._sum);
    assertAvailability(sector.capacity, occupied, input.quantity);
    const instant = now();
    if (!paid) {
      assertSalesOpen(ticket.match, sector, instant);
      if (ticket.expiresAt <= instant) throw new AppError(409, 'RESERVATION_EXPIRED', 'A reserva expirou durante a conferência.');
    }
    const discountPercent = !paid && isActiveMember(ticket.user, instant) ? ticket.user.membership.plan.discountPercent : 0;
    // Administrative changes never rewrite the original receipt or pretend a
    // charge/refund happened. The original paid total is kept intact.
    const totalCents = paid ? ticket.priceCents : ticketPrice(sector.priceCents, discountPercent, input.quantity);
    return { ticket, sector, available: Math.max(0, sector.capacity - occupied), discountPercent, totalCents, instant, paid };
  }
  return {
    quote(input) {
      return serializable(client, async (tx) => {
        const { ticket, sector, available, discountPercent, totalCents, instant, paid } = await review(tx, input);
        return {
          revision: adminTicketRevision(ticket), sector: { ...sector, available }, quantity: input.quantity,
          available, discountPercent, totalCents, priceLocked: paid,
          unitPriceCents: paid ? null : ticketPrice(sector.priceCents, discountPercent, 1),
          serverTime: instant.toISOString(),
          expiresAt: new Date(paid ? instant.getTime() + 60000 : Math.min(instant.getTime() + 60000, ticket.expiresAt.getTime(), ticket.match.startsAt.getTime(), ticket.match.salesCloseAt?.getTime() ?? Infinity, discountPercent > 0 ? ticket.user.membership.validUntil.getTime() : Infinity)).toISOString(),
        };
      });
    },
    update(actorId, input) {
      return serializable(client, async (tx) => {
        const { ticket, sector, totalCents, instant, paid } = await review(tx, input);
        if (input.expectedTotalCents !== totalCents) throw new AppError(409, 'TICKET_PRICE_CHANGED', 'O total mudou. Confira os valores novamente antes de salvar.');
        const free = !paid && totalCents === 0;
        const status = paid ? ticket.usedQuantity === input.quantity ? 'USED' : 'ISSUED' : free ? 'ISSUED' : 'PENDING';
        const expiresAt = paid || free ? null : new Date(Math.min(ticket.expiresAt.getTime(), ticket.match.startsAt.getTime(), ticket.match.salesCloseAt?.getTime() ?? Infinity));
        await tx.ticket.update({ where: { id: ticket.id }, data: { sectorId: sector.id, quantity: input.quantity, priceCents: totalCents, status, expiresAt, entryToken: null, entryVersion: { increment: 1 } } });
        await tx.ticketAccessCode.deleteMany({ where: { ticketId: ticket.id } });
        if (free) await tx.ticketPayment.create({ data: { ticketId: ticket.id, method: 'FREE', amountCents: 0, reference: `FREE-${ticket.id}` } });
        await tx.auditLog.create({ data: { actorId, action: 'TICKET_SALE_UPDATED', entityId: ticket.id, details: {
          reason: input.reason, userId: ticket.userId, matchId: ticket.matchId, paid,
          before: snapshot(ticket), after: { sectorId: sector.id, quantity: input.quantity, totalCents, status }, changedAt: instant.toISOString(),
        } } });
        return toAdminTicket(await tx.ticket.findUnique({ where: { id: ticket.id }, include }), now());
      });
    },
    remove(actorId, input) {
      return serializable(client, async (tx) => {
        const ticket = await load(tx, input, false), deletedAt = now();
        const voidedQuantity = ticket.quantity - ticket.usedQuantity;
        await tx.ticket.update({ where: { id: ticket.id }, data: { deletedAt, voidedQuantity, status: 'CANCELED', expiresAt: null, entryToken: null, entryVersion: { increment: 1 } } });
        await tx.ticketAccessCode.deleteMany({ where: { ticketId: ticket.id } });
        await tx.auditLog.create({ data: { actorId, action: 'TICKET_SALE_DELETED', entityId: ticket.id, details: {
          reason: input.reason, userId: ticket.userId, matchId: ticket.matchId, ...snapshot(ticket),
          paid: Boolean(ticket.payment), paymentAmountCents: ticket.payment?.amountCents ?? null,
          voidedQuantity, deletedAt: deletedAt.toISOString(), createdAt: ticket.createdAt.toISOString(),
        } } });
        return { ticketId: ticket.id, deleted: true, paid: Boolean(ticket.payment), voidedQuantity };
      });
    },
  };
}
