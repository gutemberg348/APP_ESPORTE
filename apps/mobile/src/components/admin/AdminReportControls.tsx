import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView, AppState } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import type { Match, ReportPagination } from '@nacional/shared/types';
import { Text, TextInput } from '../Typography';
import { Panel } from '../ui';
import { Sheet } from '../Sheet';
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
export function ReportInput({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const { colors } = useTheme();
  return <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 0, gap: 6 }}><Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.subtle} autoCapitalize="none" style={{ minHeight: 43, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, fontSize: 12 }} /></View>;
}
export function ReportSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = options.filter((option) => normalized(option.label).includes(normalized(search)));
  return <View style={{ flexGrow: 1, flexBasis: 200, minWidth: 0, gap: 6 }}><Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options.find((option) => option.value === value)?.label || 'Selecionar'}`} onPress={() => { setSearch(''); setOpen(true); }} style={{ minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 8 }}><Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 12 }}>{options.find((option) => option.value === value)?.label || 'Selecionar'}</Text><ChevronDown size={15} color={colors.subtle} /></Pressable>{open && <Sheet visible title={label} onClose={() => setOpen(false)}><ReportInput label="Buscar opção" value={search} onChange={setSearch} placeholder="Digite para buscar" /><ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">{filtered.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: value === option.value }} onPress={() => { onChange(option.value); setOpen(false); }} style={{ padding: 14, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: value === option.value ? colors.primarySoft : colors.surface }}><Text style={{ color: value === option.value ? colors.primary : colors.text, fontSize: 13 }}>{option.label}</Text></Pressable>)}{!filtered.length && <Text style={{ color: colors.muted, padding: 14 }}>Nenhuma opção encontrada.</Text>}</ScrollView></Sheet>}</View>;
}
export function LocationFilters({ matches, draft, setDraft }: { matches: Match[]; draft: Filters; setDraft: (value: Filters) => void }) {
  const selected = matches.find((match) => match.id === draft.matchId);
  return <><ReportSelect label="Partida" value={draft.matchId || ''} options={[{ value: '', label: 'Todas as partidas' }, ...matches.map((match) => ({ value: match.id, label: `${match.homeTeam} × ${match.awayTeam} · ${new Date(match.startsAt).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}` }))]} onChange={(matchId) => setDraft({ ...draft, matchId, sectorId: '' })} /><ReportSelect label="Setor" value={draft.sectorId || ''} options={[{ value: '', label: selected ? 'Todos os setores' : 'Selecione uma partida' }, ...(selected?.sectors || []).map((sector) => ({ value: sector.id, label: sector.name }))]} onChange={(sectorId) => setDraft({ ...draft, sectorId })} /></>;
}
export function PeriodFilters({ draft, setDraft }: { draft: Filters; setDraft: (value: Filters) => void }) {
  return <><ReportInput label="De · horário de Patos" value={draft.from || ''} onChange={(from) => setDraft({ ...draft, from })} placeholder="AAAA-MM-DD HH:mm" /><ReportInput label="Até · horário de Patos" value={draft.to || ''} onChange={(to) => setDraft({ ...draft, to })} placeholder="AAAA-MM-DD HH:mm" /></>;
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
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{items.map((item) => <Panel key={item.label} style={{ flexGrow: 1, flexBasis: 170, minWidth: 0, padding: 18, borderRadius: 10, gap: 8 }}><Text style={{ color: colors.muted, fontSize: 11 }}>{item.label}</Text><Text heading style={{ color: colors.text, fontSize: 25, fontWeight: '700' }}>{item.value}</Text>{item.hint && <Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 16 }}>{item.hint}</Text>}</Panel>)}</View>;
}
