function isLoopback(host: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(host.toLowerCase());
}

export function resolveApiUrl(configured: string | undefined, platform: string, hostUri?: string | null, development = false) {
  const url = new URL(configured || 'http://localhost:3333/v1');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Configure EXPO_PUBLIC_API_URL com uma URL HTTP/HTTPS válida, sem credenciais.');
  // On a physical phone localhost is the phone itself. Use the computer that
  // serves Expo only in development; explicit remote API addresses stay intact.
  if (development && platform !== 'web' && isLoopback(url.hostname) && hostUri) {
    try {
      const expoHost = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`);
      if (!isLoopback(expoHost.hostname)) url.hostname = expoHost.hostname;
    } catch { /* An explicit LAN URL can still be configured in .env. */ }
  }
  return url.toString().replace(/\/$/, '');
}
