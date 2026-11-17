import type { Reward } from './types';
export interface BusinessSettings {
  id: string; version: number; updatedAt: string;
  membershipPaymentMinutes: number;
  ticketReservationMinutes: number; shopReservationMinutes: number;
  shopQuoteMinutes: number; cashChargeMinutes: number; shopPendingOrderLimit: number;
  checkInEnabled: boolean; checkInPoints: number;
}
export interface AdminReward extends Reward { active: boolean; version: number }
