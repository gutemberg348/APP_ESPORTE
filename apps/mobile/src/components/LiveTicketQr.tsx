import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { TicketQr } from '@nacional/shared/types';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { clubApi } from '../services/club';
import { ApiError } from '../services/api';
import { Text } from './Typography';
import { Button } from './ui';
import { messageOf } from '../utils/format';
export function LiveTicketQr({ ticketId, onUsed }: { ticketId: string; onUsed: () => void }) {
  const { token, demoMode } = useSession();
  const { colors, tone } = useTheme();
  const [qr, setQr] = useState<TicketQr | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const retry = useRef<() => void>(() => {});
  const used = useRef(onUsed); used.current = onUsed;
  useEffect(() => {
    if (demoMode || !token) return;
    let alive = true, inFlight = false, foreground = AppState.currentState === 'active', retryAt = 0;
    let current: TicketQr | null = null, deadline = 0, receivedAt = 0;
    async function renew(force = false) {
      if (!alive || !foreground || inFlight || (!force && performance.now() < retryAt)) return;
      inFlight = true; setBusy(true);
      try {
        const value = await clubApi.ticketQr(token!, ticketId);
        if (!alive || !foreground) return;
        current = value;
        // Duration comes from server timestamps so a wrong phone clock does
        // not extend the token's displayed validity. Server verifies expiry.
        deadline = performance.now() + Math.max(0, Date.parse(value.expiresAt) - Date.parse(value.serverTime) - 1500);
        receivedAt = performance.now(); setQr(value); setError('');
        setRemaining(Math.max(0, Math.floor((deadline - performance.now()) / 1000)));
      } catch (err) {
        if (!alive) return;
        current = null; setQr(null); setError(messageOf(err)); retryAt = performance.now() + 10000;
        if (err instanceof ApiError && err.code === 'INVALID_TICKET') used.current();
      } finally { inFlight = false; if (alive) setBusy(false); }
    }
    retry.current = () => { retryAt = 0; void renew(true); };
    function tick() {
      if (!alive || !foreground) return;
      const seconds = Math.max(0, Math.floor((deadline - performance.now()) / 1000)); setRemaining(seconds);
      if (!seconds) { current = null; setQr(null); }
      if (!current || performance.now() - receivedAt >= 15000) void renew();
    }
    void renew(); const interval = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      foreground = state === 'active'; current = null; deadline = 0; setQr(null); setRemaining(0);
      if (foreground) { retryAt = 0; void renew(true); }
    });
    return () => { alive = false; clearInterval(interval); subscription.remove(); retry.current = () => {}; };
  }, [ticketId, token, demoMode]);
  return <View style={{ gap: 12 }}>
    {qr && remaining > 0 ? <><View style={{ alignSelf: 'center', padding: 16, borderRadius: 18, backgroundColor: '#fff' }}><QRCode value={qr.qr} size={210} color={tone('#08150f')} /></View><Text style={{ color: colors.muted, textAlign: 'center', fontSize: 12 }}>CÓDIGO PARA DIGITAR NA PORTARIA</Text><Text selectable heading style={{ color: colors.text, textAlign: 'center', fontSize: 25, lineHeight: 34, fontWeight: '800', letterSpacing: 2 }}>{qr.code}</Text><Text style={{ color: colors.primary, textAlign: 'center', fontSize: 14 }}>QR e código válidos por {remaining}s · {qr.remainingQuantity} entrada(s) restantes</Text><Text style={{ color: colors.muted, textAlign: 'center', fontSize: 12 }}>Apresente o app aberto na portaria. Após uma entrada, aguarde o próximo QR ou código.</Text></> : <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 14 }}>{error || 'Solicitando QR atualizado…'}</Text>}
    <Button secondary label={busy ? 'Atualizando QR…' : 'Atualizar QR de entrada'} loading={busy} onPress={() => retry.current()} />
  </View>;
}
