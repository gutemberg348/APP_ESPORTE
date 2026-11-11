import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Upload, Link, Star, Trash2 } from 'lucide-react-native';
import { SHOP_IMAGE_MAX_BYTES, SHOP_IMAGE_MAX_COUNT, SHOP_IMAGE_MIME_TYPES } from '@nacional/shared/shop-media';
import { useSession } from '../../../providers/SessionProvider';
import { useTheme } from '../../../theme/ThemeProvider';
import { shopAdminApi } from '../../../services/shop';
import { pickUploadFile } from '../../../services/upload-file';
import { messageOf } from '../../../utils/format';
import { ProductImage } from '../../shop/ProductImage';
import { Text } from '../../Typography';
import { AdminButton, AdminField, AdminNotice, AdminSection } from '../AdminControls';

export function ProductPhotosField({ images, onChange, disabled, onBusyChange }: { images: string[]; onChange: (images: string[]) => void; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const { token } = useSession(), { colors } = useTheme();
  const [uploading, setUploading] = useState<number | null>(null), [error, setError] = useState('');
  const lock = useRef(false);
  async function upload(replace?: number) {
    if (!token || disabled || lock.current) return;
    const blank = images.findIndex((value) => !value.trim());
    const index = replace ?? (blank < 0 ? images.length : blank);
    if (index >= SHOP_IMAGE_MAX_COUNT) return;
    lock.current = true; setUploading(index); onBusyChange(true); setError('');
    try {
      const file = await pickUploadFile({ types: SHOP_IMAGE_MIME_TYPES, maxBytes: SHOP_IMAGE_MAX_BYTES, tooLarge: 'Cada foto deve ter até 5 MB.', unsupported: 'Selecione uma foto JPG, PNG ou WebP.' });
      if (!file) return;
      const saved = await shopAdminApi.uploadImage(token, { mimeType: file.mimeType, base64: file.base64 });
      const next = [...images]; next[index] = saved.url; onChange(next);
    } catch (err) { setError(messageOf(err)); }
    finally { lock.current = false; setUploading(null); onBusyChange(false); }
  }
  const busy = disabled || uploading !== null;
  return <AdminSection title="Fotos" description="Envie do computador ou celular, ou cole um link HTTPS. Até 8 fotos de 5 MB. A primeira será a capa.">
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <AdminButton label="Enviar foto" icon={Upload} primary loading={uploading !== null} disabled={busy || (images.length >= SHOP_IMAGE_MAX_COUNT && images.every((value) => value.trim()))} onPress={() => void upload()} />
      <AdminButton label="Adicionar link" icon={Link} disabled={busy || images.length >= SHOP_IMAGE_MAX_COUNT} onPress={() => { setError(''); onChange([...images, '']); }} />
    </View>
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    {images.map((image, index) => <View key={index} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <ProductImage uri={image} label={index ? `Prévia da foto ${index + 1}` : 'Prévia da capa'} style={{ width: 76, height: 76, borderRadius: 8 }} />
        <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{index ? `Foto ${index + 1}` : 'Foto de capa'}</Text>
          {image.startsWith('/media/shop/') ? <Text style={{ color: colors.muted, fontSize: 12 }}>Foto salva no catálogo</Text> : <AdminField label="Endereço da imagem" value={image} onChange={(value) => onChange(images.map((row, i) => i === index ? value : row))} placeholder="https://…/foto.jpg" autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <AdminButton label={image ? 'Trocar arquivo' : 'Escolher arquivo'} size="small" icon={Upload} loading={uploading === index} disabled={busy} onPress={() => void upload(index)} />
        {index > 0 && !!image.trim() && <AdminButton label="Usar como capa" icon={Star} size="small" disabled={busy} onPress={() => onChange([image, ...images.filter((_, i) => i !== index)])} />}
        <AdminButton label="Remover" icon={Trash2} variant="ghost" size="small" disabled={busy} onPress={() => onChange(images.filter((_, i) => i !== index))} />
      </View>
    </View>)}
  </AdminSection>;
}
