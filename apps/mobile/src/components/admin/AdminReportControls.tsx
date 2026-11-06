import React, { useEffect, useRef, useState } from 'react';
import { View, AppState } from 'react-native';
import type { Match, ReportPagination } from '@nacional/shared/types';
import { Text } from '../Typography';
import { AdminField, AdminSelect, AdminDateTimeField } from './AdminControls';
import { AdminAction } from './AdminLayout';
import { useTheme } from '../../theme/ThemeProvider';
import { useSession } from '../../providers/SessionProvider';
import { messageOf } from '../../utils/format';
export { appliedReportFilters as appliedFilters } from '../../utils/admin';

export type Filters = Record<string, string>;
export function useAdminReport<T>(load: (token: string, filters: Filters) => Promise<T>, filters: Filters, refreshKey: number) {
  const { token } = useSession();
  const [data, setData] = useState<T | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    const current = ++sequence.current;
    setData(null); setError(''); setLoading(true);
    if (!token) { setLoading(false); return; }
    let running = false;
    const fetchReport = async () => {
      if (running || AppState.currentState !== 'active') return;
      running = true;
      try { const result = await load(token, filters); if (sequence.current === current) { setData(result); setError(''); } }
      catch (err) { if (sequence.current === current) setError(messageOf(err)); }
      finally { running = false; if (sequence.current === current) setLoading(false); }
    };
    void fetchReport(); const timer = setInterval(() => void fetchReport(), 15000);
    return () => { sequence.current++; clearInterval(timer); };
  }, [token, filters, refreshKey, load]);
  return { data, loading, error };
}
export const ReportInput = (props: React.ComponentProps<typeof AdminField>) => <AdminField {...props} grow />;
export const ReportSelect = (props: React.ComponentProps<typeof AdminSelect>) => <AdminSelect {...props} grow />;

export function LocationFilters({ matches, draft, setDraft }: { matches: Match[]; draft: Filters; setDraft: (value: Filters) => void }) {
  const selected = matches.find((match) => match.id === draft.matchId);
  return <><ReportSelect label="Partida" value={draft.matchId || ''} options={[{ value: '', label: 'Todas as partidas' }, ...matches.map((match) => ({ value: match.id, label: `${match.homeTeam} × ${match.awayTeam} · ${new Date(match.startsAt).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}` }))]} onChange={(matchId) => setDraft({ ...draft, matchId, sectorId: '' })} /><ReportSelect label="Setor" value={draft.sectorId || ''} options={[{ value: '', label: selected ? 'Todos os setores' : 'Selecione uma partida' }, ...(selected?.sectors || []).map((sector) => ({ value: sector.id, label: sector.name }))]} onChange={(sectorId) => setDraft({ ...draft, sectorId })} /></>;
}
export function PeriodFilters({ draft, setDraft }: { draft: Filters; setDraft: (value: Filters) => void }) {
  return <><AdminDateTimeField defaultTime="00:00" label="A partir de" value={draft.from || ''} onChange={(from) => setDraft({ ...draft, from })} optional grow /><AdminDateTimeField defaultTime="23:59" label="Até" value={draft.to || ''} onChange={(to) => setDraft({ ...draft, to })} optional grow /></>;
}
export function ReportError({ error }: { error: string }) {
  const { colors } = useTheme();
  return error ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null;
}
export function ReportPager({ pagination, loading, onOffset }: { pagination?: ReportPagination; loading: boolean; onOffset: (offset: number) => void }) {
  const { colors } = useTheme();
  if (!pagination) return null;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.subtle, fontSize: 11 }}>{pagination.total ? `${pagination.offset + 1}–${Math.min(pagination.offset + pagination.limit, pagination.total)} de ${pagination.total}` : 'Nenhum registro'}</Text><View style={{ flexDirection: 'row', gap: 8 }}><AdminAction label="Anterior" disabled={loading || !pagination.offset} onPress={() => onOffset(Math.max(0, pagination.offset - pagination.limit))} /><AdminAction label="Próxima" disabled={loading || !pagination.hasMore} onPress={() => onOffset(pagination.offset + pagination.limit)} /></View></View>;
}
export function ReportMetrics({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden' }}>{items.map((item, index) => <View key={item.label} style={{ flexGrow: 1, flexBasis: 160, minWidth: 0, padding: 20, gap: 7, borderLeftWidth: index ? 1 : 0, borderColor: colors.border }}><Text style={{ color: colors.muted, fontSize: 12 }}>{item.label}</Text><Text heading style={{ color: colors.text, fontSize: 28, lineHeight: 38, letterSpacing: -0.8, fontWeight: '600' }}>{item.value}</Text>{item.hint && <Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 17 }}>{item.hint}</Text>}</View>)}</View>;
}
