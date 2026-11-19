import type { AuthTokens } from '@nacional/shared/types';
import { createWebSessionStorage } from './web-session-storage';

type TokenStore = ReturnType<typeof createWebSessionStorage>;
type Lock = <T>(work: () => Promise<T>) => Promise<T>;

function sessionId(tokens: AuthTokens | null): string | undefined {
  try {
    const payload = tokens?.accessToken.split('.')[1];
    if (!payload) return undefined;
    const { sid } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof sid === 'string' ? sid : undefined;
  } catch { return undefined; }
}

export function createRememberedWebSession(tab: TokenStore, persistent: () => TokenStore, lock: Lock, revoked: () => Error) {
  let remembered: string | undefined;
  return {
    async get() {
      const tabSession = await tab.get();
      if (tabSession) return tabSession;
      const saved = await lock(() => persistent().get());
      remembered = sessionId(saved);
      return remembered ? saved : null;
    },
    async set(tokens: AuthTokens, remember?: boolean) {
      if (!remember) {
        if (remember === false) {
          remembered = undefined;
          await lock(() => persistent().clear());
        }
        await tab.set(tokens);
        return;
      }
      await lock(async () => {
        const store = persistent();
        await store.set(tokens);
        // Probe through a fresh instance so a blocked browser store cannot masquerade as persistence.
        remembered = sessionId(await persistent().get());
        if (remembered && remembered === sessionId(tokens)) await tab.clear();
        else { remembered = undefined; await tab.set(tokens); }
      });
    },
    async clear() {
      const id = remembered;
      remembered = undefined;
      await tab.clear();
      if (!id) return;
      await lock(async () => {
        const store = persistent();
        if (sessionId(await store.get()) === id) await store.clear();
      });
    },
    async rotate(expected: AuthTokens, renew: (refreshToken: string) => Promise<AuthTokens>) {
      if (!remembered) return null;
      return lock(async () => {
        const store = persistent();
        const saved = await store.get();
        if (!saved || sessionId(saved) !== remembered || sessionId(expected) !== remembered) throw revoked();
        if (saved.refreshToken !== expected.refreshToken && Date.parse(saved.accessTokenExpiresAt) > Date.now() + 30000) return saved;
        const next = await renew(saved.refreshToken);
        await store.set(next);
        return next;
      });
    },
  };
}
