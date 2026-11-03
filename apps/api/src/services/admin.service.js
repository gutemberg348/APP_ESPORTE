import { adminModel } from '../models/admin.model.js';
import { ticketModel } from '../models/ticket.model.js';
import { assertAdmin } from '../lib/ticket-rules.js';
import { ticketEntryService } from './ticket-entry.service.js';
const guard = (work) => (user, input) => { assertAdmin(user); return work(user.id, input); };
export const adminService = {
  overview: guard(() => adminModel.overview()),
  matches: guard((_, query) => adminModel.matches(query)),
  createMatch: guard(adminModel.createMatch), updateMatch: guard(adminModel.updateMatch),
  createSector: guard(adminModel.createSector), updateSector: guard(adminModel.updateSector),
  tickets: guard((_, query) => adminModel.tickets(query)),
  users: guard((_, query) => adminModel.users(query)),
  plans: guard(() => adminModel.plans()), plan: guard(adminModel.plan),
  membership: guard(adminModel.membership), account: guard(adminModel.account),
  confirm: guard(async (actorId, input) => ({ ...await ticketModel.confirm(actorId, input), entryQr: null })),
  cancel: guard((actorId, ticketId) => ticketModel.cancel(actorId, ticketId, true)),
  inspect: ticketEntryService.inspect,
  admit: ticketEntryService.admit,
  receipt: ticketEntryService.receipt,
  audit: guard((_, query) => adminModel.audit(query)),
};
