import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { config } from '../config/env';
import { checkApiConnection, type ApiConnectionStatus } from '../services/api-connection';
import { Button } from './ui';
import { Text } from './Typography';
import { useTheme } from '../theme/ThemeProvider';

export function ApiConnectionHelp({ disabled = false, onRecovered }: { disabled?: boolean; onRecovered?: (message: string) => void }) {
  const { colors } = useTheme(), [busy, setBusy] = useState(false), [status, setStatus] = useState<ApiConnectionStatus | null>(null);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function check() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setStatus(null);
    try { const result = await checkApiConnection(config.apiUrl); if (mounted.current) { setStatus(result); if (result.ready) onRecovered?.(result.message); } }
    catch { if (mounted.current) setStatus({ ready: false, apiOrigin: '', message: 'Não foi possível verificar a conexão. Tente novamente em instantes.' }); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <View style={{ gap: 10 }}>
    <Button secondary label="Verificar conexão" loading={busy} disabled={disabled} onPress={() => void check()} />
    {!!status && <Text accessibilityRole="alert" style={{ color: status.ready ? colors.primary : colors.muted, fontSize: 12, lineHeight: 19 }}>{status.message}</Text>}
  </View>;
}
