import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import type { AuthResponse } from '@nacional/shared/types';
import { request } from './api';
import { readSocialCallback, socialRedirect, type SocialProvider } from './social-login-core';

export async function socialLogin(provider: SocialProvider): Promise<AuthResponse | null> {
  if (Platform.OS === 'web') throw new Error('O acesso com Google e Apple está disponível no aplicativo instalado. Neste navegador, entre com e-mail.');
  // The app keeps the proof in memory. An intercepted deep link alone cannot create a session.
  const verifier = Array.from(await Crypto.getRandomBytesAsync(32), byte => byte.toString(16).padStart(2, '0')).join('');
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const start = await request<{ authorizationUrl: string; attempt: string }>('/auth/social/start', { method: 'POST', body: { provider, challenge } });
  const authorization = new URL(start.authorizationUrl);
  if (authorization.protocol !== 'https:' || authorization.hostname !== (provider === 'google' ? 'accounts.google.com' : 'appleid.apple.com')) throw new Error('Endereço de autenticação inválido.');
  const result = await WebBrowser.openAuthSessionAsync(start.authorizationUrl, socialRedirect);
  if (result.type !== 'success') return null;
  const ticket = readSocialCallback(result.url, start.attempt);
  if (!ticket) return null;
  return request<AuthResponse>('/auth/social/exchange', { method: 'POST', body: { ticket, verifier } });
}
