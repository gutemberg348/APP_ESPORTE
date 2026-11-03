import { hashToken } from '../lib/crypto.js';
import { newGateCode, normalizeGateCode } from '../lib/gate-rules.js';
import { AppError } from '../lib/errors.js';
export function createTicketCodeStore(client, { now = () => new Date(), generate = newGateCode } = {}) {
  return {
    async create(ticket, issued) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = generate();
        try {
          await client.ticketAccessCode.create({ data: { ticketId: ticket.id, codeHash: hashToken(normalizeGateCode(code)), scanId: issued.scanId, entryVersion: ticket.entryVersion, expiresAt: new Date(issued.expiresAt) } });
          return code;
        } catch (error) { if (error.code !== 'P2002') throw error; }
      }
      throw new AppError(503, 'GATE_CODE_UNAVAILABLE', 'Não foi possível emitir o código. Atualize o ingresso.');
    },
    async resolve(code) {
      const row = await client.ticketAccessCode.findUnique({ where: { codeHash: hashToken(normalizeGateCode(code)) }, include: { ticket: { select: { id: true, matchId: true, sectorId: true } } } });
      if (!row) throw new AppError(404, 'GATE_CODE_NOT_FOUND', 'Código não encontrado. Confira os caracteres no app do titular.');
      if (row.expiresAt <= now()) throw new AppError(409, 'TICKET_QR_EXPIRED', 'Código expirado. Peça o código atualizado ao titular.');
      return { ticketId: row.ticketId, matchId: row.ticket.matchId, sectorId: row.ticket.sectorId, version: row.entryVersion, scanId: row.scanId, expiresAt: row.expiresAt };
    },
  };
}
