import { useRef, useState } from 'react';
import { messageOf } from '../../../utils/format';
export function useShopAction(onSaved?: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  async function run(work: () => Promise<unknown>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { await work(); await onSaved?.(); } catch (err) { setError(messageOf(err)); }
    finally { locked.current = false; setBusy(false); }
  }
  return { busy, error, run, setError };
}
