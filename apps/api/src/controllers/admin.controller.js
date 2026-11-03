import { adminService } from '../services/admin.service.js';
import { ticketService } from '../services/ticket.service.js';
import { ticketEntryService } from '../services/ticket-entry.service.js';
import * as schemas from '../validators/admin.js';
import { paginationSchema } from '../validators/index.js';
const query = (url) => Object.fromEntries(url.searchParams);
export const adminController = {
  overview: async ({ user }) => ({ data: await adminService.overview(user) }),
  matches: async ({ user, url }) => ({ data: await adminService.matches(user, paginationSchema.parse(query(url))) }),
  createMatch: async ({ user, body }) => ({ status: 201, data: await adminService.createMatch(user, schemas.matchCreateSchema.parse(body)) }),
  updateMatch: async ({ user, body }) => ({ data: await adminService.updateMatch(user, schemas.matchUpdateSchema.parse(body)) }),
  createSector: async ({ user, body }) => ({ status: 201, data: await adminService.createSector(user, schemas.sectorCreateSchema.parse(body)) }),
  updateSector: async ({ user, body }) => ({ data: await adminService.updateSector(user, schemas.sectorUpdateSchema.parse(body)) }),
  tickets: async ({ user, url }) => ({ data: await adminService.tickets(user, schemas.adminQuerySchema.parse(query(url))) }),
  users: async ({ user, url }) => ({ data: await adminService.users(user, schemas.adminQuerySchema.parse(query(url))) }),
  plans: async ({ user }) => ({ data: await adminService.plans(user) }),
  createPlan: async ({ user, body }) => ({ status: 201, data: await adminService.plan(user, schemas.planCreateSchema.parse(body)) }),
  updatePlan: async ({ user, body }) => ({ data: await adminService.plan(user, schemas.planUpdateSchema.parse(body)) }),
  membership: async ({ user, body }) => ({ data: await adminService.membership(user, schemas.membershipSchema.parse(body)) }),
  account: async ({ user, body }) => ({ data: await adminService.account(user, schemas.accountStatusSchema.parse(body)) }),
  confirm: async ({ user, body }) => ({ data: await adminService.confirm(user, schemas.manualPaymentSchema.parse(body)) }),
  cancel: async ({ user, body }) => ({ data: await adminService.cancel(user, schemas.idSchema.parse(body).ticketId) }),
  inspect: async ({ user, body }) => ({ data: await adminService.inspect(user, schemas.ticketCodeSchema.parse(body)) }),
  admit: async ({ user, body }) => ({ status: 201, data: await adminService.admit(user, schemas.admissionSchema.parse(body)) }),
  receipt: async ({ user, url }) => ({ data: await adminService.receipt(user, schemas.admissionReceiptSchema.parse(query(url))) }),
  qr: async ({ user, url }) => ({ data: await ticketEntryService.qr(user, schemas.idSchema.parse(query(url)).ticketId) }),
  audit: async ({ user, url }) => ({ data: await adminService.audit(user, paginationSchema.parse(query(url))) }),
  customerCancel: async ({ user, body }) => ({ data: await ticketService.cancel(user, schemas.idSchema.parse(body).ticketId) }),
  instructions: async () => ({ data: ticketService.instructions() }),
};
