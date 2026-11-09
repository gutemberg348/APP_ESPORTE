function isLoopback(host: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(host.toLowerCase());
}

function isLocalHost(host: string) {
  if (isLoopback(host)) return true;
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b! >= 16 && b! <= 31);
}

export type ApiHostMode = 'auto' | 'local' | 'configured';
export function resolveApiUrl(configured: string | undefined, platform: string, hostUri?: string | null, development = false, webOrigin?: string | null, hostMode: ApiHostMode = 'auto') {
  const url = new URL(configured || 'http://localhost:3333/v1');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Configure EXPO_PUBLIC_API_URL com uma URL HTTP/HTTPS válida, sem credenciais.');
  // Auto resolves loopback only. Local mode also follows the development
  // computer when an old private IPv4 was compiled into an earlier bundle.
  // Configured mode always preserves intentional separate API servers.
  const localHost = platform === 'web' ? webOrigin : hostUri;
  if (development && hostMode !== 'configured' && (isLoopback(url.hostname) || (hostMode === 'local' && isLocalHost(url.hostname))) && localHost) {
    try {
      const currentHost = new URL(localHost.includes('://') ? localHost : `http://${localHost}`);
      if (isLocalHost(currentHost.hostname) && (platform === 'web' || !isLoopback(currentHost.hostname))) url.hostname = currentHost.hostname;
    } catch { /* An explicit LAN URL can still be configured in .env. */ }
  }
  return url.toString().replace(/\/$/, '');
}
