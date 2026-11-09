import { networkInterfaces } from 'node:os';
const loopback = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
export function createDevelopmentOriginPolicy({ enabled = false, origins = [], interfaces = networkInterfaces } = {}) {
  const localPorts = new Set(origins.flatMap((origin) => { try { const url = new URL(origin); return loopback(url.hostname) ? [`${url.protocol}:${url.port}`] : []; } catch { return []; } }));
  return (origin) => {
    if (!enabled) return false;
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || !localPorts.has(`${url.protocol}:${url.port}`)) return false;
      if (loopback(url.hostname)) return true;
      return Object.values(interfaces()).flat().some((item) => item && !item.internal && item.family === 'IPv4' && item.address === url.hostname);
    } catch { return false; }
  };
}
