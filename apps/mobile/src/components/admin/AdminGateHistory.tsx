import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { AdminAdmission, GateDenial, GateOperator, Match } from '@nacional/shared/types';
import { Panel } from '../ui';
import { Text } from '../Typography';
import { Sheet } from '../Sheet';
import { useTheme } from '../../theme/ThemeProvider';
import { useSession } from '../../providers/SessionProvider';
import { adminApi } from '../../services/admin';
import { messageOf } from '../../utils/format';
import { AdminAction, AdminBadge, AdminTable, useDesktopAdmin } from './AdminLayout';
import { Filters, useAdminReport, ReportInput, ReportSelect, LocationFilters, PeriodFilters, appliedFilters, ReportError, ReportPager, ReportMetrics } from './AdminReportControls';

const at = (date: string) => new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
const reasonLabels: Record<string, string> = {
  WRONG_MATCH: 'Ingresso de outra partida', WRONG_SECTOR: 'Ingresso de outro setor', INVALID_TICKET_QR: 'QR inválido',
  TICKET_QR_EXPIRED: 'QR expirado', TICKET_QR_USED: 'QR já utilizado ou invalidado', TICKET_NOT_FOUND: 'Ingresso não encontrado',
  TICKET_PAYMENT_NOT_CONFIRMED: 'Pagamento não confirmado', HOLDER_DISABLED: 'Titular desativado', SALE_DELETED: 'Venda excluída',
  GATE_DISABLED: 'Portaria desativada', GATE_NOT_OPEN: 'Portaria ainda não abriu', GATE_CLOSED: 'Portaria encerrada',
  TICKET_ALREADY_USED: 'Ingresso já utilizado', INVALID_ADMISSION_QUANTITY: 'Quantidade inválida', GATE_ASSIGNMENT_REQUIRED: 'Funcionário sem escala para o setor',
  GATE_CODE_NOT_FOUND: 'Código não encontrado', GATE_SCOPE_DENIED: 'Funcionário sem acesso à partida ou setor',
  INVALID_TICKET: 'Ingresso não emitido, cancelado ou utilizado', ADMISSION_KEY_CONFLICT: 'Operação já usada para outra leitura',
};
export function AdminGateHistory({ matches, refreshKey }: { matches: Match[]; refreshKey: number }) {
  const { colors } = useTheme(), { token } = useSession();
  const [kind, setKind] = useState('ALLOW'), [draft, setDraft] = useState<Filters>({}), [filters, setFilters] = useState<Filters>({ limit: '25', offset: '0' }), [error, setError] = useState('');
  const [operators, setOperators] = useState<GateOperator[]>([]), [operatorError, setOperatorError] = useState('');
  useEffect(() => {
    let active = true;
    if (token) void adminApi.gateOperators(token).then((rows) => { if (active) { setOperators(rows); setOperatorError(''); } }).catch((err) => { if (active) setOperatorError(messageOf(err)); });
    return () => { active = false; };
  }, [token, refreshKey]);
  function apply() { try { const applied = appliedFilters(draft); if (kind === 'DENIED') delete applied.search; setFilters(applied); setError(''); } catch (err) { setError(messageOf(err)); } }
  return <View style={{ gap: 18 }}>
    <Panel style={{ padding: 18, borderRadius: 10, gap: 14 }}><Text heading style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Histórico de portaria</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><AdminAction primary={kind === 'ALLOW'} label="Entradas confirmadas" onPress={() => { setKind('ALLOW'); setFilters({ limit: '25', offset: '0' }); setDraft({}); setError(''); }} /><AdminAction primary={kind === 'DENIED'} label="Tentativas recusadas" onPress={() => { setKind('DENIED'); setFilters({ limit: '25', offset: '0' }); setDraft({}); setError(''); }} /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><LocationFilters matches={matches} draft={draft} setDraft={setDraft} />
        <ReportSelect label="Funcionário responsável" value={draft.actorId || ''} options={[{ value: '', label: 'Todos os funcionários' }, ...operators.map((operator) => ({ value: operator.id, label: `${operator.name} · ${operator.email}${operator.active ? '' : ' · desativado'}` }))]} onChange={(actorId) => setDraft({ ...draft, actorId })} />
        <ReportInput label="Protocolo completo" value={draft.protocol || ''} placeholder="ID registrado na operação" onChange={(protocol) => setDraft({ ...draft, protocol })} />
        {kind === 'ALLOW' && <ReportInput label="Titular ou pedido" value={draft.search || ''} placeholder="Nome, e-mail ou ID completo" onChange={(search) => setDraft({ ...draft, search })} />}
        <PeriodFilters draft={draft} setDraft={setDraft} />
      </View><Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 18 }}>Horários de Patos (UTC−3). Entradas contam pessoas; uma operação pode liberar mais de um ingresso. Uma recusa pode ocorrer na consulta ou na tentativa de liberar.</Text><View style={{ flexDirection: 'row', gap: 8 }}><AdminAction primary label="Aplicar filtros" onPress={apply} /><AdminAction label="Limpar" onPress={() => { setDraft({}); setFilters({ limit: '25', offset: '0' }); setError(''); }} /></View><ReportError error={error || operatorError} /></Panel>
    {kind === 'ALLOW' ? <ConfirmedEntries matches={matches} filters={filters} onFilters={setFilters} refreshKey={refreshKey} /> : <DeniedEntries filters={filters} onFilters={setFilters} refreshKey={refreshKey} />}
  </View>;
}
function ConfirmedEntries({ filters, onFilters, refreshKey }: { matches: Match[]; filters: Filters; onFilters: (filters: Filters) => void; refreshKey: number }) {
  const { colors } = useTheme(), desktop = useDesktopAdmin(), { token } = useSession();
  const { data, loading, error } = useAdminReport(adminApi.admissionHistory, filters, refreshKey);
  const [detail, setDetail] = useState<AdminAdmission | null>(null), [detailError, setDetailError] = useState(''), [opening, setOpening] = useState(false);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  async function open(protocol: string) {
    if (!token) return;
    const current = ++sequence.current; setOpening(true); setDetailError('');
    try { const receipt = await adminApi.admissionProtocol(token, protocol); if (sequence.current === current) setDetail(receipt); }
    catch (err) { if (sequence.current === current) setDetailError(messageOf(err)); }
    finally { if (sequence.current === current) setOpening(false); }
  }
  const protocolCell = (row: AdminAdmission) => <View style={{ gap: 6 }}><Text selectable style={{ color: colors.subtle, fontSize: 9 }}>{row.protocol}</Text><AdminAction label="Ver protocolo" disabled={opening} onPress={() => void open(row.protocol)} /></View>;
  return <View style={{ gap: 16 }}><ReportError error={error || detailError} /><ReportMetrics items={[{ label: 'Operações confirmadas', value: data?.summary.operations.toLocaleString('pt-BR') ?? '—' }, { label: 'Pessoas admitidas', value: data?.summary.admittedQuantity.toLocaleString('pt-BR') ?? '—', hint: 'Total de todos os resultados filtrados' }]} /><ReportPager pagination={data?.pagination} loading={loading} onOffset={(offset) => onFilters({ ...filters, offset: String(offset) })} />
    {desktop ? <AdminTable minWidth={870} loading={loading} columns={[{ label: 'Titular', flex: 1.2 }, { label: 'Partida / setor', flex: 1.2 }, { label: 'Funcionário' }, { label: 'Entrada', width: 145 }, { label: 'Protocolo', width: 190 }]} rows={(data?.items || []).map((row) => ({ id: row.protocol, cells: [<View style={{ gap: 4 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{row.ticket.user.name}</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{row.ticket.user.email}</Text>{row.ticket.deletedAt && <AdminBadge label="Venda excluída depois" tone="warning" />}</View>, <View style={{ gap: 4 }}><Text style={{ color: colors.text, fontSize: 12 }}>{row.ticket.match.homeTeam} × {row.ticket.match.awayTeam}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{row.ticket.sector.name}</Text></View>, <View style={{ gap: 4 }}><Text style={{ color: colors.text, fontSize: 12 }}>{row.actor.name}</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>{row.actor.email}</Text></View>, <View style={{ gap: 5 }}><Text style={{ color: colors.text, fontSize: 12 }}>{row.quantity} pessoa(s)</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{at(row.createdAt)}</Text></View>, protocolCell(row)] }))} empty={error ? 'Falha ao consultar o histórico.' : 'Nenhuma entrada corresponde aos filtros.'} /> : <View style={{ gap: 12 }}>{loading && <Text style={{ color: colors.muted }}>Carregando entradas…</Text>}{data?.items.map((row) => <Panel key={row.protocol} style={{ padding: 18, gap: 9 }}><AdminBadge label={`${row.quantity} pessoa(s) · entrada confirmada`} tone="success" /><Text style={{ color: colors.text, fontWeight: '600' }}>{row.ticket.user.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{row.ticket.match.homeTeam} × {row.ticket.match.awayTeam} · {row.ticket.sector.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{row.actor.name} · {at(row.createdAt)}</Text>{row.ticket.deletedAt && <AdminBadge label="Venda excluída depois" tone="warning" />}{protocolCell(row)}</Panel>)}{data && !data.items.length && <Text style={{ color: colors.muted }}>Nenhuma entrada corresponde aos filtros.</Text>}</View>}
    <ReportPager pagination={data?.pagination} loading={loading} onOffset={(offset) => onFilters({ ...filters, offset: String(offset) })} />
    {detail && <Sheet visible title="Protocolo de entrada" onClose={() => setDetail(null)}><AdminBadge label="Entrada confirmada no servidor" tone="success" /><Text selectable style={{ color: colors.text, fontSize: 14 }}>{detail.protocol}</Text><Text style={{ color: colors.text }}>{detail.ticket.user.name}</Text><Text style={{ color: colors.muted }}>{detail.ticket.user.email}</Text><Text style={{ color: colors.text }}>{detail.ticket.match.homeTeam} × {detail.ticket.match.awayTeam}</Text><Text style={{ color: colors.muted }}>{detail.ticket.match.stadium} · {detail.ticket.sector.name}</Text><Text style={{ color: colors.text }}>{detail.quantity} pessoa(s) admitida(s) em {at(detail.createdAt)}</Text><Text style={{ color: colors.muted }}>Responsável: {detail.actor.name} · {detail.actor.email}</Text><Text selectable style={{ color: colors.subtle, fontSize: 11 }}>Pedido: {detail.ticket.id}</Text>{detail.ticket.deletedAt && <Text style={{ color: colors.gold }}>Venda excluída em {at(detail.ticket.deletedAt)}. Esta entrada permanece registrada.</Text>}<Text style={{ color: colors.subtle, fontSize: 12 }}>Este documento consulta uma entrada já realizada.</Text></Sheet>}
  </View>;
}
function DeniedEntries({ filters, onFilters, refreshKey }: { filters: Filters; onFilters: (filters: Filters) => void; refreshKey: number }) {
  const { colors } = useTheme(), desktop = useDesktopAdmin();
  const { data, loading, error } = useAdminReport(adminApi.denialHistory, filters, refreshKey);
  const [detail, setDetail] = useState<GateDenial | null>(null);
  const reason = (row: GateDenial) => reasonLabels[row.reason] || row.reason;
  return <View style={{ gap: 16 }}><ReportError error={error} /><ReportMetrics items={[{ label: 'Tentativas recusadas', value: data?.pagination.total.toLocaleString('pt-BR') ?? '—', hint: 'Nenhuma dessas tentativas liberou entrada' }]} /><Text style={{ color: colors.subtle, fontSize: 11 }}>Registros antigos podem não informar setor ou etapa da operação.</Text><ReportPager pagination={data?.pagination} loading={loading} onOffset={(offset) => onFilters({ ...filters, offset: String(offset) })} />
    {desktop ? <AdminTable minWidth={800} loading={loading} columns={[{ label: 'Motivo', flex: 1.2 }, { label: 'Partida / setor', flex: 1.2 }, { label: 'Funcionário' }, { label: 'Horário', width: 145 }, { label: 'Protocolo', width: 180 }]} rows={(data?.items || []).map((row) => ({ id: row.protocol, cells: [<View style={{ gap: 5 }}><AdminBadge label="Recusada" tone="danger" /><Text style={{ color: colors.text, fontSize: 12 }}>{reason(row)}</Text></View>, <View style={{ gap: 4 }}><Text style={{ color: colors.text, fontSize: 12 }}>{row.match ? `${row.match.homeTeam} × ${row.match.awayTeam}` : 'Partida indisponível'}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{row.sector?.name || 'Setor não registrado'}</Text></View>, <Text style={{ color: colors.text, fontSize: 12 }}>{row.actor.name}</Text>, <Text style={{ color: colors.muted, fontSize: 11 }}>{at(row.createdAt)}</Text>, <View style={{ gap: 6 }}><Text selectable style={{ color: colors.subtle, fontSize: 9 }}>{row.protocol}</Text><AdminAction label="Ver protocolo" onPress={() => setDetail(row)} /></View>] }))} empty={error ? 'Falha ao consultar as recusas.' : 'Nenhuma recusa corresponde aos filtros.'} /> : <View style={{ gap: 12 }}>{loading && <Text style={{ color: colors.muted }}>Carregando recusas…</Text>}{data?.items.map((row) => <Panel key={row.protocol} style={{ padding: 18, gap: 9 }}><AdminBadge label="Tentativa recusada" tone="danger" /><Text style={{ color: colors.text }}>{reason(row)}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{row.match ? `${row.match.homeTeam} × ${row.match.awayTeam}` : 'Partida indisponível'} · {row.sector?.name || 'Sem setor registrado'}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{row.actor.name} · {at(row.createdAt)}</Text><AdminAction label="Ver protocolo" onPress={() => setDetail(row)} /></Panel>)}{data && !data.items.length && <Text style={{ color: colors.muted }}>Nenhuma recusa corresponde aos filtros.</Text>}</View>}
    <ReportPager pagination={data?.pagination} loading={loading} onOffset={(offset) => onFilters({ ...filters, offset: String(offset) })} />
    {detail && <Sheet visible title="Protocolo de recusa" onClose={() => setDetail(null)}><AdminBadge label="Entrada não autorizada" tone="danger" /><Text selectable style={{ color: colors.text }}>{detail.protocol}</Text><Text style={{ color: colors.text }}>{reason(detail)}</Text><Text selectable style={{ color: colors.subtle, fontSize: 11 }}>{detail.reason}</Text><Text style={{ color: colors.muted }}>{detail.match ? `${detail.match.homeTeam} × ${detail.match.awayTeam}` : 'Partida indisponível'} · {detail.sector?.name || 'Setor não registrado'}</Text><Text style={{ color: colors.muted }}>Responsável: {detail.actor.name}</Text><Text style={{ color: colors.muted }}>{at(detail.createdAt)} · {detail.stage === 'INSPECT' ? 'Consulta do ingresso' : detail.stage === 'ADMIT' ? 'Tentativa de liberar entrada' : 'Etapa não registrada'}</Text></Sheet>}
  </View>;
}
