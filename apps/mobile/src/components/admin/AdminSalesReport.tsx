import React, { useState } from 'react';
import { View } from 'react-native';
import { Pencil, Trash2 } from 'lucide-react-native';
import type { AdminTicket, Match } from '@nacional/shared/types';
import { Text } from '../Typography';
import { Panel } from '../ui';
import { AdminMenu, AdminFilterPanel } from './AdminControls';
import { useTheme } from '../../theme/ThemeProvider';
import { money, messageOf } from '../../utils/format';
import { adminApi } from '../../services/admin';
import { AdminAction, AdminBadge, AdminTable, useDesktopAdmin } from './AdminLayout';
import { Filters, useAdminReport, ReportInput, ReportSelect, LocationFilters, PeriodFilters, appliedFilters, ReportError, ReportPager, ReportMetrics } from './AdminReportControls';

const statuses = { PENDING: 'Aguardando pagamento', ISSUED: 'Emitido', USED: 'Utilizado', CANCELED: 'Cancelado', EXPIRED: 'Expirado' };
const initial = { deleted: 'all', limit: '25', offset: '0' };
export function AdminSalesReport({ matches, refreshKey, busy, onPayment, onCancel, onEdit, onDelete }: { matches: Match[]; refreshKey: number; busy: boolean; onPayment: (ticket: AdminTicket) => void; onCancel: (ticket: AdminTicket) => void; onEdit: (ticket: AdminTicket) => void; onDelete: (ticket: AdminTicket) => void }) {
  const { colors } = useTheme(), desktop = useDesktopAdmin();
  const [draft, setDraft] = useState<Filters>({ deleted: 'all' }), [filters, setFilters] = useState<Filters>(initial), [validation, setValidation] = useState('');
  const { data, loading, error } = useAdminReport(adminApi.salesReport, filters, refreshKey);
  const summary = data?.summary, inventory = data?.inventory;
  function apply() { try { setFilters(appliedFilters(draft)); setValidation(''); } catch (err) { setValidation(messageOf(err)); } }
  const actions = (ticket: AdminTicket) => {
    if (ticket.deletedAt) return <Text style={{ color: colors.subtle, fontSize: 11 }}>Excluída · pagamento e entradas preservados.</Text>;
    const unpaid = !ticket.payment && !ticket.usedQuantity;
    return <AdminMenu disabled={busy || loading} items={[
      ...(unpaid && ticket.status === 'PENDING' ? [{ label: 'Conferir recebimento', onPress: () => onPayment(ticket) }] : []),
      ...(['PENDING', 'ISSUED', 'USED'].includes(ticket.status) ? [{ label: 'Editar venda', onPress: () => onEdit(ticket) }] : []),
      ...(unpaid && ticket.status === 'PENDING' ? [{ label: 'Cancelar reserva', onPress: () => onCancel(ticket) }] : []),
      { label: 'Excluir venda', onPress: () => onDelete(ticket), danger: true },
    ]} />;
  };
  const badge = (ticket: AdminTicket) => <AdminBadge label={ticket.deletedAt ? 'Excluída' : statuses[ticket.status]} tone={ticket.deletedAt ? 'danger' : ticket.status === 'PENDING' ? 'warning' : ticket.payment ? 'success' : 'neutral'} />;
  return <View style={{ gap: 18 }}>
    <AdminFilterPanel title="Filtros de vendas"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <LocationFilters matches={matches} draft={draft} setDraft={setDraft} />
      <ReportInput label="Comprador ou pedido" value={draft.search || ''} placeholder="Nome, e-mail ou ID completo" onChange={(search) => setDraft({ ...draft, search })} />
      <ReportSelect label="Situação do ingresso" value={draft.status || ''} options={[{ value: '', label: 'Todas as situações' }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} onChange={(status) => setDraft({ ...draft, status })} />
      <ReportSelect label="Pagamento" value={draft.payment || ''} options={[{ value: '', label: 'Todos os pagamentos' }, { value: 'PAID', label: 'Recebimento confirmado' }, { value: 'FREE', label: 'Cortesias' }, { value: 'UNPAID', label: 'Sem recebimento' }]} onChange={(payment) => setDraft({ ...draft, payment })} />
      <ReportSelect label="Exclusão" value={draft.deleted || 'all'} options={[{ value: 'all', label: 'Ativas e excluídas' }, { value: 'exclude', label: 'Somente ativas' }, { value: 'only', label: 'Somente excluídas' }]} onChange={(deleted) => setDraft({ ...draft, deleted })} />
      <PeriodFilters draft={draft} setDraft={setDraft} />
    </View><Text style={{ color: colors.subtle, fontSize: 11 }}>O período considera a criação do pedido. Totais consideram todos os resultados da consulta.</Text><View style={{ flexDirection: 'row', gap: 8 }}><AdminAction primary label={loading ? 'Consultando…' : 'Aplicar filtros'} disabled={loading} onPress={apply} /><AdminAction label="Limpar" disabled={loading} onPress={() => { setDraft({ deleted: 'all' }); setFilters(initial); setValidation(''); }} /></View><ReportError error={validation || error} /></AdminFilterPanel>
    <ReportMetrics items={[
      { label: 'Pedidos na consulta', value: summary?.orders.toLocaleString('pt-BR') ?? '—' },
      { label: 'Ingressos vendidos', value: summary ? (summary.soldQuantity - summary.freeQuantity).toLocaleString('pt-BR') : '—', hint: `Além de ${summary?.freeQuantity ?? '—'} cortesias ativas` },
      { label: 'Ingressos reservados', value: summary?.reservedQuantity.toLocaleString('pt-BR') ?? '—', hint: 'Reservas que ainda não expiraram' },
      { label: 'Receita confirmada', value: summary ? money(summary.confirmedRevenueCents) : '—', hint: summary ? `${money(summary.archivedRevenueCents)} em vendas excluídas neste recorte` : undefined },
      { label: 'Estornos confirmados', value: summary ? money(summary.refundedRevenueCents) : '—', hint: summary ? `${money(summary.confirmedRevenueCents - summary.refundedRevenueCents)} recebidos após estornos (antes das tarifas)` : undefined },
    ]} />
    <Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 18 }}>Receita baseada nos recibos confirmados dos pedidos filtrados. Excluir uma venda não estorna seu recebimento.</Text>
    <Panel style={{ padding: 18, gap: 14, borderRadius: 10 }}><Text heading style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Disponibilidade {filters.matchId ? 'da partida' : 'de todas as partidas'}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{inventory ? `${inventory.available.toLocaleString('pt-BR')} livres · ${inventory.occupied.toLocaleString('pt-BR')} ocupados · ${inventory.capacity.toLocaleString('pt-BR')} de capacidade` : 'Consultando capacidade…'}</Text><Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 18 }}>Capacidade física por partida/setor, independente da busca, período e situação dos pedidos. Setores pausados podem ter vagas; a abertura de vendas é definida em Jogos.</Text>
      {!!inventory?.sectors.length && <AdminTable minWidth={650} columns={[{ label: 'Setor' }, { label: 'Confirmados', width: 100 }, { label: 'Reservados', width: 95 }, { label: 'Entradas', width: 80 }, { label: 'Livres / total', width: 110 }]} rows={inventory.sectors.map((sector) => ({ id: sector.id, cells: [<View style={{ gap: 5 }}><Text style={{ color: colors.text, fontSize: 12 }}>{sector.name}</Text><AdminBadge label={sector.salesEnabled ? 'Venda habilitada' : 'Venda pausada'} tone={sector.salesEnabled ? 'success' : 'warning'} /></View>, ...[sector.soldQuantity, sector.reservedQuantity, sector.usedQuantity, `${sector.available} / ${sector.capacity}`].map((value, index) => <Text key={index} style={{ color: colors.muted, fontSize: 12 }}>{value}</Text>)] }))} empty="Nenhum setor cadastrado." />}
      {!filters.matchId && <Text style={{ color: colors.subtle, fontSize: 11 }}>Selecione uma partida para conferir o detalhamento por setor.</Text>}
    </Panel>
    <ReportPager pagination={data?.pagination} loading={loading} onOffset={(offset) => setFilters({ ...filters, offset: String(offset) })} />
    {desktop ? <AdminTable loading={loading} columns={[{ label: 'Comprador', flex: 1.3 }, { label: 'Partida / setor', flex: 1.3 }, { label: 'Total', width: 95 }, { label: 'Situação', width: 135 }, { label: 'Ações', width: 90 }]} rows={(data?.items || []).map((ticket) => ({ id: ticket.id, cells: [<View style={{ gap: 4 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{ticket.user.name}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{ticket.user.email}</Text><Text selectable style={{ color: colors.subtle, fontSize: 9 }}>{ticket.id}</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>{new Date(ticket.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</Text></View>, <View style={{ gap: 5 }}><Text style={{ color: colors.text, fontSize: 12 }}>{ticket.match.homeTeam} × {ticket.match.awayTeam}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{ticket.quantity} × {ticket.sector.name}</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>{ticket.usedQuantity || 0} entrada(s)</Text></View>, <View style={{ gap: 5 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{money(ticket.priceCents)}</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>{ticket.payment?.method === 'FREE' ? 'Cortesia' : ticket.payment ? 'Recebido' : 'Não recebido'}</Text></View>, badge(ticket), actions(ticket)] }))} empty={error ? 'A consulta falhou. Atualize para tentar novamente.' : 'Nenhuma venda corresponde aos filtros.'} /> : <View style={{ gap: 12 }}>{loading && <Text style={{ color: colors.muted }}>Carregando vendas…</Text>}{data?.items.map((ticket) => <Panel key={ticket.id} style={{ padding: 18, gap: 10 }}><Text style={{ color: colors.text, fontWeight: '600' }}>{ticket.user.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.user.email}</Text><Text style={{ color: colors.text, fontSize: 13 }}>{ticket.match.homeTeam} × {ticket.match.awayTeam}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.quantity} × {ticket.sector.name} · {money(ticket.priceCents)}</Text>{badge(ticket)}{actions(ticket)}<Text selectable style={{ color: colors.subtle, fontSize: 10 }}>{ticket.id}</Text></Panel>)}{data && !data.items.length && <Text style={{ color: colors.muted }}>Nenhuma venda corresponde aos filtros.</Text>}</View>}
    <ReportPager pagination={data?.pagination} loading={loading} onOffset={(offset) => setFilters({ ...filters, offset: String(offset) })} />
  </View>;
}
