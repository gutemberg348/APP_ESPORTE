import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import { invitationFromUrl, storedInvitation } from './invitation-core';
const key = 'esporte:invitation:v1';
let pending: { code: string; at: number } | null = null;
let queue: Promise<unknown> = Promise.resolve();
export async function readInvitation(): Promise<string | undefined> {
  await queue;
  const memory = storedInvitation(JSON.stringify(pending));
  if (memory) return memory;
  try { return storedInvitation(await AsyncStorage.getItem(key)) || undefined; } catch { return undefined; }
}
export function captureInvitation(raw?: string | null) {
  const code = invitationFromUrl(raw);
  if (!code) return queue;
  queue = queue.then(async () => {
    let previous = storedInvitation(JSON.stringify(pending));
    try { previous ||= storedInvitation(await AsyncStorage.getItem(key)); } catch { /* Memory fallback. */ }
    if (previous) return;
    pending = { code, at: Date.now() };
    try { await AsyncStorage.setItem(key, JSON.stringify(pending)); } catch { /* Does not block registration. */ }
  });
  return queue;
}
export async function captureInitialInvitation() {
  try { await captureInvitation(Platform.OS === 'web' ? window.location.href : await Linking.getInitialURL()); } catch { /* Optional attribution. */ }
}
export async function clearInvitation() {
  await queue;
  pending = null;
  try { await AsyncStorage.removeItem(key); } catch { /* Attribution is only accepted on account creation. */ }
  if (Platform.OS === 'web') {
    const url = new URL(window.location.href);
    if (url.pathname === '/app' && url.searchParams.has('ref')) {
      url.searchParams.delete('ref'); window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }
}
