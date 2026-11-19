import { z } from 'zod';
import { clubChannelUrl } from '@nacional/shared/club-channel';

const channel = (platform) => z.string().trim().max(2048).nullable().optional().transform((value, ctx) => {
  if (value == null) return value;
  if (!value) return null;
  const url = clubChannelUrl(platform, value);
  if (url) return url;
  ctx.addIssue({ code: 'custom', message: `Informe o endereço HTTPS do canal no ${platform === 'youtube' ? 'YouTube' : 'Instagram'}.` });
  return z.NEVER;
});
export const businessSettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  instagramUrl: channel('instagram'),
  youtubeUrl: channel('youtube'),
  membershipPaymentMinutes: z.number().int().min(1).max(1440).optional(),
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
