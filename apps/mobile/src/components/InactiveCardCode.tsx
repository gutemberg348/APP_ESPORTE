import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { LockKeyhole } from 'lucide-react-native';

// Decorative matrix only: no QR encoder, identity, URL or access token.
const modules = Array.from({ length: 21 * 21 }, (_, index) => {
  const x = index % 21, y = Math.floor(index / 21);
  if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return '';
  return (x * 7 + y * 11 + x * y) % 5 < 2 ? `M${x} ${y}h1v1h-1z` : '';
}).join('');
export function InactiveCardCode({ size }: { size: number }) {
  return <View accessible accessibilityLabel="Prévia da carteirinha. Código bloqueado, sem validade de acesso." style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
    <Svg width={size} height={size} viewBox="-1 -1 23 23" opacity={0.18}>
      <Path d={modules} fill="#521a24" />
      {([[0, 0], [14, 0], [0, 14]] as const).map(([x, y]) => <React.Fragment key={`${x}-${y}`}><Rect x={x} y={y} width={7} height={7} rx={1} fill="#521a24" /><Rect x={x + 1} y={y + 1} width={5} height={5} rx={0.6} fill="#ffffff" /><Rect x={x + 2} y={y + 2} width={3} height={3} rx={0.4} fill="#521a24" /></React.Fragment>)}
    </Svg>
    <View style={{ position: 'absolute', width: 62, height: 62, borderRadius: 20, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#eadde0' }}><LockKeyhole size={30} color="#9c263a" strokeWidth={1.7} /></View>
  </View>;
}
