import { AppError } from './errors.js';
export function assertAdmin(user) {
  if (user?.role !== 'ADMIN' || user.active === false) throw new AppError(403, 'ADMIN_REQUIRED', 'Esta operação exige um administrador.');
}
export function assertSalesOpen(match, sector, now = new Date()) {
  if (!match?.published || !match.salesEnabled || !sector?.salesEnabled || (match.salesOpenAt && match.salesOpenAt > now) || (match.salesCloseAt && match.salesCloseAt <= now)) {
    throw new AppError(409, 'SALES_CLOSED', 'A venda de ingressos não está aberta para este setor.');
  }
  if (match.startsAt <= now) throw new AppError(409, 'MATCH_STARTED', 'A venda deste jogo foi encerrada.');
}
export function assertManualConfirmation(ticket, amountCents, now = new Date()) {
  if (ticket.status !== 'PENDING') throw new AppError(409, 'TICKET_NOT_PENDING', 'Esta reserva já foi concluída ou cancelada.');
  if (!ticket.expiresAt || ticket.expiresAt <= now) throw new AppError(409, 'RESERVATION_EXPIRED', 'A reserva expirou. Não emita antes de conferir uma nova reserva e a disponibilidade.');
  if (ticket.priceCents !== amountCents) throw new AppError(422, 'PAYMENT_AMOUNT_MISMATCH', 'O valor recebido deve corresponder ao total da reserva.');
}
export function assertAdmission(ticket, quantity) {
  if (ticket.status !== 'ISSUED') throw new AppError(409, 'INVALID_TICKET', 'Ingresso não emitido, cancelado ou já utilizado.');
  if (!Number.isInteger(quantity) || quantity < 1 || ticket.usedQuantity + quantity > ticket.quantity) throw new AppError(409, 'TICKET_ALREADY_USED', 'A quantidade de entradas excede os acessos restantes.');
}
export function gateWindow(match) {
  return { opensAt: match.gateOpenAt || new Date(match.startsAt.getTime() - 2 * 3600000), closesAt: match.gateCloseAt || new Date(match.startsAt.getTime() + 4 * 3600000) };
}
export function assertGateOpen(match, now = new Date()) {
  const window = gateWindow(match);
  if (!match.entryEnabled) throw new AppError(409, 'GATE_DISABLED', 'A portaria desta partida está desativada.');
  if (now < window.opensAt) throw new AppError(409, 'GATE_NOT_OPEN', 'A portaria desta partida ainda não abriu.');
  if (now >= window.closesAt) throw new AppError(409, 'GATE_CLOSED', 'O período de entrada desta partida foi encerrado.');
  return window;
}
export function assertTicketPaid(ticket) {
  const payment = ticket.payment;
  if (!payment || !['MANUAL', 'FREE'].includes(payment.method) || payment.amountCents !== ticket.priceCents || (ticket.priceCents > 0 && (payment.method !== 'MANUAL' || !payment.confirmedById)) || (payment.method === 'FREE' && ticket.priceCents !== 0)) throw new AppError(409, 'TICKET_PAYMENT_NOT_CONFIRMED', 'O recebimento deste ingresso não foi confirmado corretamente.');
  if (!ticket.user?.active) throw new AppError(409, 'HOLDER_DISABLED', 'A conta do titular está desativada.');
}
export function assertEntryContext(ticket, claims, selectedMatchId, now = new Date(), selectedSectorId = ticket.sectorId) {
  if (ticket.matchId !== selectedMatchId || claims.matchId !== selectedMatchId) throw new AppError(409, 'WRONG_MATCH', 'Este ingresso não pertence à partida selecionada.');
  if (claims.ticketId !== ticket.id || claims.sectorId !== ticket.sectorId) throw new AppError(422, 'INVALID_TICKET_QR', 'Os dados do QR não correspondem ao ingresso.');
  if (selectedSectorId !== ticket.sectorId) throw new AppError(409, 'WRONG_SECTOR', 'Este ingresso pertence a outro setor. Oriente o titular à portaria correta.');
  if (claims.expiresAt <= now) throw new AppError(409, 'TICKET_QR_EXPIRED', 'QR expirado. Atualize no app.');
  if (claims.version !== ticket.entryVersion) throw new AppError(409, 'TICKET_QR_USED', 'Este QR foi invalidado por uma entrada anterior. Peça um QR atualizado.');
  assertTicketPaid(ticket);
  assertAdmission(ticket, 1);
  return assertGateOpen(ticket.match, now);
}
export function assertMatchSchedule(match) {
  if (match.salesOpenAt && match.salesOpenAt >= match.startsAt) throw new AppError(422, 'INVALID_SALES_WINDOW', 'A venda deve abrir antes do início do jogo.');
  if (match.salesOpenAt && match.salesCloseAt && match.salesOpenAt >= match.salesCloseAt) throw new AppError(422, 'INVALID_SALES_WINDOW', 'O encerramento deve ocorrer após a abertura das vendas.');
  if (match.salesCloseAt && match.salesCloseAt > match.startsAt) throw new AppError(422, 'INVALID_SALES_WINDOW', 'A venda deve encerrar até o início do jogo.');
  const gate = gateWindow(match);
  if (gate.opensAt >= gate.closesAt) throw new AppError(422, 'INVALID_GATE_WINDOW', 'O fechamento da portaria deve ocorrer depois da abertura.');
}
export const inventoryWhere = (now = new Date()) => ({ OR: [{ status: { in: ['ISSUED', 'USED'] } }, { status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] });
