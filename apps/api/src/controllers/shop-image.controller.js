import { shopImageService } from '../services/shop-image.service.js';
import { shopImageUploadSchema } from '../validators/shop-images.js';
import { AppError } from '../lib/errors.js';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function createShopImageController(service) { return {
  upload: async ({ user, body }) => ({ status: 201, data: await service.upload(user.id, shopImageUploadSchema.parse(body)) }),
  read: async ({ req }) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !uuid.test(id)) throw new AppError(404, 'SHOP_IMAGE_NOT_FOUND', 'Foto não encontrada.');
    const row = await service.read(id);
    return { body: Buffer.from(row.content), headers: {
      'Content-Type': 'image/webp', 'Content-Length': String(row.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable', 'ETag': `"${row.sha256}"`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
    } };
  },
}; }
export const shopImageController = createShopImageController(shopImageService);
