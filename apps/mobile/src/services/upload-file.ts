import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
export interface UploadFile { name: string; mimeType: string; base64: string }
export async function pickUploadFile({ types, maxBytes, tooLarge, unsupported }: { types: readonly string[]; maxBytes: number; tooLarge: string; unsupported: string }): Promise<UploadFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: [...types], copyToCacheDirectory: true, multiple: false, base64: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.size && asset.size > maxBytes) throw new Error(tooLarge);
  const extension = asset.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = asset.mimeType || ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[extension] || '';
  if (!types.includes(mimeType)) throw new Error(unsupported);
  let base64: string;
  if (Platform.OS === 'web') {
    const blob = asset.file || await (await fetch(asset.uri)).blob();
    if (blob.size > maxBytes) throw new Error(tooLarge);
    base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { const value = String(reader.result), comma = value.indexOf(','); if (comma < 0) reject(new Error('Não foi possível ler o arquivo.')); else resolve(value.slice(comma + 1)); };
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.readAsDataURL(blob);
    });
  } else base64 = await new File(asset.uri).base64();
  const size = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (!size || size > maxBytes) throw new Error(tooLarge);
  return { name: asset.name.slice(0, 180), mimeType, base64 };
}
