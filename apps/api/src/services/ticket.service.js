import { ticketModel } from '../models/ticket.model.js';
import { env } from '../config/env.js';
export const ticketService = {
  cancel: (user, ticketId) => ticketModel.cancel(user.id, ticketId),
  instructions: () => ({ instructions: ticketModel.paymentInstructions(), pixEnabled: env.PAYMENT_MODE === 'asaas' }),
};
