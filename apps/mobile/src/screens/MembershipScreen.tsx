import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { ChevronLeft, ChevronDown, ChevronUp, BadgeCheck } from 'lucide-react-native';
import type { ClubPlan } from '@nacional/shared/types';
import { membershipApi, type MembershipOrder } from '../services/membership';
import { useSession } from '../providers/SessionProvider';
import { useClub } from '../providers/ClubProvider';
import { useTheme } from '../theme/ThemeProvider';
import { requestKey } from '../utils/payments';
import { money, messageOf } from '../utils/format';
import { Text } from '../components/Typography';
import { Page, Title, Panel, Button, TextAction } from '../components/ui';
import { PixCheckout } from '../components/PixCheckout';
const statuses: Record<string,string> = { PAID: 'Plano ativado', PARTIAL_REFUND: 'Estorno parcial · associação suspensa', REFUNDING: 'Estorno em acompanhamento', REFUNDED: 'Estornado', EXPIRED: 'Prazo encerrado' };
export function MembershipScreen({ onBack }: { onBack: () => void }) {
  const { token, member, demoMode } = useSession(), { refresh } = useClub(), { colors } = useTheme();
  const [plans, setPlans] = useState<ClubPlan[]>([]), [orders, setOrders] = useState<MembershipOrder[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [detailPlan, setDetailPlan] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const lock = useRef(false), attempt = useRef<{ planId: string; expectedPriceCents: number; requestKey: string } | null>(null);
  const active = member?.membership?.status === 'ACTIVE' && Date.parse(member.membership.validUntil) > Date.now();
  const displayed = orders.find(row => row.id === selected);
  useEffect(() => {
    let alive = true, running = false;
    async function load() {
      if (!token || demoMode || running || AppState.currentState !== 'active') { if (demoMode) setLoading(false); return; }
      running = true;
      try { const [catalog, history] = await Promise.all([membershipApi.plans(token), membershipApi.orders(token)]); if (alive) { setPlans(catalog); setOrders(history); setLoadError(''); } }
      catch (err) { if (alive) setLoadError(messageOf(err)); }
      finally { running = false; if (alive) setLoading(false); }
    }
    void load(); const timer = setInterval(() => void load(), 8000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { alive = false; clearInterval(timer); sub.remove(); };
  }, [token, demoMode]);
  async function buy(plan: ClubPlan) {
    if (!token || lock.current || demoMode) return;
    lock.current = true; setBusy(true); setError('');
    if (!attempt.current || attempt.current.planId !== plan.id || attempt.current.expectedPriceCents !== plan.priceCents) attempt.current = { planId: plan.id, expectedPriceCents: plan.priceCents, requestKey: requestKey() };
    try { const order = await membershipApi.checkout(token, attempt.current); setOrders(rows => [order, ...rows.filter(row => row.id !== order.id)]); setSelected(order.id); attempt.current = null; }
    catch (err) { setError(messageOf(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function changed() { await refresh(); if (token) setOrders(await membershipApi.orders(token)); }
  if (displayed) return <Page>
    <TextAction icon={ChevronLeft} label="Voltar aos planos" onPress={() => setSelected(null)} />
    <Title title={displayed.planName} subtitle={`Associação por ${displayed.durationDays} dias`} />
    {!!loadError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{loadError}</Text>}
    <PixCheckout key={displayed.id} membershipOrderId={displayed.id} initialIntentId={displayed.intentId} onChanged={changed} />
  </Page>;

  return <Page>
    <TextAction icon={ChevronLeft} label="Voltar" onPress={onBack} />
    <Title title={active ? 'Minha associação' : 'Seja sócio'} subtitle={active ? undefined : 'Pix à vista · Renovação manual'} />
    {active && <Panel style={{ gap: 5 }}>
      <Text heading style={{ color: colors.text, fontWeight: '800' }}>{member!.membership!.plan.name}</Text>
      <Text style={{ color: colors.muted }}>Ativo até {new Date(member!.membership!.validUntil).toLocaleDateString('pt-BR')}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>Carteirinha disponível na aba Carteira.</Text>
    </Panel>}
    {demoMode && <Text style={{ color: colors.muted }}>Entre na sua conta para escolher um plano.</Text>}
    {!!loadError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{loadError}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {!plans.length && !demoMode && !loadError && <Text style={{ color: colors.muted }}>{loading ? 'Consultando planos…' : 'Nenhum plano disponível no momento.'}</Text>}
    {plans.map(plan => <Panel key={plan.id} style={{ padding: 18, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BadgeCheck size={22} color={colors.primary} />
        <Text heading style={{ color: colors.text, flex: 1, fontSize: 18, fontWeight: '800' }}>{plan.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}>
        <Text heading style={{ color: colors.text, fontSize: 30, lineHeight: 38, fontWeight: '800' }}>{money(plan.priceCents)}</Text>
        <Text style={{ color: colors.muted, fontSize: 14 }}>/ {plan.durationDays || 30} dias</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>Carteirinha digital{plan.discountPercent > 0 ? ` · ${plan.discountPercent}% em ingressos elegíveis` : ''}</Text>
      {!!plan.description && <TextAction icon={detailPlan === plan.id ? ChevronUp : ChevronDown} label={detailPlan === plan.id ? 'Ocultar detalhes' : 'Detalhes do plano'} onPress={() => setDetailPlan(detailPlan === plan.id ? null : plan.id)} />}
      {detailPlan === plan.id && <Text style={{ color: colors.muted, fontSize: 14 }}>{plan.description}</Text>}
      <Button label={active ? 'Associação já ativa' : plan.priceCents ? 'Assinar com Pix' : 'Ativação pelo clube'} loading={busy && attempt.current?.planId === plan.id} disabled={busy || !!active || !plan.priceCents || demoMode} onPress={() => void buy(plan)} />
    </Panel>)}
    {!!orders.length && <Title title="Meus pedidos" />}
    {orders.map(order => <Panel key={order.id} style={{ gap: 6, padding: 16 }}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{order.planName} · {money(order.priceCents)}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{statuses[order.status] || (Date.parse(order.expiresAt) <= Date.now() ? 'Prazo encerrado' : 'Aguardando pagamento')}</Text>
      <Button secondary label="Ver pagamento" onPress={() => setSelected(order.id)} />
    </Panel>)}
  </Page>;
}
