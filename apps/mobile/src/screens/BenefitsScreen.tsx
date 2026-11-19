import { MembershipOffer } from '../components/MembershipOffer';
import { club } from '../config/club';
import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Search, Store, UserPlus, ChevronRight, Coffee, ShoppingBasket, Heart, Fuel, Pizza, Activity, Gift } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Partner } from '@nacional/shared/types';
import { Page, Title, ActionTile, DemoFooter, Panel, Button } from '../components/ui';
import { Text, TextInput } from '../components/Typography';
import { useTheme } from '../theme/ThemeProvider';
import { useClub } from '../providers/ClubProvider';
import { useSession } from '../providers/SessionProvider';
import { usePayments } from '../providers/PaymentsProvider';
import { money } from '../utils/format';
export const partnerIcons = { coffee: Coffee, basket: ShoppingBasket, heart: Heart, fuel: Fuel, pizza: Pizza, activity: Activity, gift: Gift };
export function BenefitsScreen({ onRefer, onFeature, onPartner }: { onRefer: (kind: 'FRIEND' | 'BUSINESS' | 'PARTNER') => void; onFeature: (name: string) => void; onPartner: (partner: Partner) => void }) {
  const { colors, isDark, tone } = useTheme();
  const { data, refresh, loading, error } = useClub();
  const { demoMode, member } = useSession();
  const { wallet, showCashback, refresh: refreshWallet } = usePayments();
  const [category, setCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [all, setAll] = useState(false);
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const partners = data?.partners.filter((p) => (category === 'Todos' || p.category === category) && normalize(`${p.name} ${p.category}`).includes(normalize(search))) || [];
  return <Page refreshing={loading} onRefresh={() => { void refresh(); void refreshWallet(); }}>
    <Title title="Vantagens" subtitle="Seu plano e os benefícios nos parceiros do clube." />
    <MembershipOffer onOpen={() => onFeature('Seja sócio')} />
    {member?.membership?.status === 'ACTIVE' && Date.parse(member.membership.validUntil) > Date.now() && <Panel style={{ gap: 10, borderColor: colors.primary }}><Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Seu plano {member.membership.plan.name}</Text><Text style={{ color: colors.muted }}>Carteirinha digital ativa{member.membership.plan.discountPercent ? ` e ${member.membership.plan.discountPercent}% de desconto nos ingressos elegíveis.` : '.'}</Text><Button label="Ver jogos disponíveis" onPress={() => onFeature('Ingressos')} /><Button secondary label="Minha associação" onPress={() => onFeature('Meu plano')} /></Panel>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {showCashback && <Pressable accessibilityRole="button" accessibilityLabel="Ver saldo e extrato de cashback" onPress={() => onFeature('Cashback')} style={{ backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.brandBorder, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <View style={{ flexGrow: 1, gap: 4 }}><Text style={{ color: colors.muted, fontSize: 13 }}>Saldo de cashback{wallet?.demo ? ' · demonstração' : ''}</Text><Text heading style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>{wallet ? money(wallet.availableCents) : '—'}</Text></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={{ color: colors.primary, fontWeight: '600' }}>Ver extrato</Text><ChevronRight size={17} color={colors.primary} /></View>
    </Pressable>}
    <Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Parceiros e ofertas</Text>
    {!!data?.partners.length && <>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14 }}><Search size={20} color={colors.muted} /><TextInput accessibilityLabel="Buscar parceiros" value={search} onChangeText={setSearch} placeholder="Buscar parceiro" placeholderTextColor={colors.muted} style={{ flex: 1, height: 50, color: colors.text }} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{['Todos', ...Array.from(new Set(data?.partners.map((p) => p.category) || []))].map((cat) => <Pressable key={cat} onPress={() => { setCategory(cat); setAll(false); }} accessibilityRole="button" accessibilityState={{ selected: cat === category }} style={{ borderRadius: 25, paddingHorizontal: 15, paddingVertical: 10, minHeight: 44, borderWidth: 1, borderColor: cat === category ? tone('#49be83') : colors.border, backgroundColor: cat === category ? tone('#187842') : colors.soft }}><Text style={{ fontSize: 14, color: cat === category ? '#fff' : colors.muted }}>{cat}</Text></Pressable>)}</ScrollView>
    </>}
    <View style={{ gap: 10 }}>{partners.slice(0, all || search ? partners.length : 3).map((partner) => {
      const Icon = partnerIcons[partner.icon as keyof typeof partnerIcons] || Gift;
      return <Pressable key={partner.id} accessibilityRole="button" onPress={() => onPartner(partner)} style={{ borderWidth: 1, borderColor: isDark ? tone('#27352b') : colors.border, backgroundColor: isDark ? tone('#151f18') : colors.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}><LinearGradient colors={isDark ? [tone('#133e2a'), tone('#0b1710')] : [tone('#edf5ef'), tone('#edf5ef')]} style={{ width: 48, height: 48, borderRadius: 13, borderWidth: 1, borderColor: tone('#50bf8230'), alignItems: 'center', justifyContent: 'center' }}><Icon size={24} color={colors.primary} strokeWidth={1.45} /></LinearGradient><View style={{ flex: 1, gap: 4 }}><Text style={{ fontSize: 12, lineHeight: 18, textTransform: 'uppercase', letterSpacing: 0.4, color: colors.muted }}>{partner.category}</Text><Text style={{ fontWeight: '600', color: colors.text }}>{partner.name}</Text><Text style={{ fontSize: 14, lineHeight: 21, fontWeight: '700', color: colors.primary }}>{partner.discount}</Text></View><ChevronRight size={17} color={colors.subtle} /></Pressable>;
    })}{!partners.length && <Panel style={{ gap: 10 }}><Gift size={30} color={colors.primary} /><Text style={{ color: colors.text, fontWeight: '700' }}>{data?.partners.length ? 'Nenhuma oferta neste filtro' : 'Ainda não há parceiros publicados'}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{data?.partners.length ? 'Limpe a busca para consultar os outros parceiros.' : 'As novas ofertas do clube aparecerão aqui.'}</Text><Button secondary label={data?.partners.length ? 'Limpar filtros' : 'Atualizar vantagens'} onPress={() => { setCategory('Todos'); setSearch(''); if (!data?.partners.length) void refresh(); }} /></Panel>}</View>
    {!all && !search && partners.length > 3 && <Pressable onPress={() => setAll(true)} style={{ alignItems: 'center', padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.soft }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Ver todos os {partners.length} parceiros</Text></Pressable>}
    {demoMode && <Text style={{ color: colors.muted, fontSize: 12 }}>Parceiros e ofertas de exemplo.</Text>}
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 25, gap: 18 }}><Text heading style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Expanda nosso clube</Text><View style={{ flexDirection: 'row', gap: 13 }}><ActionTile icon={Store} title="Indicar comércio" subtitle={`Seu lugar favorito no ${club.shortName}.`} color="#9ac1f4" onPress={() => onRefer('BUSINESS')} /><ActionTile icon={UserPlus} title="Indicar amigo" subtitle="Traga sua torcida para perto." color="#ebd18b" onPress={() => onRefer('FRIEND')} /></View><Pressable onPress={() => onRefer('PARTNER')}><LinearGradient colors={isDark ? [tone('#1c593535'), tone('#0a2920')] : [tone('#edf5ef'), tone('#e4f3e6')]} style={{ flexDirection: 'row', alignItems: 'center', gap: 18, borderRadius: 21, padding: 20, borderWidth: 1, borderColor: tone('#4ea86f3b') }}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.primary, fontSize: 12, letterSpacing: 0.6 }}>PARA LOJISTAS</Text><Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{`Seja parceiro do ${club.shortName}`}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Vamos crescer com a cidade.</Text></View><View style={{ padding: 10, backgroundColor: tone('#238b59'), borderRadius: 24 }}><ChevronRight size={22} color="#fff" /></View></LinearGradient></Pressable></View>
    <DemoFooter demo={demoMode} />
  </Page>;
}
