import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import type { ClubPlan } from '@nacional/shared/types';
import { membershipApi, type MembershipOrder } from '../services/membership';
import { useSession } from '../providers/SessionProvider';
import { useClub } from '../providers/ClubProvider';
import { useTheme } from '../theme/ThemeProvider';
import { requestKey } from '../utils/payments';
import { money, messageOf } from '../utils/format';
import { Text } from '../components/Typography';
import { Page, Title, Panel, Button } from '../components/ui';
import { PixCheckout } from '../components/PixCheckout';
const statuses: Record<string,string> = { PAID: 'Plano ativado', PARTIAL_REFUND: 'Estorno parcial · associação suspensa', REFUNDING: 'Estorno em acompanhamento', REFUNDED: 'Estornado', EXPIRED: 'Prazo encerrado' };
export function MembershipScreen({ onBack }: { onBack: () => void }) {
  const { token, member, demoMode } = useSession(), { refresh } = useClub(), { colors } = useTheme();
  const [plans, setPlans] = useState<ClubPlan[]>([]), [orders, setOrders] = useState<MembershipOrder[]>([]), [selected, setSelected] = useState<string | null>(null);
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
  return <Page><Button secondary label="Voltar" onPress={onBack} /><Title title={active ? 'Minha associação' : 'Seja sócio'} subtitle="Escolha seu plano e fortaleça o Esporte." />
    {active && <Panel><Text style={{ color: colors.primary, fontWeight: '700' }}>{member!.membership!.plan.name} · ativo</Text><Text style={{ color: colors.muted }}>Validade: {new Date(member!.membership!.validUntil).toLocaleDateString('pt-BR')}</Text><Text style={{ color: colors.muted }}>Sua carteirinha está disponível na aba Carteira.</Text></Panel>}
    <Text style={{ color: colors.muted, fontSize: 13 }}>Pagamento único pelo período escolhido. Sem débito automático. Após a confirmação do Pix, a carteirinha é liberada. Renove ao fim da validade.</Text>
    {demoMode && <Text style={{ color: colors.muted }}>Entre com uma conta real para consultar e contratar os planos.</Text>}
    {!!loadError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{loadError}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {!plans.length && !demoMode && <Text style={{ color: colors.muted }}>{loading ? 'Consultando planos…' : 'O clube ainda não publicou planos. Fale com a administração.'}</Text>}
    {plans.map(plan => <Panel key={plan.id} style={{ gap: 12, borderColor: colors.brandBorder }}><Text heading style={{ color: colors.text, fontSize: 21, fontWeight: '800' }}>{plan.name}</Text><Text style={{ color: colors.primary, fontSize: 28, fontWeight: '700' }}>{money(plan.priceCents)} <Text style={{ color: colors.muted, fontSize: 13 }}>/ {plan.durationDays || 30} dias</Text></Text>{!!plan.description && <Text style={{ color: colors.muted, fontSize: 14 }}>{plan.description}</Text>}<Text style={{ color: colors.text, fontSize: 13 }}>Carteirinha digital{plan.discountPercent > 0 ? ` e ${plan.discountPercent}% de desconto nos ingressos elegíveis.` : '.'}</Text><Button label={active ? 'Você já possui uma associação ativa' : plan.priceCents ? 'Escolher e pagar com Pix' : 'Ativação gratuita pela administração'} disabled={busy || !!active || !plan.priceCents || demoMode} onPress={() => void buy(plan)} /></Panel>)}
    {!!orders.length && <Title title="Pedidos de associação" />}
    {orders.map(order => <Panel key={order.id} style={{ gap: 8 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{order.planName} · {money(order.priceCents)}</Text><Text style={{ color: colors.muted }}>{statuses[order.status] || (Date.parse(order.expiresAt) <= Date.now() ? 'Prazo de pagamento encerrado' : 'Aguardando pagamento')}</Text><Button secondary label="Ver pagamento" onPress={() => setSelected(order.id)} />{displayed?.id === order.id && <PixCheckout membershipOrderId={order.id} initialIntentId={order.intentId} onChanged={changed} />}</Panel>)}
  </Page>;
}
