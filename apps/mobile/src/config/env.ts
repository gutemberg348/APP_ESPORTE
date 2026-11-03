import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveApiUrl } from './api-url';

export const config = {
  demo: process.env.EXPO_PUBLIC_DEMO_MODE === 'true',
  tenantSlug: process.env.EXPO_PUBLIC_TENANT_SLUG || 'nacional-patos',
  apiUrl: resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, Platform.OS, Constants.expoConfig?.hostUri, __DEV__),
};
