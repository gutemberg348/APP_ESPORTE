import type { GateV1Match } from '@nacional/shared/gate-v1';

export type Station = { partidaId: string; alocacaoId: string; catracaId: string };
export const defaultGate = (name?: string | null) => name?.trim().slice(0, 50) || 'PORTAO-01';

export function parseStation(raw: string | null): Station | null {
  try {
    const value: Partial<Station> | null = raw ? JSON.parse(raw) : null;
    if (value && typeof value.partidaId === 'string' && value.partidaId && typeof value.alocacaoId === 'string' &&
      value.alocacaoId && typeof value.catracaId === 'string' && value.catracaId.trim() && value.catracaId.length <= 50) {
      return { partidaId: value.partidaId, alocacaoId: value.alocacaoId, catracaId: value.catracaId };
    }
    return null;
  } catch { return null; }
}

export function resolveStation(matches: GateV1Match[], saved: Station | null): Station | null {
  if (saved && matches.some(match => match.id === saved.partidaId && match.alocacoesSetor.some(sector => sector.id === saved.alocacaoId))) {
    return saved;
  }
  const [match] = matches;
  const [sector] = match?.alocacoesSetor ?? [];
  if (matches.length !== 1 || !match || !sector || match.alocacoesSetor.length !== 1) return null;
  return { partidaId: match.id, alocacaoId: sector.id, catracaId: defaultGate(sector.setor.portaoEntrada) };
}
