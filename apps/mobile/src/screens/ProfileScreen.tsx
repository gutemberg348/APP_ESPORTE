import { club } from '../config/club';
import React, { useState } from 'react';
import { View, Pressable, Switch } from 'react-native';
import { Star, User, Wallet, Clock, Info, ChevronRight, LogOut, Settings, ShoppingBag, Tv, GraduationCap, RefreshCw } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Preferences } from '@nacional/shared/types';
import { Page, Panel, DemoFooter, Button } from '../components/ui';
import { Text } from '../components/Typography';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { useClub } from '../providers/ClubProvider';
import { usePayments } from '../providers/PaymentsProvider';
import { messageOf } from '../utils/format';
export function ProfileScreen({ onFeature }: { onFeature: (name: string) => void }) {
  const { colors, isDark, tone } = useTheme();
  const { member, signOut, demoMode } = useSession();
  const { preferences, toggleSeason, preseason } = useClub();
  const { setup } = usePayments();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!member) return null;
  async function perform(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }
  const initials = member.name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('');
  return <Page>
    <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4, gap: 10 }}><View style={{ marginBottom: 5 }}><LinearGradient colors={['#ebcb77', tone('#288f65'), tone('#174a34')]} style={{ width: 94, height: 94, borderRadius: 47, padding: 3 }}><View style={{ flex: 1, borderRadius: 47, backgroundColor: tone('#0a2216'), borderWidth: 3, borderColor: tone('#0a160e'), alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: tone('#d8e9dd'), fontSize: 28, lineHeight: 36, fontWeight: '600' }}>{initials}</Text></View></LinearGradient><View style={{ position: 'absolute', right: -1, bottom: 0, padding: 6, borderRadius: 20, borderWidth: 2, borderColor: colors.background, backgroundColor: '#d9b257' }}><Star size={15} color={tone('#1b281b')} /></View></View><Text heading style={{ color: colors.text, fontSize: 24, lineHeight: 34, fontWeight: '800', textAlign: 'center' }}>{member.name}</Text><Text style={{ color: isDark ? '#e6cc80' : colors.gold, fontSize: 14, letterSpacing: 0.8, textAlign: 'center' }}>{(member.membership?.plan.name || 'Torcedor').toUpperCase()} · {member.membership?.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'}</Text></View>
    <Pressable accessibilityRole="button" onPress={() => onFeature('Prêmios')}><Panel style={{ borderRadius: 19, backgroundColor: colors.soft, borderColor: isDark ? '#3b3c2b' : colors.border, flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.muted, fontSize: 12, letterSpacing: 1 }}>SEUS PONTOS ZEZITO</Text><Text heading style={{ color: colors.text, fontSize: 28, lineHeight: 36, fontWeight: '800' }}>{member.points.toLocaleString('pt-BR')}</Text><Text style={{ color: colors.primary, fontSize: 14 }}>Troque por experiências</Text></View><ChevronRight size={22} color={colors.muted} /></Panel></Pressable>
    <View>{[
      { icon: Wallet, title: 'Meus ingressos', sub: 'Comprar, acompanhar e apresentar QR', feature: 'Meus ingressos' },
      { icon: Wallet, title: 'Meu cashback', sub: 'Compras, saldo e extrato em reais', feature: 'Cashback' },
      { icon: User, title: 'Meus dados', sub: 'Nome, cidade e contato', feature: 'Meus Dados' },
      { icon: Settings, title: 'Segurança', sub: 'Senha e sessões conectadas', feature: 'Segurança' },
      { icon: Wallet, title: 'Meu plano e pagamentos', sub: demoMode ? 'Assinatura e histórico demo' : 'Assinatura e histórico', feature: 'Meu plano' },
      { icon: Clock, title: 'Histórico de atividades', sub: demoMode ? 'Check-ins e ingressos demo' : 'Check-ins e ingressos', feature: 'Histórico de atividades' },
      { icon: Info, title: 'Central de ajuda', sub: 'Respostas rápidas', feature: 'Central de Ajuda' },
    ].map(({ icon: Icon, title, sub, feature }) => <Pressable key={title} onPress={() => onFeature(feature)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8, gap: 15, borderRadius: 18 }}><View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={colors.muted} /></View><View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontWeight: '600' }}>{title}</Text><Text style={{ color: colors.subtle, fontSize: 14 }}>{sub}</Text></View><ChevronRight size={18} color={colors.muted} /></Pressable>)}
      <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded }} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 15 }}><Settings size={22} color={colors.muted} /><Text style={{ flex: 1, color: colors.text }}>Preferências</Text><ChevronRight size={18} color={colors.muted} style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }} /></Pressable>
      {expanded && <View style={{ gap: 16, padding: 16 }}>{([{ key: 'family', title: 'Vou com a família' }, { key: 'personalize', title: 'Ofertas para mim' }, { key: 'notifications', title: 'Lembretes' }, { key: 'ranking', title: 'Aparecer no ranking' }] as { key: keyof Preferences; title: string }[]).map(({ key, title }) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.text, flex: 1 }}>{title}</Text><Switch accessibilityLabel={title} disabled={busy} value={member.preferences[key]} onValueChange={(value) => void perform(() => preferences({ ...member.preferences, [key]: value }))} trackColor={{ false: tone('#647467'), true: tone('#238b59') }} thumbColor="#fff" /></View>)}</View>}
    </View>
    {member.role === 'ADMIN' && <Button label="Abrir administração do clube" onPress={() => onFeature('Administração')} />}
    <Text heading style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{`Mais ${club.shortName}`}</Text><Panel style={{ paddingVertical: 0, paddingHorizontal: 16 }}>{[{ icon: ShoppingBag, title: 'Boutique', feature: 'Loja' }, { icon: Tv, title: club.tvName, feature: club.tvName }, { icon: GraduationCap, title: club.schoolName, feature: club.schoolName }].map(({ icon: Icon, title, feature }, i) => <Pressable key={title} onPress={() => onFeature(feature)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}><Icon size={22} color={colors.muted} /><Text style={{ flex: 1, color: colors.text }}>{title}</Text><ChevronRight size={18} color={colors.muted} /></Pressable>)}</Panel>
    {!!setup?.merchants.length && <Button label={demoMode ? "Caixa demonstrativo" : "Abrir caixa do parceiro"} secondary onPress={() => onFeature("Caixa do parceiro")} />}
    {demoMode && <Pressable onPress={toggleSeason} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 16 }}><RefreshCw size={20} color={colors.muted} /><View style={{ flex: 1 }}><Text style={{ color: colors.text }}>Cenário do início</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{preseason ? 'Mostrar próximo jogo' : 'Simular pré-temporada'}</Text></View><ChevronRight size={18} color={colors.muted} /></Pressable>}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void perform(signOut)} accessibilityRole="button" style={{ flexDirection: 'row', gap: 12, paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.border }}><LogOut size={22} color={colors.danger} /><Text style={{ color: colors.danger, fontSize: 14, fontWeight: '700' }}>{demoMode ? 'Sair da demonstração' : 'Sair da conta'}</Text></Pressable>
    <DemoFooter demo={demoMode} />
  </Page>;
}
