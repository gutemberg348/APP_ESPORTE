import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthTokens } from '@nacional/shared/types';
const key = 'nacional.auth.v2';
let webSession: AuthTokens | null = null;
export const sessionStorage = {
  async get(): Promise<AuthTokens | null> {
    if (Platform.OS === 'web') return webSession;
    const saved = await SecureStore.getItemAsync(key);
    if (!saved) return null;
    try {
      const value = JSON.parse(saved);
      if (typeof value.accessToken !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.accessToken) || typeof value.refreshToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.refreshToken) || value.tokenType !== 'Bearer' || !Number.isFinite(Date.parse(value.accessTokenExpiresAt)) || !Number.isFinite(Date.parse(value.refreshTokenExpiresAt))) throw new Error('invalid session');
      return value;
    } catch { await SecureStore.deleteItemAsync(key); return null; }
  },
  async set(tokens: AuthTokens) {
    if (Platform.OS === 'web') webSession = tokens;
    else await SecureStore.setItemAsync(key, JSON.stringify(tokens));
  },
  async clear() {
    webSession = null;
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(key);
      await SecureStore.deleteItemAsync('nacional.session');
    }
  },
};
