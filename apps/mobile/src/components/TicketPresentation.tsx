import React, { useState } from 'react';
import { Modal, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Barcode, QrCode, X } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../theme/ThemeProvider';
import { AdminButton } from './admin/AdminControls';
import { TicketBarcode } from './TicketBarcode';
import { Text } from './Typography';

export type TicketFormat = 'qr' | 'bars';
type Display = { format: TicketFormat; width: number; height: number };

export function TicketSymbol({ format, width, height, qr, code }: Display & { qr: string; code?: string | null }) {
  if (format === 'bars' && code) return <TicketBarcode code={code} width={width} height={Math.min(180, Math.max(48, height - 50))} />;
  const side = Math.floor(Math.min(width, height, 620));
  const margin = Math.ceil(side * 0.085);
  return side > 2 * margin && <View accessible accessibilityLabel="QR Code do ingresso" style={{ padding: margin, alignSelf: 'center', backgroundColor: '#fff' }}>
    <QRCode value={qr} size={side - margin * 2} color="#000" backgroundColor="#fff" />
  </View>;
}

export function TicketPresentation({ children, hasBarcode = true }: { children: (display: Display) => React.ReactNode; hasBarcode?: boolean }) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [format, setFormat] = useState<TicketFormat | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const { height } = useWindowDimensions();
  const close = () => setVisible(false);
  return <>
    <AdminButton label="Apresentar ingresso" primary icon={QrCode} onPress={() => { setFormat(hasBarcode ? null : 'qr'); setVisible(true); }} />
    {visible && <Modal visible presentationStyle="fullScreen" animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: 20 }}>{format ? 'Ingresso de entrada' : 'Como deseja apresentar?'}</Text>
          <AdminButton label="Fechar ingresso" icon={X} iconOnly variant="ghost" onPress={close} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}
          onLayout={({ nativeEvent: { layout } }) => setArea({ width: Math.floor(layout.width), height: Math.floor(layout.height) })}>
          {!format ? <View style={{ width: '100%', maxWidth: 400, gap: 12 }}>
            <AdminButton primary label="QR Code" icon={QrCode} onPress={() => setFormat('qr')} />
            <AdminButton label="Código de barras" icon={Barcode} onPress={() => setFormat('bars')} />
          </View> : area.width > 0 && area.height > 0 && children({ format, ...area })}
        </View>
        {format && hasBarcode && <View style={{ alignSelf: 'center', paddingVertical: height < 450 ? 2 : 10 }}>
          <AdminButton label={format === 'qr' ? 'Usar código de barras' : 'Usar QR Code'} onPress={() => setFormat(format === 'qr' ? 'bars' : 'qr')} />
        </View>}
      </SafeAreaView>
    </Modal>}
  </>;
}

export function PrintedTicketPresentation({ qr, code }: { qr: string; code?: string | null }) {
  return <TicketPresentation hasBarcode={Boolean(code)}>{display => <TicketSymbol {...display} qr={qr} code={code} />}</TicketPresentation>;
}
