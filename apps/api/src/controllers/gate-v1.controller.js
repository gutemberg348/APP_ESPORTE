import { gateV1Service } from '../services/gate-v1.service.js';
import * as schema from '../validators/gate-v1.js';
export const gateV1Controller = {
  matches: async ({ user }) => ({ data: await gateV1Service.matches(user.id) }),
  inspect: async ({ user, body }) => ({ data: await gateV1Service.inspect(user.id, schema.gateV1InspectSchema.parse(body)) }),
  admit: async ({ user, body }) => ({ data: await gateV1Service.admit(user.id, schema.gateV1AdmitSchema.parse(body)) }),
  receipt: async ({ user, url }) => ({ data: await gateV1Service.receipt(user.id, schema.gateV1ReceiptSchema.parse(Object.fromEntries(url.searchParams))) }),
  history: async ({ user, url }) => ({ data: await gateV1Service.history(user.id, schema.gateV1HistorySchema.parse(Object.fromEntries(url.searchParams))) }),
  assignments: async ({ user, body }) => ({ data: await gateV1Service.assignments(user.id, schema.gateV1AssignmentsSchema.parse(body)) }),
};
