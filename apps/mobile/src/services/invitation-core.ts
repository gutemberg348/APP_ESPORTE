export const invitationLifetime = 30 * 86400000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function invitationFromUrl(raw?: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const web = ['https:', 'http:'].includes(url.protocol) && url.pathname === '/app';
    const app = url.protocol === 'nacional:' && url.host === 'invite' && ['', '/'].includes(url.pathname);
    const code = url.searchParams.get('ref');
    return (web || app) && !url.username && !url.password && url.searchParams.getAll('ref').length === 1 && code && uuid.test(code) ? code.toLowerCase() : null;
  } catch { return null; }
}
export function storedInvitation(raw: string | null, now = Date.now()): string | null {
  try {
    const value = JSON.parse(raw || 'null');
    return value && typeof value.code === 'string' && uuid.test(value.code) && Number.isFinite(value.at) && value.at <= now && now - value.at < invitationLifetime ? value.code : null;
  } catch { return null; }
}
