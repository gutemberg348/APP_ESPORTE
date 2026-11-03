import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthTokens } from '@nacional/shared/types';
import { config } from '../config/env';
import { createWebSessionStorage } from './web-session-storage';
const key = 'nacional.auth.v2';
const web = createWebSessionStorage(`${key}:${encodeURIComponent(config.apiUrl)}`, () => typeof window === 'undefined' ? null : window.sessionStorage);
export const sessionStorage = {
  async get(): Promise<AuthTokens | null> {
    if (Platform.OS === 'web') return web.get();
    const saved = await SecureStore.getItemAsync(key);
    if (!saved) return null;
    try {
      const value = JSON.parse(saved);
      if (typeof value.accessToken !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.accessToken) || typeof value.refreshToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.refreshToken) || value.tokenType !== 'Bearer' || !Number.isFinite(Date.parse(value.accessTokenExpiresAt)) || !Number.isFinite(Date.parse(value.refreshTokenExpiresAt))) throw new Error('invalid session');
      return value;
    } catch { await SecureStore.deleteItemAsync(key); return null; }
  },
  async set(tokens: AuthTokens) {
    if (Platform.OS === 'web') await web.set(tokens);
    else await SecureStore.setItemAsync(key, JSON.stringify(tokens));
  },
  async clear() {
    await web.clear();
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(key);
      await SecureStore.deleteItemAsync('nacional.session');
    }
  },
};
