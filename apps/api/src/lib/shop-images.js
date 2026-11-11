import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { SHOP_IMAGE_MAX_BYTES } from '@nacional/shared/shop-media';
import { AppError } from './errors.js';
let processing = 0;

export async function normalizeShopImage({ mimeType, base64 }) {
  const input = Buffer.from(base64, 'base64');
  if (!input.length || input.length > SHOP_IMAGE_MAX_BYTES || input.toString('base64') !== base64)
    throw new AppError(422, 'INVALID_PRODUCT_IMAGE', 'Envie uma imagem de até 5 MB com conteúdo válido.');
  const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
  if (processing >= 2) throw new AppError(429, 'SHOP_IMAGE_BUSY', 'Há fotos sendo processadas. Aguarde e envie novamente.');
  processing++;
  try {
    const signature = mimeType === 'image/png' ? input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === 'image/jpeg' ? input[0] === 255 && input[1] === 216 && input[2] === 255
      : mimeType === 'image/webp' && input.subarray(0, 4).toString() === 'RIFF' && input.subarray(8, 12).toString() === 'WEBP';
    if (!signature) throw new Error('Invalid signature');
    const image = sharp(input, { failOn: 'warning', limitInputPixels: 24000000 });
    const meta = await image.metadata();
    if (!expected || meta.format !== expected || !meta.width || !meta.height || (meta.pages || 1) !== 1)
      throw new Error('Unsupported image');
    // Decode and encode again: do not publish the original file or its EXIF.
    const { data, info } = await image.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (data.length > SHOP_IMAGE_MAX_BYTES) throw new Error('Image too large');
    return { content: data, mimeType: 'image/webp', byteLength: data.length, width: info.width, height: info.height, sha256: createHash('sha256').update(data).digest('hex') };
  } catch {
    throw new AppError(422, 'INVALID_PRODUCT_IMAGE', 'Não foi possível ler a foto. Use JPG, PNG ou WebP sem animação, até 5 MB e 24 megapixels.');
  } finally {
    processing--;
  }
}
