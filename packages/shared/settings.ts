import type { Reward } from './types';
export interface ClubChannels { instagramUrl: string | null; youtubeUrl: string | null }
export interface BusinessSettings extends ClubChannels {
  id: string; version: number; updatedAt: string;
  membershipPaymentMinutes: number;
  ticketReservationMinutes: number; shopReservationMinutes: number;
  shopQuoteMinutes: number; cashChargeMinutes: number; shopPendingOrderLimit: number;
  checkInEnabled: boolean; checkInPoints: number;
}
export interface AdminReward extends Reward { active: boolean; version: number }
