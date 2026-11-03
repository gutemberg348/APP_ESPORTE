import { paymentService } from '../services/payment.service.js';
import { tenantQuery, merchantChargeSchema, customerChargeSchema, saleCodeSchema, chargeIdQuery, simulateSchema } from '../validators/payment.js';
const query = (url) => Object.fromEntries(url.searchParams);
export const paymentController = {
  wallet: async ({ user, url }) => ({ data: await paymentService.wallet(user, tenantQuery.parse(query(url)).tenant) }),
  setup: async ({ user }) => ({ data: await paymentService.merchantSetup(user) }),
  merchantCharges: async ({ user }) => ({ data: await paymentService.merchantCharges(user) }),
  merchantCreate: async ({ user, body }) => ({ status: 201, data: await paymentService.merchantCreate(user, merchantChargeSchema.parse(body)) }),
  customerCreate: async ({ user, body, url }) => ({ status: 201, data: await paymentService.customerCreate(user, customerChargeSchema.parse(body), tenantQuery.parse(query(url)).tenant) }),
  resolve: async ({ user, body }) => ({ data: await paymentService.resolve(user, saleCodeSchema.parse(body).code) }),
  claim: async ({ user, body }) => ({ data: await paymentService.claim(user, saleCodeSchema.parse(body).code) }),
  ownCharge: async ({ user, url }) => ({ data: await paymentService.ownCharge(user, chargeIdQuery.parse(query(url)).id) }),
  simulate: async ({ user, body }) => ({ data: await paymentService.simulate(user, simulateSchema.parse(body)) }),
  webhook: async ({ req, body }) => ({ data: await paymentService.webhook(req, body) }),
};
