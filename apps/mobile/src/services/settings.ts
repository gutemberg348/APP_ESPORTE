import type { BusinessSettings, AdminReward } from '@nacional/shared/settings';
import { request } from './api';
export type RewardInput = Pick<AdminReward, 'title' | 'description' | 'cost' | 'stock' | 'icon' | 'active'>;
export const settingsApi = {
  settings: (token: string) => request<BusinessSettings>('/admin/settings', { token }),
  save: (token: string, body: Omit<BusinessSettings, 'id' | 'updatedAt'>) => request<BusinessSettings>('/admin/settings', { token, method: 'PUT', body }),
  rewards: (token: string) => request<AdminReward[]>('/admin/rewards', { token }),
  reward: (token: string, body: RewardInput, current: AdminReward | null) => request<AdminReward>('/admin/rewards', { token, method: current ? 'PATCH' : 'POST', body: { ...body, ...(current ? { id: current.id, version: current.version } : {}) } }),
};
