import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import JsBarcode from 'jsbarcode';
import { Text } from './Typography';
export function TicketBarcode({ code }: { code: string }) {
  const bars = useMemo(() => {
    const target: { encodings?: { data: string }[] } = {};
    JsBarcode(target, code.replace(/-/g, ''), { format: 'CODE128', displayValue: false });
    return target.encodings?.map((row) => row.data).join('') || '';
  }, [code]);
  return <View style={{ alignItems: 'center', gap: 7, backgroundColor: '#fff', padding: 12 }}>
    <Svg width="100%" height={66} viewBox={`0 0 ${bars.length + 24} 66`} accessibilityLabel="Código de barras do ingresso">
      <Rect x={0} y={0} width={bars.length + 24} height={66} fill="#fff" />
      {Array.from(bars).map((bit, index) => bit === '1' ? <Rect key={index} x={index + 12} y={2} width={1} height={60} fill="#000" /> : null)}
    </Svg>
    <Text selectable style={{ color: '#111827', fontSize: 15, fontWeight: '700', letterSpacing: 1 }}>{code}</Text>
  </View>;
}
