import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createTicketEntryStore } from '../models/ticket-entry.store.js';
import { createTicketQr } from '../lib/ticket-qr.js';
import { assertGateUser } from '../lib/gate-rules.js';
import { authorizeGate } from '../models/gate-access.model.js';
import { createTicketCodeStore } from '../models/ticket-code.store.js';
import { hashToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
export function createTicketEntryService(client, { secret, issuer, now = () => new Date() }) {
  const store = createTicketEntryStore(client, { authorize: authorizeGate, now });
  const qr = createTicketQr({ secret, issuer, now });
  const ticketCodeModel = createTicketCodeStore(client, { now });
  async function validate(user, input, stage, work) {
    assertGateUser(user);
    try {
      await authorizeGate(client, user.id, input);
      const claims = input.token ? await qr.verify(input.token) : await ticketCodeModel.resolve(input.code);
      if (input.ticketId && input.ticketId !== claims.ticketId) throw new AppError(409, 'TICKET_CHANGED', 'O ingresso mudou. Consulte novamente.');
      return await work(claims);
    }
    catch (error) {
      if (error instanceof AppError) await store.deny(user.id, input.matchId, error.code, hashToken(input.token || input.code), input.sectorId, stage, input.gate);
      throw error;
    }
  }
  return {
    async qr(user, ticketId) {
      const { ticket, gate } = await store.ownedTicket(user.id, ticketId);
      const issued = await qr.issue(ticket, gate.closesAt);
      const code = await ticketCodeModel.create(ticket, issued);
      if (Date.parse(issued.expiresAt) <= now().getTime()) throw new AppError(409, 'TICKET_QR_EXPIRED', 'A emissão demorou e o código venceu. Atualize o ingresso.');
      const { scanId, ...response } = issued;
      return { ...response, serverTime: now().toISOString(), code, remainingQuantity: ticket.quantity - ticket.usedQuantity };
    },
    inspect: (user, input) => validate(user, input, 'INSPECT', (claims) => store.inspect(claims, input)),
    admit: (user, input) => validate(user, input, 'ADMIT', (claims) => store.admit(user.id, claims, input)),
    async receipt(user, input) { assertGateUser(user); await authorizeGate(client, user.id, input); return store.receipt(user.id, input); },
  };
}
export const ticketEntryService = createTicketEntryService(db, { secret: env.TICKET_QR_SECRET, issuer: env.JWT_ISSUER });
