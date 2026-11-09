import { financeService } from "../services/finance.service.js";
import * as schema from "../validators/finance.js";
const query = (url) =>
  schema.financeQuerySchema.parse(Object.fromEntries(url.searchParams));
export const financeController = {
  settings: async () => ({ data: await financeService.settings() }),
  saveSettings: async ({ user, body }) => ({
    data: await financeService.saveSettings(
      user.id,
      schema.financeSettingsSchema.parse(body),
    ),
  }),
  summary: async () => ({ data: await financeService.summary() }),
  receipts: async ({ url }) => ({
    data: await financeService.receipts(query(url)),
  }),
  refundCosts: async ({ url }) => ({
    data: await financeService.refundCosts(query(url)),
  }),
  payouts: async ({ url }) => ({
    data: await financeService.payouts(query(url)),
  }),
  payout: async ({ user, body }) => ({
    status: 201,
    data: await financeService.payout(user.id, schema.payoutSchema.parse(body)),
  }),
  voidPayout: async ({ user, body }) => ({
    data: await financeService.voidPayout(
      user.id,
      schema.voidPayoutSchema.parse(body),
    ),
  }),
  legacy: async ({ user, body }) => {
    const input = schema.legacyFinanceSchema.parse(body);
    return { data: await financeService.adoptLegacy(user.id, input.reason) };
  },
};
