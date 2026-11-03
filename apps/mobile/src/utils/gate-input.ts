import type { GateCredential } from '@nacional/shared/types';
export function gateCredential(value: string): GateCredential {
  const candidate = value.trim().replace(/^nacional:\/\/ticket\//, '');
  if (candidate.length <= 2048 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate)) return { token: candidate };
  const code = candidate.replace(/[\s-]/g, '').toUpperCase();
  if (/^[2-9A-HJ-NP-Z]{10}$/.test(code)) return { code };
  throw new Error('Leia o QR ou digite os 10 caracteres do código exibido no app do titular.');
}
