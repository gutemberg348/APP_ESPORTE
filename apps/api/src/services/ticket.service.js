import { ticketModel } from '../models/ticket.model.js';
export const ticketService = {
  cancel: (user, ticketId) => ticketModel.cancel(user.id, ticketId),
  instructions: () => ({ instructions: ticketModel.paymentInstructions() }),
};
