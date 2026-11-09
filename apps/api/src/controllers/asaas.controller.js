import { z } from 'zod';
import { asaasStore } from '../services/asaas.service.js';
import { billingSchema } from '../models/asaas.store.js';
import { assertAdmin } from '../lib/ticket-rules.js';
import { paginationSchema } from '../validators/index.js';
const query = (url) => Object.fromEntries(url.searchParams);
const intentId = z.object({ id: z.uuid() }).strict();
const ticketId = z.object({ ticketId: z.uuid() }).strict();
const chargeId = z.object({ chargeId: z.uuid() }).strict();
export const asaasController = {
  profile: async ({ user }) => ({ data: await asaasStore.profile(user.id) }),
  saveProfile: async ({ user, body }) => ({ data: await asaasStore.saveProfile(user.id, billingSchema.parse(body).document) }),
  ticketPix: async ({ user, body }) => ({ data: await asaasStore.ticketPix(user.id, ticketId.parse(body).ticketId) }),
  ticketIntent: async ({ user, url }) => ({ data: await asaasStore.ticketIntent(user.id, ticketId.parse(query(url)).ticketId) }),
  cashPix: async ({ user, body }) => ({ data: await asaasStore.cashPix(user.id, chargeId.parse(body).chargeId) }),
  shopPix: async ({ user, body }) => ({ data: await asaasStore.shopPix(user.id, z.object({ orderId: z.uuid() }).strict().parse(body).orderId) }),
  shopIntent: async ({ user, url }) => ({ data: await asaasStore.shopIntent(user.id, z.object({ orderId: z.uuid() }).strict().parse(query(url)).orderId) }),
  intent: async ({ user, url }) => ({ data: await asaasStore.ownIntent(user.id, intentId.parse(query(url)).id) }),
  list: async ({ user, url }) => { assertAdmin(user); return { data: await asaasStore.adminList(paginationSchema.parse(query(url))) }; },
  retry: async ({ user, body }) => { assertAdmin(user); return { data: await asaasStore.retry(intentId.parse(body).id) }; },
  refund: async ({ user, body }) => { assertAdmin(user); const input = intentId.extend({ reason: z.string().trim().min(5).max(500) }).parse(body); return { data: await asaasStore.requestRefund(user.id, input.id, input.reason) }; },
};
