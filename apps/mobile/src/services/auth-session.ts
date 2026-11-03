import type { AuthResponse, AuthTokens } from '@nacional/shared/types';
interface SessionDependencies {
  storage: { get: () => Promise<AuthTokens | null>; set: (tokens: AuthTokens) => Promise<void>; clear: () => Promise<void> };
  exchange: (refreshToken: string) => Promise<AuthResponse>;
  unauthorized: () => Error;
  isRejected: (error: unknown) => boolean;
}
export function createSessionManager({ storage, exchange, unauthorized, isRejected }: SessionDependencies) {
  let current: AuthTokens | null = null;
  let generation = 0;
  let inFlight: Promise<AuthResponse> | null = null;
  let storageQueue: Promise<void> = Promise.resolve();
  const listeners = new Set<(tokens: AuthTokens | null) => void>();
  const accessHistory = new Set<string>();
  function remember(token: string, reset = false) {
    if (reset) accessHistory.clear();
    accessHistory.add(token);
    if (accessHistory.size > 16) accessHistory.delete(accessHistory.values().next().value!);
  }
  const notify = () => { for (const listener of listeners) listener(current); };
  function persist(work: () => Promise<void>) {
    const next = storageQueue.catch(() => {}).then(work);
    storageQueue = next; return next;
  }
  function tokensOf(value: AuthResponse): AuthTokens {
    return { accessToken: value.accessToken, refreshToken: value.refreshToken, accessTokenExpiresAt: value.accessTokenExpiresAt, refreshTokenExpiresAt: value.refreshTokenExpiresAt, expiresIn: value.expiresIn, tokenType: value.tokenType };
  }
  const manager = {
    current: () => current,
    owns: (token: string) => accessHistory.has(token),
    subscribe(listener: (tokens: AuthTokens | null) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async accept(value: AuthResponse) {
      const start = ++generation;
      inFlight = null;
      const next = tokensOf(value);
      await persist(() => storage.set(next));
      if (start !== generation) throw unauthorized();
      current = next; remember(next.accessToken, true); notify();
    },
    async restore() {
      if (current) return current;
      const start = generation;
      await storageQueue.catch(() => {});
      const saved = await storage.get();
      if (start !== generation) return current;
      current = saved; accessHistory.clear(); if (saved) remember(saved.accessToken); generation++; notify(); return saved;
    },
    async clear() {
      generation++; current = null; inFlight = null; accessHistory.clear(); notify();
      await persist(() => storage.clear());
    },
    async refresh(): Promise<AuthResponse> {
      if (inFlight) return inFlight;
      const expected = current;
      const start = generation;
      if (!expected) throw unauthorized();
      const task = (async () => {
        try {
          const result = await exchange(expected.refreshToken);
          if (start !== generation) throw unauthorized();
          const next = tokensOf(result);
          await persist(() => storage.set(next));
          if (start !== generation) throw unauthorized();
          current = next; remember(next.accessToken); notify(); return result;
        } catch (error) {
          if (isRejected(error) && start === generation) await manager.clear();
          throw error;
        }
      })();
      inFlight = task;
      try { return await task; } finally { if (inFlight === task) inFlight = null; }
    },
  };
  return manager;
}
