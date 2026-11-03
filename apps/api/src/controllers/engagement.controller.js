import { engagementService } from '../services/engagement.service.js';
import { paginationSchema, redemptionSchema } from '../validators/index.js';
export const engagementController = {
  summary: async ({ user }) => ({ data: await engagementService.summary(user) }),
  ledger: async ({ user, url }) => ({ data: await engagementService.ledger(user, paginationSchema.parse(Object.fromEntries(url.searchParams))) }),
  checkIn: async ({ user }) => ({ status: 201, data: await engagementService.checkIn(user) }),
  redeem: async ({ user, body }) => ({ status: 201, data: await engagementService.redeem(user, redemptionSchema.parse(body).rewardId) }),
};
