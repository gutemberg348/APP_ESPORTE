import type { Match, Sector, Ticket } from '@nacional/shared/types';
export type TicketSection = 'catalog' | 'orders';
export const ticketStatusLabels = { PENDING: 'Aguardando pagamento', ISSUED: 'Ingresso emitido', USED: 'Utilizado', CANCELED: 'Reserva cancelada', EXPIRED: 'Reserva expirada' };
export function availablePlaces(sector: Sector): number | null {
  return Number.isSafeInteger(sector.available) && sector.available! >= 0 ? sector.available! : null;
}
export function ticketStatus(ticket: Ticket, now = Date.now()): Ticket['status'] {
  return ticket.status === 'PENDING' && ticket.expiresAt && Date.parse(ticket.expiresAt) <= now ? 'EXPIRED' : ticket.status;
}
export function activeTicket(tickets: Ticket[], matchId: string, now = Date.now()) {
  return tickets.find((ticket) => ticket.match.id === matchId && !['CANCELED', 'EXPIRED'].includes(ticketStatus(ticket, now)));
}
export function matchSaleState(match: Match, now = Date.now()) {
  const enabled = match.sectors.filter((sector) => sector.salesEnabled !== false);
  const known = enabled.filter((sector) => availablePlaces(sector) !== null);
  const available = known.reduce((sum, sector) => sum + availablePlaces(sector)!, 0);
  const purchasable = known.filter((sector) => availablePlaces(sector)! > 0);
  const fromPriceCents = purchasable.length ? Math.min(...purchasable.map((sector) => sector.priceCents)) : null;
  const state = (code: string, label: string, canBuy = false) => ({ code, label, canBuy, available, fromPriceCents });
  if (match.published === false) return state('DRAFT', 'Jogo não publicado');
  if (!Number.isFinite(Date.parse(match.startsAt)) || Date.parse(match.startsAt) <= now) return state('CLOSED', 'Vendas encerradas');
  if (match.salesEnabled === false) return state('PAUSED', 'Vendas pausadas');
  if (match.salesOpenAt && Date.parse(match.salesOpenAt) > now) return state('SCHEDULED', 'Vendas em breve');
  if (match.salesCloseAt && Date.parse(match.salesCloseAt) <= now) return state('CLOSED', 'Vendas encerradas');
  if (!enabled.length) return state('PAUSED', 'Setores indisponíveis');
  if (purchasable.length) return state('AVAILABLE', 'Vendas abertas', true);
  if (known.length !== enabled.length) return state('UNKNOWN', 'Atualize a disponibilidade');
  return state('SOLD_OUT', 'Ingressos esgotados');
}
export function reservationCountdown(ticket: Ticket, now = Date.now()) {
  const seconds = ticket.expiresAt ? Math.max(0, Math.ceil((Date.parse(ticket.expiresAt) - now) / 1000)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
