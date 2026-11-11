import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { scanFromURLAsync } from 'expo-camera';
import jsQR from 'jsqr';
export async function readGateImage(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], multiple: false, copyToCacheDirectory: true, base64: false });
  if (picked.canceled) return null;
  const asset = picked.assets[0]; if (!asset) return null;
  if (asset.size && asset.size > 10 * 1024 * 1024) throw new Error('Selecione uma imagem de até 10 MB.');
  if (Platform.OS !== 'web') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const found = await Promise.race([scanFromURLAsync(asset.uri, ['qr']), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('A leitura demorou demais. Recorte o QR ou digite o código impresso.')), 15000); })]).finally(() => { if (timer) clearTimeout(timer); });
    if (found.length !== 1) throw new Error(found.length ? 'A imagem possui vários códigos. Recorte somente o ingresso desejado.' : 'QR não encontrado. Use uma imagem nítida do ingresso.');
    return found[0]!.data;
  }
  const blob = asset.file || await (await fetch(asset.uri)).blob();
  if (blob.size > 10 * 1024 * 1024) throw new Error('Selecione uma imagem de até 10 MB.');
  if (typeof createImageBitmap !== 'function') throw new Error('Seu navegador não oferece leitura de arquivo de imagem. Use a câmera ou digite o código.');
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 24000000) throw new Error('Imagem muito grande. Recorte a área do QR.');
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('Não foi possível ler a imagem neste navegador.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), decoded = jsQR(pixels.data, pixels.width, pixels.height);
    if (!decoded) throw new Error('QR não encontrado. Use uma imagem nítida ou digite o código impresso.');
    return decoded.data;
  } finally { bitmap.close(); }
}
