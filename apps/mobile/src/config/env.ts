import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiUrl, type ApiHostMode } from './api-url';

export function getApiUrl() {
  const mode = process.env.EXPO_PUBLIC_API_HOST_MODE || 'auto';
  if (!['auto', 'local', 'configured'].includes(mode)) throw new Error('EXPO_PUBLIC_API_HOST_MODE deve ser auto, local ou configured.');
  return resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, Platform.OS, Constants.expoConfig?.hostUri, __DEV__, Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined, mode as ApiHostMode);
}

export const config = {
  demo: process.env.EXPO_PUBLIC_DEMO_MODE === 'true',
  tenantSlug: process.env.EXPO_PUBLIC_TENANT_SLUG || 'nacional-patos',
  get apiUrl() { return getApiUrl(); },
};
