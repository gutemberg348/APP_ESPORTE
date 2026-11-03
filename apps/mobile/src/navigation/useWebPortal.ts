import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type Portal = 'app' | 'admin';
function currentPortal(): Portal {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'app';
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
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.pushState(null, '', next === 'admin' ? '/admin' : '/app');
    setPortal(next);
  }
  return { portal, navigate };
}
