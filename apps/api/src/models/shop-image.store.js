import { AppError } from '../lib/errors.js';
import { normalizeShopImage } from '../lib/shop-images.js';
const metadata = { id: true, width: true, height: true, byteLength: true, mimeType: true };
const publicImage = (row) => ({ ...row, url: `/media/shop/upload-${row.id}.webp` });
export function createShopImageStore(client) {
  return {
    async upload(actorId, input) {
      const data = await normalizeShopImage(input);
      return client.$transaction(async (tx) => {
        const row = await tx.shopImage.upsert({ where: { sha256: data.sha256 }, update: {}, create: { ...data, createdById: actorId }, select: metadata });
        await tx.auditLog.create({ data: { actorId, action: 'SHOP_IMAGE_UPLOADED', entityId: row.id, details: { width: row.width, height: row.height, byteLength: row.byteLength } } });
        return publicImage(row);
      });
    },
    async read(id) {
      const row = await client.shopImage.findUnique({ where: { id } });
      if (!row) throw new AppError(404, 'SHOP_IMAGE_NOT_FOUND', 'Foto não encontrada.');
      return row;
    },
  };
}
