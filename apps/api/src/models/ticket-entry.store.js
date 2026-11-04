import { serializable } from '../lib/business-rules.js';
import { AppError } from '../lib/errors.js';
import { assertEntryContext, assertGateOpen, assertTicketPaid, assertAdmission } from '../lib/ticket-rules.js';
import { ticketInclude, toTicket } from '../lib/ticket-serializers.js';
const include = { ...ticketInclude, user: { select: { id: true, name: true, active: true } } };
function view(ticket) { return { ...toTicket(ticket), holder: ticket.user.name }; }
function receipt(ticket, admission, duplicate) {
  return { ticket: view(ticket), duplicate, decision: duplicate ? 'ALREADY_RECORDED' : 'ALLOW', admission: { id: admission.id, quantity: admission.quantity, createdAt: admission.createdAt } };
}
function assertOperation(previous, actorId, claims, input) {
  if (previous.actorId !== actorId || previous.scanId !== claims.scanId || previous.quantity !== input.quantity) throw new AppError(409, 'ADMISSION_KEY_CONFLICT', 'Essa operação de portaria já foi usada para outra leitura.');
}
export function createTicketEntryStore(client, { now = () => new Date(), authorize } = {}) {
  return {
    async ownedTicket(userId, ticketId) {
      const ticket = await client.ticket.findFirst({ where: { id: ticketId, userId }, include });
      if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Ingresso não encontrado na sua conta.');
      assertTicketPaid(ticket); assertAdmission(ticket, 1);
      const gate = assertGateOpen(ticket.match, now());
      return { ticket, gate };
    },
    async inspect(claims, input) {
      const ticket = await client.ticket.findUnique({ where: { id: claims.ticketId }, include });
      if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Ingresso não encontrado.');
      assertEntryContext(ticket, claims, input.matchId, now(), input.sectorId);
      return { ...view(ticket), qrExpiresAt: claims.expiresAt.toISOString(), serverTime: now().toISOString(), decision: 'REVIEW', message: 'Confira o titular e a quantidade. A leitura ainda não autorizou entrada.' };
    },
    async admit(actorId, claims, input) {
      try { return await serializable(client, async (tx) => {
        if (authorize) await authorize(tx, actorId, input);
        const ticket = await tx.ticket.findUnique({ where: { id: claims.ticketId }, include });
        if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Ingresso não encontrado.');
        if (ticket.matchId !== input.matchId || claims.matchId !== input.matchId) throw new AppError(409, 'WRONG_MATCH', 'O ingresso não pertence à partida selecionada.');
        if (ticket.sectorId !== input.sectorId) throw new AppError(409, 'WRONG_SECTOR', 'O ingresso pertence a outro setor.');
        const previous = await tx.ticketAdmission.findUnique({ where: { ticketId_requestKey: { ticketId: ticket.id, requestKey: input.requestKey } } });
        if (previous) { assertOperation(previous, actorId, claims, input); return receipt(ticket, previous, true); }
        const instant = now();
        assertEntryContext(ticket, claims, input.matchId, instant, input.sectorId);
        assertAdmission(ticket, input.quantity);
        const usedQuantity = ticket.usedQuantity + input.quantity;
        const consumed = await tx.ticket.updateMany({
          where: { id: ticket.id, entryVersion: claims.version, usedQuantity: ticket.usedQuantity, status: 'ISSUED' },
          data: { usedQuantity, entryVersion: { increment: 1 }, status: usedQuantity === ticket.quantity ? 'USED' : 'ISSUED' },
        });
        if (consumed.count !== 1) throw new AppError(409, 'TICKET_QR_USED', 'Outro operador já validou este QR. Atualize a leitura.');
        // A database wait must not turn an expired token into an authorization.
        assertEntryContext(ticket, claims, input.matchId, now(), input.sectorId);
        const admission = await tx.ticketAdmission.create({ data: { ticketId: ticket.id, actorId, quantity: input.quantity, requestKey: input.requestKey, scanId: claims.scanId, qrVersion: claims.version } });
        await tx.auditLog.create({ data: { actorId, action: 'TICKET_ADMISSION', entityId: ticket.id, details: { matchId: input.matchId, quantity: input.quantity, usedQuantity, admissionId: admission.id } } });
        return receipt(await tx.ticket.findUnique({ where: { id: ticket.id }, include }), admission, false);
      }); } catch (error) {
        if (error.code === 'P2002') {
          const previous = await client.ticketAdmission.findUnique({ where: { scanId: claims.scanId } });
          if (previous && previous.ticketId === claims.ticketId) {
            if (previous.requestKey !== input.requestKey) throw new AppError(409, 'TICKET_QR_USED', 'Este QR já foi utilizado.');
            assertOperation(previous, actorId, claims, input);
            return receipt(await client.ticket.findUnique({ where: { id: claims.ticketId }, include }), previous, true);
          }
        }
        throw error;
      }
    },
    async receipt(actorId, { ticketId, matchId, sectorId, requestKey }) {
      const admission = await client.ticketAdmission.findUnique({ where: { ticketId_requestKey: { ticketId, requestKey } }, include: { ticket: { include } } });
      if (!admission || admission.actorId !== actorId || admission.ticket.matchId !== matchId || admission.ticket.sectorId !== sectorId) throw new AppError(404, 'ADMISSION_NOT_FOUND', 'Não foi encontrada uma entrada confirmada para esta operação.');
      return receipt(admission.ticket, admission, true);
    },
    deny: (actorId, matchId, reason, qrHash, sectorId, stage) => client.auditLog.create({ data: { actorId, action: 'TICKET_VALIDATION_DENIED', entityId: matchId, details: { reason, qrHash, ...(sectorId ? { sectorId } : {}), ...(stage ? { stage } : {}) } } }),
  };
}
