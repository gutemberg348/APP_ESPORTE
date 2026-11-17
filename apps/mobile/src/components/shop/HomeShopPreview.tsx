import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { ShoppingBag, ChevronRight } from 'lucide-react-native';
import type { Product, ShopSettings } from '@nacional/shared/shop';
import { useSession } from '../../providers/SessionProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { shopApi } from '../../services/shop';
import { money } from '../../utils/format';
import { Text } from '../Typography';
import { ProductImage } from './ProductImage';

export function HomeShopPreview({ onOpen }: { onOpen: () => void }) {
  const { token, demoMode } = useSession(), { colors } = useTheme();
  const [products, setProducts] = useState<Product[]>([]), [settings, setSettings] = useState<ShopSettings | null>(null);
  useEffect(() => {
    let alive = true;
    setProducts([]); setSettings(null);
    if (token && !demoMode) void Promise.all([shopApi.settings(token), shopApi.products(token, { limit: '3' })]).then(([config, page]) => {
      if (alive) { setSettings(config); setProducts(config.enabled && config.mode === 'INTERNAL' ? page.items : []); }
    }).catch(() => { /* The shop screen provides retry and detailed errors. */ });
    return () => { alive = false; };
  }, [token, demoMode]);
  return <View style={{ gap: 14, backgroundColor: colors.surface, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.brandBorder }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir loja do Esporte" onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
      <ShoppingBag size={25} color={colors.primary} /><View style={{ flex: 1, gap: 3 }}><Text heading style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>{settings?.name || 'Loja do Esporte'}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Produtos, carrinho e seus pedidos em um só lugar.</Text></View><ChevronRight size={20} color={colors.primary} />
    </Pressable>
    {!!products.length && <View style={{ flexDirection: 'row', gap: 10 }}>{products.map(product => <Pressable key={product.id} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${product.name}, ${money(product.priceCents)}. Ver na loja`} style={{ flex: 1, gap: 5 }}>
      <ProductImage uri={product.images[0]} label={product.name} style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.soft }} />
      <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 16, color: colors.text }}>{product.name}</Text><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{money(product.priceCents)}</Text>
    </Pressable>)}</View>}
    <Pressable accessibilityRole="button" onPress={onOpen} style={{ backgroundColor: colors.primaryStrong, borderRadius: 14, padding: 13, alignItems: 'center' }}><Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 14 }}>Explorar a loja</Text></Pressable>
  </View>;
}
