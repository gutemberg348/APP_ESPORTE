import type { AuthTokens } from '@nacional/shared/types';
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createWebSessionStorage(key: string, browserStorage: () => BrowserStorage | null, now = () => Date.now()) {
  let memory: AuthTokens | null = null;
  function remove() { try { browserStorage()?.removeItem(key); } catch { /* Private browsing may deny storage. */ } }
  return {
    async get(): Promise<AuthTokens | null> {
      let raw: string | null;
      try { raw = browserStorage()?.getItem(key) ?? null; } catch { return memory; }
      if (!raw) return memory;
      try {
        const value = JSON.parse(raw);
        if (!value || typeof value.accessToken !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.accessToken) || typeof value.refreshToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.refreshToken) || value.tokenType !== 'Bearer' || !Number.isFinite(Date.parse(value.accessTokenExpiresAt)) || !Number.isFinite(Date.parse(value.refreshTokenExpiresAt)) || Date.parse(value.refreshTokenExpiresAt) <= now()) throw new Error('invalid session');
        memory = value;
        return memory;
      } catch { memory = null; remove(); return null; }
    },
    async set(tokens: AuthTokens) {
      memory = {
        accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        expiresIn: tokens.expiresIn, tokenType: tokens.tokenType,
      };
      try { browserStorage()?.setItem(key, JSON.stringify(memory)); } catch { /* Keep the active session usable if persistence is blocked. */ }
    },
    async clear() { memory = null; remove(); },
  };
}
