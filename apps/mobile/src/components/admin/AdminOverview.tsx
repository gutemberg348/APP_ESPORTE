import React from 'react';
import { View } from 'react-native';
import { CalendarDays, ArrowUpRight, Plus } from 'lucide-react-native';
import type { AdminOverview as Overview, AdminTicket, Match, AuditEvent } from '@nacional/shared/types';
import { Text } from '../Typography';
import { Panel } from '../ui';
import { ReportMetrics } from './AdminReportControls';
import { AdminAction, AdminBadge, AdminTable, useDesktopAdmin } from './AdminLayout';
import { useTheme } from '../../theme/ThemeProvider';
import { money, matchDate } from '../../utils/format';

export function AdminStats({ overview }: { overview: Overview | null }) {
  return <ReportMetrics items={[
    { label: 'Contas cadastradas', value: overview?.users.toLocaleString('pt-BR') ?? '—', hint: 'Base de torcedores e equipe' },
    { label: 'Partidas', value: overview?.matches.toLocaleString('pt-BR') ?? '—', hint: 'Publicadas e rascunhos' },
    { label: 'Ingressos emitidos', value: overview?.issuedTickets.toLocaleString('pt-BR') ?? '—', hint: 'Confirmados e utilizados' },
    { label: 'Reservas abertas', value: overview?.pendingReservations.toLocaleString('pt-BR') ?? '—', hint: 'Aguardando pagamento' },
  ]} />;
}

export function AdminOverviewPanel({ matches, tickets, audit, loading, onSelect, onCreate }: { matches: Match[]; tickets: AdminTicket[]; audit: AuditEvent[]; loading: boolean; onSelect: (tab: string) => void; onCreate: () => void }) {
  const { colors } = useTheme();
  const desktop = useDesktopAdmin();
  const upcoming = matches.filter((match) => Date.parse(match.startsAt) > Date.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 5);
  const pending = tickets.filter((ticket) => ticket.status === 'PENDING' && (!ticket.expiresAt || Date.parse(ticket.expiresAt) > Date.now())).slice(0, 4);
  return <View style={{ gap: 22 }}>
    <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 20 }}>
      <Panel style={{ flex: desktop ? 1 : undefined, minWidth: 0, padding: desktop ? 23 : 16, borderRadius: 10, gap: 15 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text heading style={{ color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }}>Próximas partidas</Text><AdminAction label="Ver jogos" onPress={() => onSelect('Jogos')} icon={ArrowUpRight} /></View>
        {upcoming.map((match) => <View key={match.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderColor: colors.border }}><View style={{ width: 42, height: 46, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.soft, borderRadius: 10 }}><CalendarDays size={20} color={colors.primary} /></View><View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{match.homeTeam} × {match.awayTeam}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{matchDate(match.startsAt)}</Text></View><AdminBadge label={match.published ? 'Publicado' : 'Rascunho'} tone={match.published ? 'success' : 'warning'} /></View>)}
        {!upcoming.length && <View style={{ paddingVertical: 28, gap: 10 }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{loading ? 'Carregando a agenda…' : 'Vamos preparar o próximo jogo?'}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Cadastre a partida, organize os setores e publique para a torcida.</Text><View style={{ alignSelf: 'flex-start', marginTop: 7 }}><AdminAction primary label="Cadastrar partida" onPress={onCreate} icon={Plus} /></View></View>}
      </Panel>
      <Panel style={{ flex: desktop ? 0.8 : undefined, minWidth: 0, padding: desktop ? 23 : 16, borderRadius: 10, gap: 15 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text heading style={{ color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }}>Conferência de pagamentos</Text><AdminBadge label={`${pending.length} na lista`} tone={pending.length ? 'warning' : 'neutral'} /></View><Text style={{ color: colors.muted, fontSize: 12 }}>Consulte o recebimento antes de emitir o ingresso.</Text>
        {pending.map((ticket) => <View key={ticket.id} style={{ paddingVertical: 12, gap: 4, borderTopWidth: 1, borderColor: colors.border }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{ticket.user.name}</Text><Text style={{ color: colors.gold, fontSize: 13, fontWeight: '700' }}>{money(ticket.priceCents)}</Text></View><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{ticket.match.homeTeam} × {ticket.match.awayTeam} · {ticket.quantity} pessoa(s)</Text></View>)}
        {!pending.length && <Text style={{ color: colors.subtle, fontSize: 13, paddingVertical: 25 }}>{loading ? 'Consultando pedidos…' : 'Nenhuma reserva pendente na lista carregada.'}</Text>}
        <View style={{ alignSelf: 'flex-start' }}><AdminAction label="Abrir vendas" onPress={() => onSelect('Vendas')} icon={ArrowUpRight} /></View>
      </Panel>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text heading style={{ color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }}>Últimas atividades</Text><AdminAction label="Ver auditoria" onPress={() => onSelect('Auditoria')} icon={ArrowUpRight} /></View>
    <AdminTable minWidth={desktop ? 620 : 500} loading={loading} columns={[{ label: 'Operação', flex: 1.6 }, { label: 'Responsável' }, { label: 'Data e hora', width: 160 }]} rows={audit.slice(0, 5).map((event) => ({ id: event.id, cells: [<Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{event.action.replaceAll('_', ' ')}</Text>, <Text style={{ color: colors.muted, fontSize: 12 }}>{event.actor.name}</Text>, <Text style={{ color: colors.muted, fontSize: 11 }}>{new Date(event.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</Text>] }))} empty="As ações administrativas aparecerão aqui." />
  </View>;
}
