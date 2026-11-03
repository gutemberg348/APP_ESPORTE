import { clubService } from '../services/club.service.js';
import { ticketSchema, ticketPurchaseSchema, predictionSchema, referralSchema, partnerQuerySchema, paginationSchema } from '../validators/index.js';
export const clubController = {
  matches: async () => ({ data: await clubService.matches() }),
  partners: async ({ url }) => ({ data: await clubService.partners(partnerQuerySchema.parse(Object.fromEntries(url.searchParams))) }),
  tickets: async ({ user }) => ({ data: await clubService.tickets(user) }),
  quoteTicket: async ({ user, body }) => ({ data: await clubService.quoteTicket(user, ticketSchema.parse(body)) }),
  requestTicket: async ({ user, body }) => ({ status: 201, data: await clubService.requestTicket(user, ticketPurchaseSchema.parse(body)) }),
  predict: async ({ user, body }) => ({ status: 201, data: await clubService.predict(user, predictionSchema.parse(body)) }),
  referral: async ({ user, body }) => ({ status: 201, data: await clubService.referral(user, referralSchema.parse(body)) }),
  referrals: async ({ user, url }) => ({ data: await clubService.referrals(user, paginationSchema.parse(Object.fromEntries(url.searchParams))) }),
};
