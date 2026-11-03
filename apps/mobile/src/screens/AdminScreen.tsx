import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { ChevronLeft, ShieldCheck, ScanLine } from 'lucide-react-native';
import type { Match, Sector, Member, ClubPlan, AdminOverview, AdminTicket, AuditEvent, Ticket } from '@nacional/shared/types';
import { Page, Title, Panel, Button } from '../components/ui';
import { Text, TextInput } from '../components/Typography';
import { Sheet } from '../components/Sheet';
import { MatchForm, SectorForm, PlanForm, AdminField, AdminToggle } from '../components/AdminForms';
import { EmployeePanel } from '../components/EmployeePanel';
import { TicketGatePanel } from '../components/TicketGatePanel';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { adminApi } from '../services/admin';
import { money, matchDate, messageOf } from '../utils/format';
import { formDate, parseClubDate } from '../utils/admin';
import { parseAmount, requestKey } from '../utils/payments';
const ticketStatus = { PENDING: 'Aguardando pagamento', ISSUED: 'Emitido', USED: 'Utilizado', CANCELED: 'Cancelado', EXPIRED: 'Expirado' };
export function AdminScreen({ onBack }: { onBack: () => void }) {
  const { token, member, signOut } = useSession();
  const { colors } = useTheme();
  const [tab, setTab] = useState('Jogos');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [users, setUsers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<ClubPlan[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState('');
  const [matchEdit, setMatchEdit] = useState<Match | null | undefined>();
  const [sectorEdit, setSectorEdit] = useState<{ match: Match; sector: Sector | null } | null>(null);
  const [planEdit, setPlanEdit] = useState<ClubPlan | null | undefined>();
  const [payment, setPayment] = useState<AdminTicket | null>(null);
  const [reference, setReference] = useState('');
  const [received, setReceived] = useState('');
  const [verified, setVerified] = useState(false);
  const [associate, setAssociate] = useState<Member | null>(null);
  const [planId, setPlanId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [membershipStatus, setMembershipStatus] = useState<'ACTIVE' | 'PENDING' | 'EXPIRED'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  const lock = useRef(false);
  async function refresh() {
    if (!token || member?.role !== 'ADMIN') return;
    const current = ++revision.current;
    setLoading(true);
    try {
      const fresh = await Promise.all([adminApi.overview(token), adminApi.matches(token), adminApi.tickets(token), adminApi.users(token, search), adminApi.plans(token), adminApi.audit(token)]);
      if (current !== revision.current) return;
      setOverview(fresh[0]); setMatches(fresh[1]); setTickets(fresh[2]); setUsers(fresh[3]); setPlans(fresh[4]); setAudit(fresh[5]);
    } catch (err) { if (current === revision.current) setError(messageOf(err)); }
    finally { if (current === revision.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); return () => { revision.current++; }; }, [token]);
  async function perform(work: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); await refresh(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); lock.current = false; }
  }
  if (member?.role !== 'ADMIN') return <Page><Text style={{ color: colors.danger }}>Acesso administrativo necessário.</Text></Page>;
  return <Page refreshing={loading} onRefresh={() => void refresh()}>
    <Pressable onPress={onBack} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }}><ChevronLeft size={20} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14 }}>Voltar ao app</Text></Pressable>
    <Title title="Administração" subtitle={`Olá, ${member.name}. Gerencie o clube.`} action={<ShieldCheck size={26} color={colors.primary} />} />
    {overview && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{[{ title: 'Contas', value: overview.users }, { title: 'Jogos', value: overview.matches }, { title: 'Ingressos emitidos', value: overview.issuedTickets }, { title: 'Reservas abertas', value: overview.pendingReservations }].map((item) => <Panel key={item.title} style={{ width: '47%', padding: 16, gap: 7 }}><Text style={{ color: colors.muted, fontSize: 12 }}>{item.title}</Text><Text heading style={{ color: colors.text, fontSize: 26, lineHeight: 34, fontWeight: '800' }}>{item.value}</Text></Panel>)}</View>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{['Jogos', 'Vendas', 'Torcedores', 'Planos', 'Funcionários', 'Portaria', 'Auditoria'].map((name) => <Pressable key={name} onPress={() => { setTab(name); setError(''); }} style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: tab === name ? colors.primarySoft : colors.soft, borderWidth: 1, borderColor: tab === name ? colors.primary : colors.border }}><Text style={{ color: tab === name ? colors.primary : colors.muted, fontSize: 14 }}>{name}</Text></Pressable>)}</ScrollView>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}{!!notice && <Text accessibilityRole="alert" style={{ color: colors.primary }}>{notice}</Text>}
    {tab === 'Jogos' && <><Button label="Cadastrar jogo" onPress={() => setMatchEdit(null)} />{matches.map((match) => <Panel key={match.id} style={{ gap: 14 }}><Text heading style={{ color: colors.text, fontWeight: '700', fontSize: 20 }}>{match.homeTeam} × {match.awayTeam}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{matchDate(match.startsAt)} · {match.stadium}</Text><Text style={{ color: match.published ? colors.primary : colors.gold }}>{match.published ? 'Publicado' : 'Rascunho'} · {match.salesEnabled ? 'Vendas habilitadas' : 'Vendas pausadas'}</Text><Button secondary label="Editar jogo e datas" onPress={() => setMatchEdit(match)} />
      {match.sectors.map((sector) => <Pressable key={sector.id} onPress={() => setSectorEdit({ match, sector })} style={{ padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, gap: 6 }}><Text style={{ color: colors.text }}>{sector.name} · {money(sector.priceCents)}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{sector.available ?? 0} de {sector.capacity} disponíveis · {sector.salesEnabled ? 'Aberto' : 'Pausado'}</Text></Pressable>)}<Button secondary label="Adicionar setor e quantidade" onPress={() => setSectorEdit({ match, sector: null })} /><Button label={match.published ? 'Retirar publicação' : 'Publicar no app'} loading={busy} onPress={() => void perform(() => adminApi.updateMatch(token!, { id: match.id, published: !match.published }))} /><Button secondary label={match.salesEnabled ? 'Pausar vendas' : 'Reabrir vendas'} disabled={busy} onPress={() => void perform(() => adminApi.updateMatch(token!, { id: match.id, salesEnabled: !match.salesEnabled }))} /><Button secondary label={match.entryEnabled ? 'Desativar portaria' : 'Habilitar portaria'} disabled={busy} onPress={() => void perform(() => adminApi.updateMatch(token!, { id: match.id, entryEnabled: !match.entryEnabled }))} /></Panel>)}{!matches.length && !loading && <Text style={{ color: colors.muted }}>Cadastre o primeiro jogo, depois seus setores e publique.</Text>}</>}
    {tab === 'Vendas' && <>{tickets.map((ticket) => <Panel key={ticket.id} style={{ gap: 10 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{ticket.user.name}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{ticket.user.email}</Text><Text style={{ color: colors.text }}>{ticket.match.homeTeam} × {ticket.match.awayTeam}</Text><Text style={{ color: colors.muted }}>{ticket.quantity} × {ticket.sector.name} · {money(ticket.priceCents)}</Text><Text style={{ color: ticket.status === 'ISSUED' ? colors.primary : colors.gold }}>{ticketStatus[ticket.status]}</Text><Text selectable style={{ color: colors.muted, fontSize: 12 }}>Reserva: {ticket.id}</Text>{ticket.status === 'PENDING' && <><Button label="Conferir pagamento e emitir" disabled={busy} onPress={() => { setPayment(ticket); setReference(''); setVerified(false); setReceived((ticket.priceCents / 100).toFixed(2).replace('.', ',')); }} /><Button secondary label="Cancelar reserva sem pagamento" disabled={busy} onPress={() => void perform(() => adminApi.cancel(token!, ticket.id))} /></>}</Panel>)}{!tickets.length && <Text style={{ color: colors.muted }}>Nenhuma compra ou reserva registrada.</Text>}</>}
    {tab === 'Torcedores' && <><AdminField label="Buscar por nome ou e-mail" value={search} onChange={setSearch} /><Button secondary label="Buscar contas" loading={loading} onPress={() => void refresh()} />{users.map((user) => <Panel key={user.id} style={{ gap: 10 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{user.name}</Text><Text style={{ color: colors.muted }}>{user.email}</Text><Text style={{ color: user.active ? colors.primary : colors.danger }}>{user.role === 'ADMIN' ? 'Administrador' : user.role === 'GATE' ? 'Portaria' : 'Torcedor'} · {user.active ? 'Conta ativa' : 'Desativada'}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{user.membership ? `${user.membership.plan.name} · ${user.membership.status}` : 'Sem associação'}</Text><Button secondary label="Gerenciar associação" onPress={() => { setAssociate(user); setPlanId(plans.find((p) => p.name === user.membership?.plan.name)?.id || plans[0]?.id || ''); setMembershipStatus(user.membership?.status || 'ACTIVE'); setValidUntil(user.membership ? formDate(user.membership.validUntil) : ''); }} />{user.id !== member.id && <Button secondary label={user.active ? 'Desativar conta e revogar sessões' : 'Reativar conta'} disabled={busy} onPress={() => void perform(() => adminApi.account(token!, user.id, !user.active))} />}</Panel>)}</>}
    {tab === 'Planos' && <><Button label="Criar plano" onPress={() => setPlanEdit(null)} />{plans.map((plan) => <Panel key={plan.id} style={{ gap: 10 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{plan.name}</Text><Text style={{ color: colors.gold }}>{money(plan.priceCents)} / mês</Text><Text style={{ color: colors.muted }}>Desconto em ingressos: {plan.discountPercent}%</Text><Button secondary label="Editar plano" onPress={() => setPlanEdit(plan)} /></Panel>)}</>}
    {tab === 'Funcionários' && <EmployeePanel matches={matches} />}
    {tab === 'Portaria' && <TicketGatePanel matches={matches} onChanged={refresh} />}
    {tab === 'Auditoria' && <>{audit.map((event) => <Panel key={event.id} style={{ gap: 7 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{event.action}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{event.actor.name} · {new Date(event.createdAt).toLocaleString('pt-BR')}</Text><Text selectable style={{ color: colors.muted, fontSize: 12 }}>{event.entityId}</Text></Panel>)}{!audit.length && <Text style={{ color: colors.muted }}>As operações administrativas aparecerão aqui.</Text>}</>}
    <Button secondary label="Sair da conta administrativa" disabled={busy} onPress={() => void perform(signOut)} />
    {matchEdit !== undefined && <MatchForm match={matchEdit} onClose={() => setMatchEdit(undefined)} onSaved={async () => { setMatchEdit(undefined); await refresh(); }} />}
    {sectorEdit && <SectorForm {...sectorEdit} onClose={() => setSectorEdit(null)} onSaved={async () => { setSectorEdit(null); await refresh(); }} />}
    {planEdit !== undefined && <PlanForm plan={planEdit} onClose={() => setPlanEdit(undefined)} onSaved={async () => { setPlanEdit(undefined); await refresh(); }} />}
    {payment && <Sheet visible title="Confirmar recebimento" onClose={busy ? () => {} : () => setPayment(null)}><Text style={{ color: colors.text }}>{payment.user.name} · {money(payment.priceCents)}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Confirme somente depois de conferir o recebimento na conta ou no caixa do clube. Isso emite o ingresso e registra seu nome na auditoria.</Text><AdminField label="Valor realmente recebido · R$" value={received} onChange={setReceived} numeric /><AdminField label="Referência única do recibo ou transação" value={reference} onChange={setReference} /><AdminToggle label="Conferi o recebimento deste pagamento" value={verified} onChange={setVerified} />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}<Button label="Confirmar pagamento e emitir ingresso" loading={busy} disabled={!verified} onPress={() => void perform(async () => { await adminApi.confirm(token!, payment.id, parseAmount(received, true), reference.trim()); setPayment(null); setNotice('Pagamento registrado e ingresso emitido.'); })} /></Sheet>}
    {associate && <Sheet visible title={`Associação · ${associate.name}`} onClose={busy ? () => {} : () => setAssociate(null)}>{plans.map((plan) => <Button key={plan.id} secondary={planId !== plan.id} label={`${plan.name} · ${money(plan.priceCents)}`} onPress={() => setPlanId(plan.id)} />)}<AdminField label="Validade · AAAA-MM-DD HH:mm (Patos)" value={validUntil} onChange={setValidUntil} />{(['ACTIVE', 'PENDING', 'EXPIRED'] as const).map((status) => <Button key={status} secondary={membershipStatus !== status} label={{ ACTIVE: 'Ativa', PENDING: 'Pendente', EXPIRED: 'Expirada' }[status]} onPress={() => setMembershipStatus(status)} />)}{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}<Button label="Salvar associação" loading={busy} disabled={!planId} onPress={() => void perform(async () => { await adminApi.membership(token!, { userId: associate.id, planId, status: membershipStatus, validUntil: parseClubDate(validUntil) }); setAssociate(null); })} /></Sheet>}
  </Page>;
}
