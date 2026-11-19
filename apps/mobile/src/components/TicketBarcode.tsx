import React, { useMemo } from 'react';
import { PixelRatio, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import JsBarcode from 'jsbarcode';
import { Text } from './Typography';
export function TicketBarcode({ code, width, height }: { code: string; width: number; height: number }) {
  const bars = useMemo(() => {
    const target: { encodings?: { data: string }[] } = {};
    JsBarcode(target, code.replace(/-/g, ''), { format: 'CODE128', displayValue: false });
    return target.encodings?.map((row) => row.data).join('') || '';
  }, [code]);
  const modules = bars.length + 24;
  const scale = PixelRatio.get();
  const pixelsPerModule = Math.max(1, Math.floor(Math.min(width, 850) * scale / modules));
  return <View style={{ alignItems: 'center', gap: 7, backgroundColor: '#fff', paddingVertical: 8 }}>
    <Svg width={Math.min(width, pixelsPerModule * modules / scale)} height={height} preserveAspectRatio="none" viewBox={`0 0 ${modules} 66`} accessibilityLabel="Código de barras do ingresso">
      <Rect x={0} y={0} width={bars.length + 24} height={66} fill="#fff" />
      {Array.from(bars.matchAll(/1+/g), run => <Rect key={run.index} x={run.index + 12} y={2} width={run[0].length} height={60} fill="#000" />)}
    </Svg>
    <Text selectable style={{ color: '#111827', fontSize: 15, fontWeight: '700', letterSpacing: 1 }}>{code}</Text>
  </View>;
}
