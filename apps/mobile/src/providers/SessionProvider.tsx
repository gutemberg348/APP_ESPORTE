import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Member, AuthResponse } from '@nacional/shared/types';
import demo from '../config/demo';
import { config } from '../config/env';
import { request, ApiError } from '../services/api';
import { authClient } from '../services/auth-client';
interface Session {
  member: Member | null; token: string | null; loading: boolean; bootError: string | null; demoMode: boolean;
  signIn: (email: string, password: string, name?: string, portal?: 'APP' | 'ADMIN') => Promise<void>;
  signOut: () => Promise<void>; logoutAll: () => Promise<void>; clearSession: () => Promise<void>;
  retry: () => Promise<void>; updateMember: (member: Member) => void; resumeDemo: () => void;
}
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: React.PropsWithChildren) {
  const [member, setMember] = useState<Member | null>(config.demo ? demo.member as Member : null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(!config.demo);
  const [bootError, setBootError] = useState<string | null>(null);
  const clearSession = useCallback(async () => { await authClient.clear(); setToken(null); setMember(null); }, []);
  async function retry() {
    setLoading(true); setBootError(null);
    try {
      const saved = authClient.current() || await authClient.restore();
      if (saved) {
        // Use a still-valid access token on reload. request() renews it only
        // when needed, avoiding needless consumption of rotating refresh tokens.
        const profile = await request<Member>('/me', { token: saved.accessToken });
        if (!authClient.current() || !authClient.owns(saved.accessToken)) return;
        setMember(profile); setToken(authClient.current()?.accessToken || null);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await clearSession();
      else setBootError(error instanceof Error ? error.message : 'Erro ao restaurar sessão.');
    } finally { setLoading(false); }
  }
  useEffect(() => {
    const unsubscribe = authClient.subscribe((tokens) => { setToken(tokens?.accessToken || null); if (!tokens && !config.demo) setMember(null); });
    if (!config.demo) void retry();
    return unsubscribe;
  }, []);
  async function signIn(email: string, password: string, name?: string, portal: 'APP' | 'ADMIN' = 'APP') {
    const result = await request<AuthResponse>(name ? '/auth/register' : '/auth/login', { method: 'POST', body: { email, password, ...(name ? { name } : portal === 'ADMIN' ? { portal } : {}) } });
    await authClient.accept(result); setToken(result.accessToken); setMember(result.member);
  }
  const signOut = useCallback(async () => {
    const access = authClient.current()?.accessToken;
    if (access) {
      try { await request('/auth/logout', { token: access, method: 'POST' }); }
      catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
    }
    await clearSession();
  }, [clearSession]);
  const logoutAll = useCallback(async () => {
    const access = authClient.current()?.accessToken;
    if (access) await request('/auth/logout-all', { token: access, method: 'POST' });
    await clearSession();
  }, [clearSession]);
  return <Context.Provider value={{ member, token, loading, bootError, demoMode: config.demo, signIn, signOut, logoutAll, clearSession, retry, updateMember: setMember, resumeDemo: () => { if (config.demo) setMember(demo.member as Member); } }}>{children}</Context.Provider>;
}
export function useSession() { const context = useContext(Context); if (!context) throw new Error('SessionProvider ausente'); return context; }
