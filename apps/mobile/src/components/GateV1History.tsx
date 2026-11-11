import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { GateV1History as History, GateV1Match } from '@nacional/shared/gate-v1';
import type { GateOperator } from '@nacional/shared/types';
import { gateV1Api } from '../services/gate-v1';
import { adminApi } from '../services/admin';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { messageOf } from '../utils/format';
import { Text } from './Typography';
import { AdminButton, AdminNotice, AdminFilterPanel } from './admin/AdminControls';
import { PeriodFilters, ReportInput, ReportSelect, appliedFilters, type Filters } from './admin/AdminReportControls';
const reasons: Record<string, string> = { GATE_CLOSED: 'Portaria fechada ou fora do horário', TICKET_NOT_PAID: 'Pagamento não confirmado ou estornado', INGRESSO_JA_UTILIZADO: 'Ingresso já utilizado', WRONG_MATCH: 'Ingresso de outra partida', WRONG_SECTOR: 'Ingresso de outro setor', GATE_SCOPE_DENIED: 'Funcionário sem escala', INVALID_TICKET_QR: 'QR inválido', INVALID_GATE_CODE: 'Código inválido', TICKET_NOT_FOUND: 'Ingresso não encontrado', TICKET_NOT_VALID: 'Ingresso cancelado ou não emitido' };
export function GateV1History({ refreshKey = 0, partidaId, alocacaoId }: { refreshKey?: number; partidaId?: string; alocacaoId?: string }) {
  const { token, member } = useSession(), { colors } = useTheme();
  const [data, setData] = useState<History | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<GateV1Match[]>([]), [operators, setOperators] = useState<GateOperator[]>([]);
  const [draft, setDraft] = useState<Filters>({}), [filters, setFilters] = useState<Filters>({}), [kind, setKind] = useState('ALLOW'), [reload, setReload] = useState(0);
  useEffect(() => { let active = true; if (!token) return;
    void Promise.all([gateV1Api.matches(token), member?.role === 'ADMIN' ? adminApi.gateOperators(token) : Promise.resolve([])]).then(([m, o]) => { if (active) { setMatches(m); setOperators(o); } }).catch((err) => { if (active) setError(messageOf(err)); });
    return () => { active = false; };
  }, [token, member?.role, refreshKey]);
  useEffect(() => { setOffset(0); }, [partidaId, alocacaoId, kind, filters]);
  useEffect(() => { let current = true; if (!token) return; setBusy(true); setError(''); setData(null);
    void gateV1Api.history(token, { ...filters, kind, limit: '20', offset: String(offset), ...(partidaId ? { partidaId } : {}), ...(alocacaoId ? { alocacaoId } : {}) }).then((value) => { if (current) setData(value); }).catch((err) => { if (current) setError(messageOf(err)); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [token, refreshKey, reload, kind, filters, offset, partidaId, alocacaoId]);
  const match = matches.find((row) => row.id === (partidaId || draft.partidaId));
  function apply() { try { const next = Object.fromEntries(Object.entries(appliedFilters(draft)).filter(([, value]) => value !== '')); delete next.limit; delete next.offset; if (kind === 'DENIED') delete next.search; setFilters(next); setOffset(0); setError(''); } catch (err) { setError(messageOf(err)); } }
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AdminButton label="Entradas confirmadas" primary={kind === 'ALLOW'} onPress={() => setKind('ALLOW')} /><AdminButton label="Leituras recusadas" primary={kind === 'DENIED'} onPress={() => setKind('DENIED')} /><AdminButton label="Atualizar histórico" loading={busy} onPress={() => setReload((n) => n + 1)} /></View>
    <AdminFilterPanel title="Filtros da portaria">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {!partidaId && <ReportSelect label="Partida" value={draft.partidaId || ''} options={[{ value: '', label: 'Todas as partidas' }, ...matches.map((row) => ({ value: row.id, label: `${row.timeMandante} × ${row.timeVisitante}` }))]} onChange={(id) => setDraft({ ...draft, partidaId: id, alocacaoId: '' })} />}
        {!alocacaoId && <ReportSelect label="Setor" value={draft.alocacaoId || ''} options={[{ value: '', label: 'Todos os setores' }, ...(match?.alocacoesSetor || []).map((row) => ({ value: row.id, label: row.setor.nome }))]} onChange={(id) => setDraft({ ...draft, alocacaoId: id })} />}
        {member?.role === 'ADMIN' && <ReportSelect label="Funcionário" value={draft.actorId || ''} options={[{ value: '', label: 'Todos os funcionários' }, ...operators.map((row) => ({ value: row.id, label: row.name }))]} onChange={(id) => setDraft({ ...draft, actorId: id })} />}
        <ReportInput label="Protocolo completo" value={draft.protocol || ''} onChange={(protocol) => setDraft({ ...draft, protocol })} />
        {kind === 'ALLOW' && <ReportInput label="Nome do titular" value={draft.search || ''} onChange={(search) => setDraft({ ...draft, search })} />}
        <PeriodFilters draft={draft} setDraft={setDraft} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Horários de Patos (UTC−3). Cada protocolo confirmado corresponde a uma entrada. Funcionários consultam somente suas próprias operações.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AdminButton label="Aplicar filtros" primary onPress={apply} /><AdminButton label="Limpar filtros" onPress={() => { setDraft({}); setFilters({}); }} /></View>
    </AdminFilterPanel>
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    <Text style={{ color: colors.muted }}>{busy ? 'Carregando…' : `${data?.total ?? 0} registro(s) encontrado(s)`}</Text>
    {data?.items.map((row) => <View key={row.id} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 12, gap: 5 }}>
      <Text style={{ color: row.reason ? colors.danger : colors.text, fontWeight: '600' }}>{row.ticket?.nomeTitular || reasons[row.reason || ''] || row.reason || 'Entrada registrada'}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{row.ticket ? `${row.ticket.partida.timeMandante} × ${row.ticket.partida.timeVisitante} · ${row.ticket.alocacao.setor.nome}` : row.partida ? `${row.partida.timeMandante} × ${row.partida.timeVisitante}` : 'Partida indisponível'}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{row.actor?.name || 'Funcionário'} · {row.gate || 'Consulta'} · {new Date(row.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</Text>
      <Text selectable style={{ color: colors.muted, fontSize: 11 }}>Protocolo: {row.id}</Text>
    </View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AdminButton label="Anterior" disabled={busy || offset === 0} onPress={() => setOffset(Math.max(0, offset - 20))} /><AdminButton label="Próximos registros" disabled={busy || !data || offset + 20 >= data.total} onPress={() => setOffset(offset + 20)} /></View>
  </View>;
}
