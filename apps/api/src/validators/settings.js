import { z } from 'zod';
export const businessSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  ticketReservationMinutes: z.number().int().min(1).max(1440),
  shopReservationMinutes: z.number().int().min(1).max(1440),
  shopQuoteMinutes: z.number().int().min(1).max(60),
  cashChargeMinutes: z.number().int().min(1).max(1440),
  shopPendingOrderLimit: z.number().int().min(1).max(20),
  checkInEnabled: z.boolean(),
  checkInPoints: z.number().int().min(1).max(100000),
}).strict();
const rewardFields = {
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000),
  cost: z.number().int().min(1).max(10000000),
  stock: z.number().int().min(0).max(1000000),
  icon: z.enum(['gift', 'flag', 'camera', 'shirt']),
  active: z.boolean(),
};
export const rewardCreateSchema = z.object(rewardFields).strict();
export const rewardUpdateSchema = z.object({ ...rewardFields, id: z.uuid(), version: z.number().int().nonnegative() }).strict();
