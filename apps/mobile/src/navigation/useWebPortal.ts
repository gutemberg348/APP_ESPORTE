import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type Portal = 'app' | 'admin' | 'gate';
function currentPortal(): Portal {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'app';
  if (/^\/portaria(?:\/|$)/.test(window.location.pathname)) return 'gate';
  return /^\/app(?:\/|$)/.test(window.location.pathname) ? 'app' : 'admin';
}
export function useWebPortal() {
  const [portal, setPortal] = useState<Portal>(currentPortal);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const update = () => setPortal(currentPortal());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  function navigate(next: Portal) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.pushState(null, '', next === 'admin' ? '/admin' : next === 'gate' ? '/portaria' : '/app');
    setPortal(next);
  }
  return { portal, navigate };
}
