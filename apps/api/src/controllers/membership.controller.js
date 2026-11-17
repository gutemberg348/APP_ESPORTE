import { z } from 'zod';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createMembershipStore } from '../models/membership.store.js';
import { verifyMembershipCard } from '../services/membership-card.js';
const store = createMembershipStore(db, env);
const checkout = z.object({ planId: z.uuid(), expectedPriceCents: z.number().int().min(1), requestKey: z.string().min(16).max(100) }).strict();
export const membershipController = {
  plans: async () => ({ data: await store.plans() }),
  orders: async ({ user }) => ({ data: await store.orders(user.id) }),
  checkout: async ({ user, body }) => ({ data: await store.checkout(user.id, checkout.parse(body)) }),
  verify: async ({ user, body }) => ({ data: await verifyMembershipCard(db, env.CARD_TOKEN_SECRET, user, z.object({ token: z.string().min(20).max(2048) }).strict().parse(body).token) }),
};
