import type { ClubPlan } from '@nacional/shared/types';
import { request } from './api';
export type MembershipOrder = { id: string; planName: string; priceCents: number; durationDays: number; status: string; expiresAt: string; validUntil: string | null; intentId: string; createdAt: string };
export const membershipApi = {
  plans: (token: string) => request<ClubPlan[]>('/membership/plans', { token }),
  orders: (token: string) => request<MembershipOrder[]>('/membership/orders', { token }),
  checkout: (token: string, body: { planId: string; expectedPriceCents: number; requestKey: string }) => request<MembershipOrder>('/membership/checkout', { token, method: 'POST', body }),
};
