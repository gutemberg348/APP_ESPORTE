import { club } from '../config/club';
import React, { useState } from 'react';
import { View, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Text, TextInput } from './Typography';
import { Button } from './ui';
import { Sheet } from './Sheet';
import { useTheme } from '../theme/ThemeProvider';
export function PaymentQrScanner({ onRead, onClose, title = 'Ler QR da venda', manualLabel = 'Abrir código da venda', instructions = `Aponte para o QR do ${club.shortName} exibido pelo caixa. Para pagar um QR Pix, use o aplicativo do seu banco.`, placeholder = 'nacional://sale/…' }: { onRead: (value: string) => Promise<void>; onClose: () => void; title?: string; instructions?: string; placeholder?: string; manualLabel?: string }) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function read(value: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { await onRead(value); }
    catch (err) { setError(err instanceof Error ? err.message : 'QR inválido.'); setBusy(false); }
  }
  return <Sheet visible title={title} onClose={onClose}>
    <Text style={{ color: colors.muted, fontSize: 14 }}>{instructions}</Text>
    {permission?.granted ? <View style={{ height: 250, borderRadius: 20, overflow: 'hidden' }}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : ({ data }) => void read(data)} /></View> : <Button secondary label="Permitir câmera" disabled={!permission || !permission.canAskAgain} onPress={() => void requestPermission()} />}
    {permission && !permission.granted && !permission.canAskAgain && <Text style={{ color: colors.muted, fontSize: 14 }}>Ative a câmera nas configurações do aparelho ou cole o código abaixo.</Text>}
    {Platform.OS === 'web' && <Text style={{ color: colors.muted, fontSize: 12 }}>A câmera no navegador exige localhost ou conexão HTTPS.</Text>}
    <TextInput value={paste} onChangeText={setPaste} autoCapitalize="none" autoCorrect={false} placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel="QR ou link" style={{ color: colors.text, backgroundColor: colors.soft, padding: 14, borderRadius: 12 }} />
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <Button label={manualLabel} loading={busy} disabled={!paste.trim()} onPress={() => void read(paste)} />
  </Sheet>;
}
