import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createTicketEntryStore } from '../models/ticket-entry.store.js';
import { createTicketQr } from '../lib/ticket-qr.js';
import { assertGateUser } from '../lib/gate-rules.js';
import { authorizeGate } from '../models/gate-access.model.js';
import { ticketCodeModel } from '../models/ticket-code.model.js';
import { hashToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
const store = createTicketEntryStore(db, { authorize: authorizeGate });
const qr = createTicketQr({ secret: env.TICKET_QR_SECRET, issuer: env.JWT_ISSUER });
async function validate(user, input, work) {
  assertGateUser(user);
  try {
    await authorizeGate(db, user.id, input);
    return await work(input.token ? await qr.verify(input.token) : await ticketCodeModel.resolve(input.code));
  }
  catch (error) {
    if (error instanceof AppError) await store.deny(user.id, input.matchId, error.code, hashToken(input.token || input.code));
    throw error;
  }
}
export const ticketEntryService = {
  async qr(user, ticketId) {
    const { ticket, gate } = await store.ownedTicket(user.id, ticketId);
    const issued = await qr.issue(ticket, gate.closesAt);
    const code = await ticketCodeModel.create(ticket, issued);
    if (Date.parse(issued.expiresAt) <= Date.now()) throw new AppError(409, 'TICKET_QR_EXPIRED', 'A emissão demorou e o código venceu. Atualize o ingresso.');
    const { scanId, ...response } = issued;
    return { ...response, serverTime: new Date().toISOString(), code, remainingQuantity: ticket.quantity - ticket.usedQuantity };
  },
  inspect: (user, input) => validate(user, input, (claims) => store.inspect(claims, input)),
  admit: (user, input) => validate(user, input, (claims) => store.admit(user.id, claims, input)),
  receipt(user, input) { assertGateUser(user); return store.receipt(user.id, input); },
};
