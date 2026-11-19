import { club } from '../config/club';
import React, { useEffect, useRef, useState } from 'react';
import { View, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Text, TextInput } from './Typography';
import { Button } from './ui';
import { Sheet } from './Sheet';
import { useTheme } from '../theme/ThemeProvider';
import { messageOf } from '../utils/format';
import { AdminNotice } from './admin/AdminControls';
export function PaymentQrScanner({ onRead, onClose, title = 'Ler QR da venda', manualLabel = 'Abrir código da venda', instructions = `Aponte para o QR do ${club.shortName} exibido pelo caixa. Para pagar um QR Pix, use o aplicativo do seu banco.`, placeholder = 'nacional://sale/…', ticketMode = false }: { onRead: (value: string) => Promise<void>; onClose: () => void; title?: string; instructions?: string; placeholder?: string; manualLabel?: string; ticketMode?: boolean }) {
  const { colors } = useTheme();
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: false });
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraFailed, setCameraFailed] = useState(false);
  const webCameraUnavailable = Platform.OS === 'web' && (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia);
  useEffect(() => {
    if (!webCameraUnavailable) void getPermission().catch(() => { /* Browsers without a permission query can still show the prompt. */ });
  }, [getPermission, webCameraUnavailable]);
  const lock = useRef(false);
  async function read(value: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await onRead(value); }
    catch (err) { setError(messageOf(err)); setBusy(false); lock.current = false; }
  }
  return <Sheet visible title={title} onClose={onClose}>
    <Text style={{ color: colors.muted, fontSize: 14 }}>{instructions}</Text>
    {webCameraUnavailable || cameraFailed ? <AdminNotice>Não foi possível abrir a câmera. Digite o código abaixo ou abra o leitor em outro dispositivo.</AdminNotice>
      : permission?.granted ? <View style={{ height: 250, borderRadius: 20, overflow: 'hidden' }}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ticketMode ? ['qr', 'code128'] : ['qr'] }} onMountError={() => setCameraFailed(true)} onBarcodeScanned={busy || error ? undefined : ({ data }) => void read(data)} /></View>
      : permission && !permission.canAskAgain ? <AdminNotice>Permita o acesso à câmera nas configurações do dispositivo ou digite o código abaixo.</AdminNotice>
      : <Button secondary label="Permitir câmera" onPress={() => void requestPermission().catch(() => setCameraFailed(true))} />}
    <TextInput value={paste} onChangeText={setPaste} autoCapitalize="none" autoCorrect={false} placeholder={placeholder} placeholderTextColor={colors.muted} accessibilityLabel="QR ou link" style={{ color: colors.text, backgroundColor: colors.soft, padding: 14, borderRadius: 12 }} />
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    {!!error && permission?.granted && !cameraFailed && !webCameraUnavailable && <Button secondary label="Ler novamente" onPress={() => setError('')} />}
    <Button label={manualLabel} loading={busy} disabled={!paste.trim()} onPress={() => void read(paste)} />
  </Sheet>;
}
