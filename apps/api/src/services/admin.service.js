import { listAdminTickets } from '../models/admin-ticket-directory.js';
import { env } from '../config/env.js';
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
const guard = (work) => (user, input) => { assertAdmin(user); return work(user.id, input, user.role); };
export const adminService = {
  ticketDirectory: guard((_, query) => listAdminTickets(db, env.TENANT_SLUG, query)),
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
  users: guard((_, query, role) => adminModel.users(query, role)),
  userDetail: guard((_, { userId }, role) => accounts.detail(userId, role)),
  updateUser: guard(async (actorId, { password, ...input }) => accounts.update(actorId, { ...input, ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}) })),
  plans: guard(() => adminModel.plans()), plan: guard(adminModel.plan),
  membership: guard(adminModel.membership), account: guard(adminModel.account),
  confirm: guard(async (actorId, input) => ({ ...await ticketModel.confirm(actorId, input), entryQr: null })),
  cancel: guard((actorId, ticketId) => ticketModel.cancel(actorId, ticketId, true)),
  inspect: ticketEntryService.inspect,
  admit: ticketEntryService.admit,
  receipt: ticketEntryService.receipt,
  audit: guard((_, query, role) => adminModel.audit(query, role)),
};
