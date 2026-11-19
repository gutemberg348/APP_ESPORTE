import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { portalPaths, webPortal } from './web-portals';

export function useWebPortal() {
  const [nativePortal, setNativePortal] = useState<keyof typeof portalPaths>('app');
  const browser = Platform.OS === 'web' && typeof window !== 'undefined';
  const portal = browser ? webPortal(window.location.pathname) : nativePortal;
  useEffect(() => {
    if (!browser || portal !== 'staff') return;
    const { pathname, search, hash } = window.location;
    if (pathname !== portalPaths[portal]) window.history.replaceState(null, '', portalPaths[portal] + search + hash);
  }, [browser, portal]);

  function navigate(next: keyof typeof portalPaths) {
    // A fresh document restores only the session belonging to the destination portal.
    if (browser) window.location.assign(portalPaths[next]);
    else setNativePortal(next);
  }
  return { portal, navigate };
}
