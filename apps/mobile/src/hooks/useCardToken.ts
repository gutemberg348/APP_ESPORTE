import { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import type { CardToken } from '@nacional/shared/types';
import { useSession } from '../providers/SessionProvider';
import { clubApi } from '../services/club';
import { messageOf } from '../utils/format';
export function useCardToken(active: boolean) {
  const { token, demoMode, member } = useSession();
  const [card, setCard] = useState<CardToken | null>(null);
  const [remaining, setRemaining] = useState(30);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) { setCard(null); return; }
    let alive = true, busy = false, foreground = AppState.currentState === 'active';
    let current: CardToken | null = null;
    let retryAfter = 0;
    async function renew() {
      if (busy || !foreground || Date.now() < retryAfter) return;
      busy = true;
      try {
        const value = demoMode ? { token: `DEMONSTRACAO:SEM-VALIDADE:${member!.id}:${Math.floor(Date.now() / 30000)}`, expiresAt: new Date((Math.floor(Date.now() / 30000) + 1) * 30000).toISOString() } : await clubApi.card(token!);
        if (alive && foreground) { current = value; setCard(value); setRemaining(Math.max(0, Math.ceil((Date.parse(value.expiresAt) - Date.now()) / 1000))); setError(''); }
      } catch (err) { if (alive) { setError(messageOf(err)); setCard(null); retryAfter = Date.now() + 10000; } }
      finally { busy = false; }
    }
    const tick = () => {
      if (!foreground) return;
      const seconds = current ? Math.max(0, Math.ceil((Date.parse(current.expiresAt) - Date.now()) / 1000)) : 0;
      setRemaining(seconds);
      if (!seconds) { setCard(null); void renew(); }
    };
    void renew(); const interval = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', (state) => { foreground = state === 'active'; current = null; setCard(null); if (foreground) { retryAfter = 0; void renew(); } });
    return () => { alive = false; clearInterval(interval); subscription.remove(); };
  }, [active, token, demoMode, member?.id]);
  return { card, remaining, error };
}
