import { TicketCounterScreen } from './TicketCounterScreen';
import { MembershipCardCheck } from '../components/MembershipCardCheck';
import { SecurityScreen } from './SecurityScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdminSettingsPanel } from '../components/admin/AdminSettingsPanel';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Plus, ScanLine } from 'lucide-react-native';
import type { Match, Sector, Member, ClubPlan, AdminOverview, AdminTicket, AuditEvent } from '@nacional/shared/types';
import { Page, Panel, Button } from '../components/ui';
import { Text } from '../components/Typography';
import { Sheet } from '../components/Sheet';
import { MatchForm, SectorForm, PlanForm, AdminField, AdminToggle } from '../components/AdminForms';
import { AdminSelect, AdminDateTimeField, AdminNotice, AdminButton } from '../components/admin/AdminControls';
import { EmployeePanel } from '../components/EmployeePanel';
import { GateV1History } from '../components/GateV1History';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { adminApi } from '../services/admin';
import { money, messageOf } from '../utils/format';
import { formDate, parseClubDate } from '../utils/admin';
import { parseAmount } from '../utils/payments';
import { AdminLayout, AdminAction, useDesktopAdmin } from '../components/admin/AdminLayout';
import { AdminStats, AdminOverviewPanel } from '../components/admin/AdminOverview';
import { AdminMatchGrid, AdminAccountsPanel, AdminPlanGrid, AdminAuditPanel } from '../components/admin/AdminDataPanels';
import { AdminSalesReport } from '../components/admin/AdminSalesReport';
import { AdminGateHistory } from '../components/admin/AdminGateHistory';
import { AdminPaymentsPanel } from '../components/admin/AdminPaymentsPanel';
import { AdminThemeProvider } from '../theme/AdminThemeProvider';
import { AdminSaleForm } from '../components/admin/AdminSaleForm';
import { AdminShopPanel } from '../components/admin/shop/AdminShopPanel';
import { AdminFinancePanel, AdminPayoutAlert } from '../components/admin/AdminFinancePanel';
import { AdminWithdrawalsPanel } from '../components/admin/AdminWithdrawalsPanel';
import { AdminPartnersPanel } from '../components/admin/AdminPartnersPanel';
import { AdminEmailPanel } from '../components/admin/AdminEmailPanel';
import { AdminAccountForm } from '../components/admin/AdminAccountForm';
import { recoveryApi } from '../services/recovery';
import { EstadiosIngressoV1Panel } from '../components/admin/ingresso-v1/EstadiosIngressoV1Panel';
import { TemplatesSetorIngressoV1Panel } from '../components/admin/ingresso-v1/TemplatesSetorIngressoV1Panel';
import { TemplatesVendaIngressoV1Panel } from '../components/admin/ingresso-v1/TemplatesVendaIngressoV1Panel';
import { PartidasIngressoV1Panel } from '../components/admin/ingresso-v1/PartidasIngressoV1Panel';
import { IngressosEmitidosV1Panel } from '../components/admin/ingresso-v1/IngressosEmitidosV1Panel';
import { PortariaIngressoV1Panel } from '../components/admin/ingresso-v1/PortariaIngressoV1Panel';
const matchViews = ['Calendário', 'App do torcedor', 'Estádios', 'Templates de setores', 'Templates de venda'] as const;
const ticketViews = ['Todos os ingressos', 'Relatório do app'] as const;
type TicketView = typeof matchViews[number] | typeof ticketViews[number];

export function AdminScreen({ onBack }: { onBack?: () => void }) {
  return <AdminThemeProvider><AdminWorkspace onBack={onBack} /></AdminThemeProvider>;
}
function AdminWorkspace({ onBack }: { onBack?: () => void }) {
  const { token, member, signOut } = useSession();
  const { colors } = useTheme();
  const desktop = useDesktopAdmin();
  const owner = member?.role === 'OWNER';
  const [security, setSecurity] = useState(false);
  const [tab, setTab] = useState(owner ? 'Saques' : 'Visão geral');
  const [ticketView, setTicketView] = useState<TicketView>('Calendário');
  const sectionViews = tab === 'Partidas' ? matchViews : tab === 'Ingressos' ? ticketViews : [];
  const [legacyGateHistory, setLegacyGateHistory] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [users, setUsers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<ClubPlan[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState('');
  const [accountEdit, setAccountEdit] = useState<Member | null>(null);
  const [matchEdit, setMatchEdit] = useState<Match | null | undefined>();
  const [sectorEdit, setSectorEdit] = useState<{ match: Match; sector: Sector | null } | null>(null);
  const [planEdit, setPlanEdit] = useState<ClubPlan | null | undefined>();
  const [payment, setPayment] = useState<AdminTicket | null>(null);
  const [saleAction, setSaleAction] = useState<{ ticket: AdminTicket; mode: 'edit' | 'delete' | 'cancel' } | null>(null);
  const [reference, setReference] = useState('');
  const [received, setReceived] = useState('');
  const [gatewayFee, setGatewayFee] = useState('0,00');
  const [verified, setVerified] = useState(false);
  const [associate, setAssociate] = useState<Member | null>(null);
  const [planId, setPlanId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [membershipStatus, setMembershipStatus] = useState<'ACTIVE' | 'PENDING' | 'EXPIRED'>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportRefresh, setReportRefresh] = useState(0);
  const [estadioCreateOpen, setEstadioCreateOpen] = useState(false);
  const [templateCreateOpen, setTemplateCreateOpen] = useState(false);
  const [templateVendaCreateOpen, setTemplateVendaCreateOpen] = useState(false);
  const [partidaV1CreateOpen, setPartidaV1CreateOpen] = useState(false);
  const [ingressoV1CreateOpen, setIngressoV1CreateOpen] = useState(false);
  const [selectedPartidaV1Id, setSelectedPartidaV1Id] = useState<string | undefined>(undefined);
  const revision = useRef(0);
  const lock = useRef(false);
  async function refresh() {
    if (!token || (!owner && member?.role !== 'ADMIN')) return;
    const current = ++revision.current;
    setLoading(true); setError('');
    try {
      const fresh = await Promise.all([adminApi.overview(token), adminApi.matches(token), adminApi.tickets(token, { deleted: 'all' }), adminApi.users(token, search), adminApi.plans(token), adminApi.audit(token)]);
      if (current !== revision.current) return;
      setOverview(fresh[0]); setMatches(fresh[1]); setTickets(fresh[2]); setUsers(fresh[3]); setPlans(fresh[4]); setAudit(fresh[5]);
      setReportRefresh((value) => value + 1);
    } catch (err) { if (current === revision.current) setError(messageOf(err)); }
    finally { if (current === revision.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); return () => { revision.current++; }; }, [token]);
  async function perform(work: () => Promise<unknown>, refreshAfter = true) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); if (refreshAfter) await refresh(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); lock.current = false; }
  }
  if (!member || (!owner && member.role !== 'ADMIN')) return <Page><Text style={{ color: colors.danger }}>Acesso administrativo necessário.</Text></Page>;
  if (tab === 'Bilheteria' && !owner) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><TicketCounterScreen onBack={() => setTab('Ingressos')} /></SafeAreaView>;
  if (security) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><SecurityScreen onBack={() => setSecurity(false)} /></SafeAreaView>;
  function select(section: string, view?: TicketView) {
    setTicketView(view ?? (section === 'Ingressos' ? 'Todos os ingressos' : 'Calendário'));
    setSelectedPartidaV1Id(undefined);
    setTab(section);
    if (section === 'Visão geral') void refresh();
    setError('');
    setNotice('');
    setEstadioCreateOpen(false);
    setTemplateCreateOpen(false);
    setTemplateVendaCreateOpen(false);
    setPartidaV1CreateOpen(false);
    setIngressoV1CreateOpen(false);
  }
  function openGate(match: Match) {
    void perform(async () => {
      await adminApi.updateMatch(token!, { id: match.id, openGateNow: true });
      setNotice('Portaria aberta. O QR está disponível para os ingressos emitidos.');
    });
  }
  function openPayment(ticket: AdminTicket) { setPayment(ticket); setGatewayFee('0,00'); setReference(''); setVerified(false); setReceived((ticket.priceCents / 100).toFixed(2).replace('.', ',')); }
  function openMembership(user: Member) { setAssociate(user); setPlanId(plans.find((plan) => plan.name === user.membership?.plan.name)?.id || plans[0]?.id || ''); setMembershipStatus(user.membership?.status || 'ACTIVE'); setValidUntil(user.membership && Date.parse(user.membership.validUntil) > Date.now() ? formDate(user.membership.validUntil) : formDate(new Date(Date.now() + (plans[0]?.durationDays || 30) * 86400000).toISOString())); }
  function createPartida() {
    select('Partidas');
    setPartidaV1CreateOpen(true);
  }
  function issueTicket(partidaId?: string) {
    select('Ingressos');
    setSelectedPartidaV1Id(partidaId);
    setIngressoV1CreateOpen(true);
  }
  const appActions = {
    onPayment: openPayment,
    onEdit: (ticket: AdminTicket) => setSaleAction({ ticket, mode: 'edit' }),
    onDelete: (ticket: AdminTicket) => setSaleAction({ ticket, mode: 'delete' }),
    onCancel: (ticket: AdminTicket) => setSaleAction({ ticket, mode: 'cancel' }),
  };
  function headerAction() {
    const actionButton = (label: string, onPress: () => void) => <AdminAction primary label={label} icon={Plus} disabled={busy} onPress={onPress} />;
    if (tab === 'Visão geral') return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {actionButton('Cadastrar partida', createPartida)}
      <AdminAction label="Emitir ingresso manual" disabled={busy} onPress={() => issueTicket()} />
    </View>;
    if (tab === 'Planos') return actionButton('Criar plano', () => setPlanEdit(null));
    if (tab === 'Ingressos') return actionButton('Emitir ingresso manual', () => issueTicket(ticketView === 'Todos os ingressos' ? selectedPartidaV1Id : undefined));
    if (tab !== 'Partidas') return;
    switch (ticketView) {
      case 'Estádios': return actionButton('Cadastrar estádio', () => setEstadioCreateOpen(true));
      case 'Templates de setores': return actionButton('Criar template de setores', () => setTemplateCreateOpen(true));
      case 'Templates de venda': return actionButton('Criar template de venda', () => setTemplateVendaCreateOpen(true));
      case 'App do torcedor': return actionButton('Cadastrar partida no app', () => setMatchEdit(null));
      default: return actionButton('Cadastrar partida', createPartida);
    }
  }
  return <AdminLayout active={tab} onSelect={select} onBack={onBack} onSecurity={() => setSecurity(true)} onSignOut={() => void perform(signOut, false)} refreshing={loading} onRefresh={() => void refresh()} busy={busy} action={headerAction()}>
    {!!error && <Panel style={{ borderColor: colors.danger, borderRadius: 12, padding: 16 }}><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text></Panel>}
    {!!notice && <Text accessibilityRole="alert" style={{ color: colors.primary, fontSize: 13 }}>{notice}</Text>}
    {!['Financeiro', 'Saques'].includes(tab) && <AdminPayoutAlert refreshKey={reportRefresh} onOpen={()=>select('Saques')}/>}
    {sectionViews.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {sectionViews.map(view => <AdminButton key={view} label={view} primary={ticketView === view} disabled={busy} onPress={() => select(tab, view)} />)}
    </View>}
    {tab === 'Visão geral' && <><AdminStats overview={overview} /><AdminOverviewPanel overview={overview} onAudit={() => select('Auditoria')} matches={matches} tickets={tickets} audit={audit} loading={loading} onOpenMatches={() => select('Partidas')} onOpenSales={() => select('Ingressos', 'Relatório do app')} onCreate={createPartida} /></>}
    {tab === 'Partidas' && ticketView === 'App do torcedor' && <AdminMatchGrid matches={matches} busy={busy} loading={loading} onEdit={setMatchEdit} onSector={(match, sector) => setSectorEdit({ match, sector })} onCreateSector={(match) => setSectorEdit({ match, sector: null })} onToggle={(match, field) => void perform(() => adminApi.updateMatch(token!, { id: match.id, [field]: !match[field] }))} onOpenGate={openGate} />}
    {tab === 'Ingressos' && ticketView === 'Relatório do app' && <AdminSalesReport matches={matches} refreshKey={reportRefresh} busy={busy} {...appActions} />}
    {tab === 'Torcedores' && <AdminAccountsPanel onEdit={setAccountEdit} users={users} search={search} onSearchChange={setSearch} onSearch={() => void refresh()} loading={loading} busy={busy} currentUserId={member.id} onRecovery={(user) => void perform(async () => { await recoveryApi.forUser(token!, user.id); setNotice('Se a conta estiver ativa, o link será enviado para o email cadastrado.'); }, false)} onMembership={openMembership} onAccount={(user) => void perform(() => adminApi.account(token!, user.id, !user.active))} />}
    {tab === 'Planos' && <><AdminPlanGrid plans={plans} busy={busy} onEdit={setPlanEdit} /><MembershipCardCheck /></>}
    {tab === 'Funcionários' && <EmployeePanel matches={matches} desktop={desktop} />}
    {tab === 'Auditoria' && <AdminAuditPanel audit={audit} loading={loading} />}
    {tab === 'Histórico de portaria' && <View style={{ gap: 18 }}><AdminButton label={legacyGateHistory ? 'Voltar ao histórico V1' : 'Ingressos do app · histórico'} onPress={() => setLegacyGateHistory(!legacyGateHistory)} />{legacyGateHistory ? <AdminGateHistory matches={matches} refreshKey={reportRefresh} /> : <GateV1History refreshKey={reportRefresh} />}</View>}
    {tab === 'Pagamentos' && <AdminPaymentsPanel refreshKey={reportRefresh} />}
    {tab === 'Loja' && <AdminShopPanel refreshKey={reportRefresh} onPayments={() => select('Pagamentos')} />}
    {tab === 'Financeiro' && <AdminFinancePanel refreshKey={reportRefresh} onOpenWithdrawals={() => select('Saques')} />}
    {tab === 'Saques' && <AdminWithdrawalsPanel refreshKey={reportRefresh} />}
    {tab === 'Parceiros' && <AdminPartnersPanel refreshKey={reportRefresh} />}
    {tab === 'Configurações' && <AdminSettingsPanel refreshKey={reportRefresh} onSelect={select} />}
    {tab === 'Email e acesso' && <AdminEmailPanel refreshKey={reportRefresh} users={users} />}
    {tab === 'Partidas' && ticketView === 'Estádios' && <EstadiosIngressoV1Panel token={token!} busy={busy} onBusy={setBusy} onNotice={setNotice} onError={setError} createOpen={estadioCreateOpen} onConsumeCreate={() => setEstadioCreateOpen(false)} />}
    {tab === 'Partidas' && ticketView === 'Templates de setores' && <TemplatesSetorIngressoV1Panel token={token!} busy={busy} onBusy={setBusy} onNotice={setNotice} onError={setError} createOpen={templateCreateOpen} onConsumeCreate={() => setTemplateCreateOpen(false)} />}
    {tab === 'Partidas' && ticketView === 'Templates de venda' && <TemplatesVendaIngressoV1Panel token={token!} busy={busy} onBusy={setBusy} onNotice={setNotice} onError={setError} createOpen={templateVendaCreateOpen} onConsumeCreate={() => setTemplateVendaCreateOpen(false)} />}
    {tab === 'Partidas' && ticketView === 'Calendário' && <PartidasIngressoV1Panel appMatches={matches} onEditApp={setMatchEdit} refreshKey={reportRefresh} token={token!} busy={busy} onBusy={setBusy} onNotice={setNotice} onError={setError} createOpen={partidaV1CreateOpen} onConsumeCreate={() => setPartidaV1CreateOpen(false)} onOpenIngressos={issueTicket} />}
    {tab === 'Ingressos' && ticketView === 'Todos os ingressos' && <IngressosEmitidosV1Panel appMatches={matches} appActions={appActions} refreshKey={reportRefresh} token={token!} busy={busy} onBusy={setBusy} onNotice={setNotice} onError={setError} createOpen={ingressoV1CreateOpen} onConsumeCreate={() => setIngressoV1CreateOpen(false)} initialPartidaId={selectedPartidaV1Id} />}
    {tab === 'Portaria' && <PortariaIngressoV1Panel />}
    {accountEdit && <AdminAccountForm userId={accountEdit.id} onClose={() => setAccountEdit(null)} onSaved={async (signedOut) => { setAccountEdit(null); setNotice('Conta atualizada.'); if (!signedOut) await refresh(); }} />}
    {matchEdit !== undefined && <MatchForm match={matchEdit} onClose={() => setMatchEdit(undefined)} onSaved={async () => { setMatchEdit(undefined); await refresh(); }} />}
    {sectorEdit && <SectorForm {...sectorEdit} onClose={() => setSectorEdit(null)} onSaved={async () => { setSectorEdit(null); await refresh(); }} />}
    {planEdit !== undefined && <PlanForm plan={planEdit} onClose={() => setPlanEdit(undefined)} onSaved={async () => { setPlanEdit(undefined); await refresh(); }} />}
    {saleAction && <AdminSaleForm ticket={saleAction.ticket} mode={saleAction.mode} onClose={() => setSaleAction(null)} onSaved={async () => { const mode = saleAction.mode; setSaleAction(null); setNotice(mode === 'edit' ? 'Venda atualizada.' : mode === 'delete' ? 'Venda excluída. A ação foi registrada na auditoria.' : 'Reserva cancelada.'); await refresh(); }} />}
    {payment && <Sheet visible title="Confirmar recebimento" onClose={busy ? () => {} : () => setPayment(null)}><Text style={{ color: colors.text }}>{payment.user.name} · {money(payment.priceCents)}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Confirme somente depois de conferir o recebimento na conta ou no caixa do clube. Isso emite o ingresso e registra seu nome na auditoria.</Text><AdminField label="Valor recebido" prefix="R$" value={received} onChange={setReceived} numeric /><AdminField label="Taxa efetivamente paga neste recebimento" prefix="R$" value={gatewayFee} onChange={setGatewayFee} numeric hint="Deixe zero para recebimento sem tarifa. Essa taxa será descontada antes da divisão configurada." /><AdminField label="Referência única do recibo ou transação" value={reference} onChange={setReference} /><AdminToggle label="Conferi o recebimento deste pagamento" value={verified} onChange={setVerified} />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}<Button label="Confirmar pagamento e emitir ingresso" loading={busy} disabled={!verified} onPress={() => void perform(async () => { await adminApi.confirm(token!, payment.id, parseAmount(received, true), reference.trim(), parseAmount(gatewayFee, true)); setPayment(null); setNotice('Pagamento registrado e ingresso emitido.'); })} /></Sheet>}
    {associate && <Sheet visible title={`Associação · ${associate.name}`} onClose={busy ? () => {} : () => setAssociate(null)}><AdminSelect label="Plano" value={planId} onChange={setPlanId} disabled={busy} options={plans.map((plan) => ({ value: plan.id, label: plan.name, description: money(plan.priceCents) + ` / ${plan.durationDays || 30} dias` }))} /><AdminDateTimeField label="Validade da associação" value={validUntil} onChange={setValidUntil} disabled={busy} /><AdminSelect label="Situação" value={membershipStatus} onChange={(value) => setMembershipStatus(value as typeof membershipStatus)} options={[{ value: 'ACTIVE', label: 'Ativa' }, { value: 'PENDING', label: 'Pendente' }, { value: 'EXPIRED', label: 'Expirada' }]} />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}<Button label="Salvar associação" loading={busy} disabled={!planId} onPress={() => void perform(async () => { await adminApi.membership(token!, { userId: associate.id, planId, status: membershipStatus, validUntil: parseClubDate(validUntil) }); setAssociate(null); })} /></Sheet>}
  </AdminLayout>;
}
