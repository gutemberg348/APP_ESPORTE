import { z } from 'zod';
import { SHOP_IMAGE_MAX_BYTES } from '@nacional/shared/shop-media';
export const shopImageUploadSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  base64: z.string().min(4).max(4 * Math.ceil(SHOP_IMAGE_MAX_BYTES / 3)).regex(/^[A-Za-z0-9+/]+={0,2}$/).refine((value) => value.length % 4 === 0),
}).strict();
