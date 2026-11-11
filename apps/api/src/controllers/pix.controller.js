import { z } from 'zod';
import { currentPixStore, sicrediStore, pixQueries, pixStoreForIntent } from '../services/pix.service.js';
import { paginationSchema } from '../validators/index.js';
const id = z.object({ id: z.uuid() }).strict();
const ticket = z.object({ ticketId: z.uuid() }).strict();
const shop = z.object({ orderId: z.uuid() }).strict();
const query = (url) => Object.fromEntries(url.searchParams);
export const pixController = {
  profile: async ({ user }) => ({ data: await currentPixStore.profile(user.id) }),
  saveProfile: async ({ user, body }) => ({ data: await currentPixStore.saveProfile(user.id, z.object({ document: z.string().max(25).optional() }).strict().parse(body).document) }),
  ticketPix: async ({ user, body }) => ({ data: await currentPixStore.ticketPix(user.id, ticket.parse(body).ticketId) }),
  ticketIntent: async ({ user, url }) => ({ data: await pixQueries.ticketIntent(user.id, ticket.parse(query(url)).ticketId) }),
  shopPix: async ({ user, body }) => ({ data: await currentPixStore.shopPix(user.id, shop.parse(body).orderId) }),
  shopIntent: async ({ user, url }) => ({ data: await pixQueries.shopIntent(user.id, shop.parse(query(url)).orderId) }),
  cashPix: async ({ user, body }) => ({ data: await currentPixStore.cashPix(user.id, z.object({ chargeId: z.uuid() }).strict().parse(body).chargeId) }),
  intent: async ({ user, url }) => ({ data: await pixQueries.ownIntent(user.id, id.parse(query(url)).id) }),
  list: async ({ url }) => ({ data: await pixQueries.adminList(paginationSchema.parse(query(url))) }),
  retry: async ({ body }) => { const value = id.parse(body).id; return { data: await (await pixStoreForIntent(value)).retry(value) }; },
  refund: async ({ user, body }) => { const value = id.extend({ reason: z.string().trim().min(5).max(500) }).strict().parse(body); return { data: await (await pixStoreForIntent(value.id)).requestRefund(user.id, value.id, value.reason) }; },
  sicrediWebhook: async ({ req, body }) => ({ data: await sicrediStore.webhook(req.params.webhookToken, body) }),
};
