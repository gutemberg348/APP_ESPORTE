import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { TicketSymbol, type TicketFormat } from './TicketPresentation';
import type { TicketQr } from '@nacional/shared/types';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { clubApi } from '../services/club';
import { ApiError } from '../services/api';
import { Text } from './Typography';
import { Button } from './ui';
import { messageOf } from '../utils/format';
export function LiveTicketQr({ ticketId, onUsed, format, width, height }: { ticketId: string; onUsed: () => void; format: TicketFormat; width: number; height: number }) {
  const { token, demoMode } = useSession();
  const { colors } = useTheme();
  const [qr, setQr] = useState<TicketQr | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const retry = useRef<() => void>(() => {});
  const used = useRef(onUsed); used.current = onUsed;
  useEffect(() => {
    if (demoMode || !token) return;
    let alive = true, inFlight = false, foreground = !AppState.currentState || AppState.currentState === 'active', retryAt = 0;
    let current: TicketQr | null = null, deadline = 0, receivedAt = 0;
    async function renew(force = false) {
      if (!alive || !foreground || inFlight || (!force && performance.now() < retryAt)) return;
      inFlight = true; setBusy(true);
      const sentAt = performance.now();
      try {
        const value = await clubApi.ticketQr(token!, ticketId);
        if (!alive || !foreground) return;
        current = value;
        // Duration comes from server timestamps so a wrong phone clock does
        // not extend the token's displayed validity. Server verifies expiry.
        deadline = sentAt + Math.max(0, Date.parse(value.expiresAt) - Date.parse(value.serverTime) - 1500);
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
  return <View style={{ alignItems: 'center', gap: 12 }}>
    {qr && remaining > 0 ? <>
      <TicketSymbol format={format} width={width} height={Math.max(1, height - 55)} qr={qr.qr} code={qr.code} />
      <Text style={{ color: colors.text, textAlign: 'center' }}>Válido por {remaining}s · {qr.remainingQuantity} {qr.remainingQuantity === 1 ? 'entrada' : 'entradas'}</Text>
    </> : <Text style={{ color: colors.muted, textAlign: 'center' }}>{error || 'Buscando seu ingresso…'}</Text>}
    {!!error && <Button secondary label="Tentar novamente" loading={busy} onPress={() => retry.current()} />}
  </View>;
}
