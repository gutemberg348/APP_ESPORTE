import { adminModel } from '../models/admin.model.js';
import { ticketModel } from '../models/ticket.model.js';
import { assertAdmin } from '../lib/ticket-rules.js';
import { ticketEntryService } from './ticket-entry.service.js';
import { db } from '../config/database.js';
import { createAdminTicketStore } from '../models/admin-ticket.store.js';
import { createAdminReportsStore } from '../models/admin-reports.store.js';
import { createAdminAccountStore } from '../models/admin-account.store.js';
import { hashPassword } from '../lib/crypto.js';
const accounts = createAdminAccountStore(db);
const sales = createAdminTicketStore(db);
const reports = createAdminReportsStore(db);
const guard = (work) => (user, input) => { assertAdmin(user); return work(user.id, input); };
export const adminService = {
  overview: guard(() => adminModel.overview()),
  salesReport: guard((_, query) => reports.sales(query)),
  admissionHistory: guard((_, query) => reports.admissions(query)),
  admissionProtocol: guard((_, { protocol }) => reports.admission(protocol)),
  denialHistory: guard((_, query) => reports.denials(query)),
  gateOperators: guard(() => reports.operators()),
  matches: guard((_, query) => adminModel.matches(query)),
  createMatch: guard(adminModel.createMatch), updateMatch: guard(adminModel.updateMatch),
  createSector: guard(adminModel.createSector), updateSector: guard(adminModel.updateSector),
  tickets: guard((_, query) => adminModel.tickets(query)),
  quoteSale: guard((_, input) => sales.quote(input)),
  updateSale: guard((actorId, input) => sales.update(actorId, input)),
  deleteSale: guard((actorId, input) => sales.remove(actorId, input)),
  users: guard((_, query) => adminModel.users(query)),
  userDetail: guard((_, { userId }) => accounts.detail(userId)),
  updateUser: guard(async (actorId, { password, ...input }) => accounts.update(actorId, { ...input, ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}) })),
  plans: guard(() => adminModel.plans()), plan: guard(adminModel.plan),
  membership: guard(adminModel.membership), account: guard(adminModel.account),
  confirm: guard(async (actorId, input) => ({ ...await ticketModel.confirm(actorId, input), entryQr: null })),
  cancel: guard((actorId, ticketId) => ticketModel.cancel(actorId, ticketId, true)),
  inspect: ticketEntryService.inspect,
  admit: ticketEntryService.admit,
  receipt: ticketEntryService.receipt,
  audit: guard((_, query) => adminModel.audit(query)),
};
