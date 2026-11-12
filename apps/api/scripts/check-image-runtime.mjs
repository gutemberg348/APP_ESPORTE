import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { normalizeShopImage } from '../src/lib/shop-images.js';

// Run in both build and final image, without database or environment credentials.
// A missing codec, shared library or incompatible CPU must fail the image build.
if (process.argv.includes('--require-local-build')) {
  const require = createRequire(import.meta.url);
  const directory = dirname(dirname(require.resolve('sharp')));
  const { runtimePlatformArch } = require(join(directory, 'dist/libvips.cjs'));
  // On a newer CPU sharp could hide a broken local build by loading its prebuild.
  // Load our native addon explicitly so that fallback cannot pass this check.
  require(join(directory, `src/build/Release/sharp-${runtimePlatformArch()}-${sharp.versions.sharp}.node`));
}
for (const format of ['jpeg', 'png', 'webp']) {
  const canvas = sharp({ create: { width: 24, height: 16, channels: 3, background: '#bd1f2d' } });
  if (format === 'jpeg') canvas.withMetadata({ orientation: 6 });
  const source = await canvas.toFormat(format).toBuffer();
  const normalized = await normalizeShopImage({ mimeType: `image/${format}`, base64: source.toString('base64') });
  const metadata = await sharp(normalized.content).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, format === 'jpeg' ? 16 : 24);
  assert.equal(metadata.height, format === 'jpeg' ? 24 : 16);
  assert.equal(metadata.exif, undefined);
}
console.log(`Processamento de fotos validado: JPEG, PNG e WebP (sharp ${sharp.versions.sharp}, libvips ${sharp.versions.vips}).`);
