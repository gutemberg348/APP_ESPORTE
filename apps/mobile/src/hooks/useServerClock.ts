import { useEffect, useRef, useState } from 'react';

// Keep countdowns tied to API time, even when the device's wall clock changes.
export function useServerClock(serverTime?: string) {
  const anchor = useRef({ epoch: Date.now(), point: performance.now(), synced: false });
  const [clock, setClock] = useState({ now: anchor.current.epoch, monotonic: anchor.current.point });
  useEffect(() => {
    const epoch = Date.parse(serverTime || '');
    if (!Number.isFinite(epoch)) return;
    const point = performance.now(), current = anchor.current;
    anchor.current = { epoch: current.synced ? Math.max(epoch, current.epoch + point - current.point) : epoch, point, synced: true };
    setClock({ now: anchor.current.epoch, monotonic: point });
  }, [serverTime]);
  useEffect(() => {
    const timer = setInterval(() => { const point = performance.now(); setClock({ now: anchor.current.epoch + point - anchor.current.point, monotonic: point }); }, 1000);
    return () => clearInterval(timer);
  }, []);
  return clock;
}
