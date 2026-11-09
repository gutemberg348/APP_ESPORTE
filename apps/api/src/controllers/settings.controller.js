import { settingsService } from '../services/settings.service.js';
import { businessSettingsSchema, rewardCreateSchema, rewardUpdateSchema } from '../validators/settings.js';
export const settingsController = {
  settings: async () => ({ data: await settingsService.settings() }),
  saveSettings: async ({ user, body }) => ({ data: await settingsService.saveSettings(user.id, businessSettingsSchema.parse(body)) }),
  rewards: async () => ({ data: await settingsService.rewards() }),
  createReward: async ({ user, body }) => ({ status: 201, data: await settingsService.saveReward(user.id, rewardCreateSchema.parse(body)) }),
  updateReward: async ({ user, body }) => ({ data: await settingsService.saveReward(user.id, rewardUpdateSchema.parse(body)) }),
};
