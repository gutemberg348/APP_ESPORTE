import { AppError } from '../lib/errors.js';
import { serializable, assertAvailability, ticketPrice } from '../lib/business-rules.js';
import { assertSalesOpen, inventoryWhere } from '../lib/ticket-rules.js';
import { isActiveMember } from '../lib/serializers.js';
import { ticketInclude, toTicket } from '../lib/ticket-serializers.js';

export function createTicketCheckoutStore(client, { now = () => new Date() } = {}) {
  async function checkout(tx, userId, { matchId, sectorId, quantity }) {
    const instant = now();
    const [match, user, existing] = await Promise.all([
      tx.match.findUnique({ where: { id: matchId }, include: { sectors: true } }),
      tx.user.findUnique({ where: { id: userId }, include: { membership: { include: { plan: true } } } }),
      tx.ticket.findUnique({ where: { userId_matchId: { userId, matchId } }, include: { payment: true } }),
    ]);
    if (!user?.active || !['USER', 'ADMIN'].includes(user.role)) throw new AppError(403, 'TICKET_ACCOUNT_REQUIRED', 'Sua conta não está habilitada para comprar ingressos.');
    if (!match) throw new AppError(404, 'MATCH_NOT_FOUND', 'Jogo não encontrado.');
    const sector = match.sectors.find((item) => item.id === sectorId);
    if (!sector) throw new AppError(422, 'INVALID_SECTOR', 'O setor não pertence a este jogo.');
    assertSalesOpen(match, sector, instant);
    if (existing?.payment || (existing && existing.status !== 'CANCELED' && !(existing.status === 'PENDING' && existing.expiresAt && existing.expiresAt <= instant))) throw new AppError(409, 'TICKET_EXISTS', 'Você já tem uma compra ou reserva para este jogo. Consulte Meus ingressos.');
    const reserved = await tx.ticket.aggregate({ where: { sectorId, ...inventoryWhere(instant) }, _sum: { quantity: true } });
    const available = Math.max(0, sector.capacity - (reserved._sum.quantity || 0));
    assertAvailability(sector.capacity, reserved._sum.quantity || 0, quantity);
    const discountPercent = isActiveMember(user, instant) ? user.membership.plan.discountPercent : 0;
    const totalCents = ticketPrice(sector.priceCents, discountPercent, quantity);
    return { match, user, existing, sector, available, discountPercent, totalCents, instant };
  }
  return {
    quote(userId, input) {
      return serializable(client, async (tx) => {
        const value = await checkout(tx, userId, input);
        const { match, user, sector, available, discountPercent, totalCents, instant } = value;
        return {
          match, sector: { ...sector, available }, quantity: input.quantity, available,
          unitPriceCents: ticketPrice(sector.priceCents, discountPercent, 1),
          subtotalCents: sector.priceCents * input.quantity, discountPercent,
          discountCents: sector.priceCents * input.quantity - totalCents, totalCents,
          serverTime: instant.toISOString(),
          expiresAt: new Date(Math.min(instant.getTime() + 60000, match.startsAt.getTime(), match.salesCloseAt?.getTime() ?? Infinity, discountPercent > 0 ? user.membership.validUntil.getTime() : Infinity)).toISOString(),
        };
      });
    },
    reserve(userId, input) {
      return serializable(client, async (tx) => {
        const { matchId, sectorId, quantity, expectedTotalCents } = input;
        const { match, user, existing, sector, totalCents } = await checkout(tx, userId, input);
        // Recheck the sale window and time-sensitive membership after DB waits.
        const instant = now();
        assertSalesOpen(match, sector, instant);
        const currentTotal = ticketPrice(sector.priceCents, isActiveMember(user, instant) ? user.membership.plan.discountPercent : 0, quantity);
        if (currentTotal !== totalCents || (expectedTotalCents !== undefined && expectedTotalCents !== totalCents)) throw new AppError(409, 'TICKET_PRICE_CHANGED', 'O preço ou desconto mudou. Revise os valores atualizados antes de confirmar.');
        const free = totalCents === 0;
        const expiresAt = free ? null : new Date(Math.min(instant.getTime() + 15 * 60000, match.startsAt.getTime(), match.salesCloseAt?.getTime() ?? Infinity));
        const data = { userId, matchId, sectorId, quantity, priceCents: totalCents, status: free ? 'ISSUED' : 'PENDING', usedQuantity: 0, entryToken: null, entryVersion: 0, expiresAt };
        let ticket = existing ? await tx.ticket.update({ where: { id: existing.id }, data: { ...data, createdAt: instant }, include: ticketInclude }) : await tx.ticket.create({ data, include: ticketInclude });
        if (free) {
          await tx.ticketPayment.create({ data: { ticketId: ticket.id, method: 'FREE', amountCents: 0, reference: `FREE-${ticket.id}` } });
          ticket = await tx.ticket.findUnique({ where: { id: ticket.id }, include: ticketInclude });
        }
        await tx.auditLog.create({ data: { actorId: userId, action: free ? 'TICKET_FREE_ISSUED' : 'TICKET_RESERVED', entityId: ticket.id, details: { matchId, sectorId, quantity, totalCents } } });
        return toTicket(ticket, now());
      });
    },
  };
}
