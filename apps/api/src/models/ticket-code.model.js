import { db } from '../config/database.js';
import { createTicketCodeStore } from './ticket-code.store.js';
export const ticketCodeModel = createTicketCodeStore(db);
