import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Plus, ScanLine } from 'lucide-react-native';
import type { Match, Sector, Member, ClubPlan, AdminOverview, AdminTicket, AuditEvent } from '@nacional/shared/types';
import { Page, Panel, Button } from '../components/ui';
import { Text } from '../components/Typography';
import { Sheet } from '../components/Sheet';
import { MatchForm, SectorForm, PlanForm, AdminField, AdminToggle } from '../components/AdminForms';
import { AdminSelect, AdminDateTimeField, AdminNotice } from '../components/admin/AdminControls';
import { EmployeePanel } from '../components/EmployeePanel';
import { TicketGatePanel } from '../components/TicketGatePanel';
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
export function AdminScreen({ onBack }: { onBack: () => void }) {
  return <AdminThemeProvider><AdminWorkspace onBack={onBack} /></AdminThemeProvider>;
}
function AdminWorkspace({ onBack }: { onBack: () => void }) {
  const { token, member, signOut } = useSession();
  const { colors } = useTheme();
  const desktop = useDesktopAdmin();
  const [tab, setTab] = useState('Visão geral');
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
  const [saleAction, setSaleAction] = useState<{ ticket: AdminTicket; mode: 'edit' | 'delete' | 'cancel' } | null>(null);
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
  const [reportRefresh, setReportRefresh] = useState(0);
  const revision = useRef(0);
  const lock = useRef(false);
  async function refresh() {
    if (!token || member?.role !== 'ADMIN') return;
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
  if (member?.role !== 'ADMIN') return <Page><Text style={{ color: colors.danger }}>Acesso administrativo necessário.</Text></Page>;
  function select(section: string) { setTab(section); setError(''); setNotice(''); }
  function openPayment(ticket: AdminTicket) { setPayment(ticket); setReference(''); setVerified(false); setReceived((ticket.priceCents / 100).toFixed(2).replace('.', ',')); }
  function openMembership(user: Member) { setAssociate(user); setPlanId(plans.find((plan) => plan.name === user.membership?.plan.name)?.id || plans[0]?.id || ''); setMembershipStatus(user.membership?.status || 'ACTIVE'); setValidUntil(user.membership ? formDate(user.membership.validUntil) : ''); }
  const action = ['Visão geral', 'Jogos'].includes(tab) ? <AdminAction primary label="Cadastrar jogo" icon={Plus} disabled={busy} onPress={() => setMatchEdit(null)} /> : tab === 'Planos' ? <AdminAction primary label="Criar plano" icon={Plus} disabled={busy} onPress={() => setPlanEdit(null)} /> : undefined;
  return <AdminLayout active={tab} onSelect={select} onBack={onBack} onSignOut={() => void perform(signOut, false)} refreshing={loading} onRefresh={() => void refresh()} busy={busy} action={action}>
    {!!error && <Panel style={{ borderColor: colors.danger, borderRadius: 12, padding: 16 }}><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text></Panel>}
    {!!notice && <Text accessibilityRole="alert" style={{ color: colors.primary, fontSize: 13 }}>{notice}</Text>}
    {tab === 'Visão geral' && <><AdminStats overview={overview} /><AdminOverviewPanel matches={matches} tickets={tickets} audit={audit} loading={loading} onSelect={select} onCreate={() => setMatchEdit(null)} /></>}
    {tab === 'Jogos' && <AdminMatchGrid matches={matches} busy={busy} loading={loading} onEdit={setMatchEdit} onSector={(match, sector) => setSectorEdit({ match, sector })} onCreateSector={(match) => setSectorEdit({ match, sector: null })} onToggle={(match, field) => void perform(() => adminApi.updateMatch(token!, { id: match.id, [field]: !match[field] }))} />}
    {tab === 'Vendas' && <AdminSalesReport matches={matches} refreshKey={reportRefresh} busy={busy} onPayment={openPayment} onEdit={(ticket) => setSaleAction({ ticket, mode: 'edit' })} onDelete={(ticket) => setSaleAction({ ticket, mode: 'delete' })} onCancel={(ticket) => setSaleAction({ ticket, mode: 'cancel' })} />}
    {tab === 'Torcedores' && <AdminAccountsPanel users={users} search={search} onSearchChange={setSearch} onSearch={() => void refresh()} loading={loading} busy={busy} currentUserId={member.id} onMembership={openMembership} onAccount={(user) => void perform(() => adminApi.account(token!, user.id, !user.active))} />}
    {tab === 'Planos' && <AdminPlanGrid plans={plans} busy={busy} onEdit={setPlanEdit} />}
    {tab === 'Funcionários' && <EmployeePanel matches={matches} desktop={desktop} />}
    {tab === 'Portaria' && <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 22, alignItems: 'flex-start' }}><Panel style={{ flex: 1, minWidth: 0, width: desktop ? undefined : '100%', borderRadius: 16, padding: desktop ? 25 : 16 }}><TicketGatePanel matches={matches} onChanged={refresh} /></Panel>{desktop && <Panel style={{ width: 245, borderRadius: 16, padding: 22, gap: 13 }}><ScanLine size={24} color={colors.primary} /><Text heading style={{ color: colors.text, fontWeight: '700' }}>Operação da portaria</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Selecione a partida e o setor físico antes de ler ou digitar o código.</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Confira o titular e a quantidade. A consulta não libera a entrada.</Text><Text style={{ color: colors.gold, fontSize: 12 }}>Libere somente após a confirmação registrada no servidor.</Text></Panel>}</View>}
    {tab === 'Auditoria' && <AdminAuditPanel audit={audit} loading={loading} />}
    {tab === 'Histórico de portaria' && <AdminGateHistory matches={matches} refreshKey={reportRefresh} />}
    {tab === 'Pagamentos' && <AdminPaymentsPanel refreshKey={reportRefresh} />}
    {matchEdit !== undefined && <MatchForm match={matchEdit} onClose={() => setMatchEdit(undefined)} onSaved={async () => { setMatchEdit(undefined); await refresh(); }} />}
    {sectorEdit && <SectorForm {...sectorEdit} onClose={() => setSectorEdit(null)} onSaved={async () => { setSectorEdit(null); await refresh(); }} />}
    {planEdit !== undefined && <PlanForm plan={planEdit} onClose={() => setPlanEdit(undefined)} onSaved={async () => { setPlanEdit(undefined); await refresh(); }} />}
    {saleAction && <AdminSaleForm ticket={saleAction.ticket} mode={saleAction.mode} onClose={() => setSaleAction(null)} onSaved={async () => { const mode = saleAction.mode; setSaleAction(null); setNotice(mode === 'edit' ? 'Venda atualizada.' : mode === 'delete' ? 'Venda excluída. A ação foi registrada na auditoria.' : 'Reserva cancelada.'); await refresh(); }} />}
    {payment && <Sheet visible title="Confirmar recebimento" onClose={busy ? () => {} : () => setPayment(null)}><Text style={{ color: colors.text }}>{payment.user.name} · {money(payment.priceCents)}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Confirme somente depois de conferir o recebimento na conta ou no caixa do clube. Isso emite o ingresso e registra seu nome na auditoria.</Text><AdminField label="Valor recebido" prefix="R$" value={received} onChange={setReceived} numeric /><AdminField label="Referência única do recibo ou transação" value={reference} onChange={setReference} /><AdminToggle label="Conferi o recebimento deste pagamento" value={verified} onChange={setVerified} />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}<Button label="Confirmar pagamento e emitir ingresso" loading={busy} disabled={!verified} onPress={() => void perform(async () => { await adminApi.confirm(token!, payment.id, parseAmount(received, true), reference.trim()); setPayment(null); setNotice('Pagamento registrado e ingresso emitido.'); })} /></Sheet>}
    {associate && <Sheet visible title={`Associação · ${associate.name}`} onClose={busy ? () => {} : () => setAssociate(null)}><AdminSelect label="Plano" value={planId} onChange={setPlanId} disabled={busy} options={plans.map((plan) => ({ value: plan.id, label: plan.name, description: money(plan.priceCents) + ' / mês' }))} /><AdminDateTimeField label="Validade da associação" value={validUntil} onChange={setValidUntil} disabled={busy} /><AdminSelect label="Situação" value={membershipStatus} onChange={(value) => setMembershipStatus(value as typeof membershipStatus)} options={[{ value: 'ACTIVE', label: 'Ativa' }, { value: 'PENDING', label: 'Pendente' }, { value: 'EXPIRED', label: 'Expirada' }]} />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}<Button label="Salvar associação" loading={busy} disabled={!planId} onPress={() => void perform(async () => { await adminApi.membership(token!, { userId: associate.id, planId, status: membershipStatus, validUntil: parseClubDate(validUntil) }); setAssociate(null); })} /></Sheet>}
  </AdminLayout>;
}
