import { appGate, gateV1Service } from '../services/gate-v1.service.js';
import * as schema from '../validators/gate-v1.js';
function validate(operation, user, input) {
  return input.source === 'app' ? appGate[operation](user, input) : gateV1Service[operation](user.id, input);
}
export const gateV1Controller = {
  matches: async ({ user, url }) => {
    const v1 = await gateV1Service.matches(user.id);
    return { data: url.searchParams.get('catalog') === 'all' ? [...v1, ...await appGate.matches(user)] : v1 };
  },
  inspect: async ({ user, body }) => ({ data: await validate('inspect', user, schema.gateV1InspectSchema.parse(body)) }),
  admit: async ({ user, body }) => ({ data: await validate('admit', user, schema.gateV1AdmitSchema.parse(body)) }),
  receipt: async ({ user, url }) => {
    const query = Object.fromEntries(url.searchParams);
    const validator = query.source === 'app' ? schema.gateAppReceiptSchema : schema.gateV1ReceiptSchema;
    return { data: await validate('receipt', user, validator.parse(query)) };
  },
  history: async ({ user, url }) => ({ data: await validate('history', user, schema.gateV1HistorySchema.parse(Object.fromEntries(url.searchParams))) }),
  assignments: async ({ user, body }) => ({ data: await gateV1Service.assignments(user.id, schema.gateV1AssignmentsSchema.parse(body)) }),
};
