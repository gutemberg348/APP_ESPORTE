import React, { useState, useEffect } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet, useWindowDimensions, Linking, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Home, Gift, QrCode, CircleDot, User, Sun, Moon, Bell, Ellipsis, Crown } from 'lucide-react-native';
import type { Tab, Partner } from '@nacional/shared/types';
import type { TicketSection } from '../utils/ticket-state';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { ClubProvider, useClub } from '../providers/ClubProvider';
import { PaymentsProvider, usePayments } from '../providers/PaymentsProvider';
import { club } from '../config/club';
import { money } from '../utils/format';
import { HomeScreen } from '../screens/HomeScreen';
import { BenefitsScreen } from '../screens/BenefitsScreen';
import { CardScreen } from '../screens/CardScreen';
import { FanZoneScreen } from '../screens/FanZoneScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SchoolScreen } from '../screens/SchoolScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { CashbackScreen } from '../screens/CashbackScreen';
import { MerchantScreen } from '../screens/MerchantScreen';
import { GateScreen } from '../screens/GateScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { TicketsScreen } from '../screens/TicketsScreen';
import { SecurityScreen } from '../screens/SecurityScreen';
import { Crest } from '../components/Crest';
import { Text } from '../components/Typography';
import { ReferralSheet } from '../components/ReferralSheet';
import { FeatureSheet } from '../components/FeatureSheet';
import { PartnerSheet } from '../components/PartnerSheet';
import { StadiumModal } from '../components/StadiumModal';
import { Button } from '../components/ui';
export function AppNavigator() {
  const { colors, isDark } = useTheme();
  const { member, loading, bootError, retry, demoMode, resumeDemo } = useSession();
  return <View style={{ flex: 1, backgroundColor: colors.outer, alignItems: 'center' }}><StatusBar style={isDark ? 'light' : 'dark'} /><SafeAreaView edges={['top']} style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' && ['ADMIN', 'GATE'].includes(member?.role || '') ? 1180 : 448, backgroundColor: colors.background }}>
    {loading ? <View style={layout.center}><ActivityIndicator color={colors.primary} /></View> : bootError ? <View style={[layout.center, { padding: 32, gap: 16 }]}><Text style={{ color: colors.danger, textAlign: 'center' }}>{bootError}</Text><Button label="Tentar novamente" onPress={() => void retry()} /></View> : member ? member.role === 'GATE' ? <GateScreen /> : <ClubProvider><PaymentsProvider><MainNavigator /></PaymentsProvider></ClubProvider> : demoMode ? <View style={[layout.center, { padding: 32, gap: 22 }]}><Crest size={78} height={98} /><Text heading style={{ color: colors.text, fontSize: 28, lineHeight: 36, fontWeight: '800', textAlign: 'center' }}>Sua torcida está aqui.</Text><Button label={`Voltar ao ${club.shortName}`} onPress={resumeDemo} /></View> : <LoginScreen />}
  </SafeAreaView></View>;
}
function MainNavigator() {
  const { colors, isDark, toggle } = useTheme();
  const { member } = useSession();
  const { data, error, loading, refresh } = useClub();
  const { wallet } = usePayments();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('home');
  const [school, setSchool] = useState(false);
  const [admin, setAdmin] = useState(member?.role === 'ADMIN');
  const [paymentPage, setPaymentPage] = useState<'cashback' | 'merchant' | 'tickets' | 'security' | null>(null);
  const [initialQr, setInitialQr] = useState('');
  const [fanTab, setFanTab] = useState('Jogar');
  const [ticketSection, setTicketSection] = useState<TicketSection>('catalog');
  const [stadium, setStadium] = useState(false);
  const [feature, setFeature] = useState<string | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [referral, setReferral] = useState<'FRIEND' | 'BUSINESS' | 'PARTNER' | null>(null);
  function openSale(qr: string) { setInitialQr(qr); setPaymentPage('cashback'); setSchool(false); }
  useEffect(() => {
    const handle = (url: string | null | undefined) => { if (url?.startsWith('nacional://sale/') || url?.startsWith('nacional://merchant/')) openSale(url); };
    void Linking.getInitialURL().then(handle).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => subscription.remove();
  }, []);
  function open(name: string) {
    if (name === 'Segurança') { setPaymentPage('security'); setSchool(false); return; }
    if (name === 'Administração') { setAdmin(true); return; }
    if (['Meus ingressos', 'Ingressos', 'Tabela'].includes(name)) { setTicketSection(name === 'Meus ingressos' ? 'orders' : 'catalog'); setPaymentPage('tickets'); setSchool(false); setAdmin(false); return; }
    if (name === 'Cashback' || name === 'Economia') { setInitialQr(''); setPaymentPage('cashback'); setSchool(false); }
    else if (name === 'Caixa do parceiro') { setPaymentPage('merchant'); setSchool(false); }
    else if (name === club.schoolName || name === 'Ninho do Canário') { setPaymentPage(null); setSchool(true); }
    else if (name === 'Indicar') setReferral('FRIEND');
    else if (name === 'Prêmios') { setSchool(false); setFanTab('Prêmios'); setTab('fanzone'); }
    else setFeature(name);
  }
  const nav = [{ id: 'home' as const, icon: Home, label: 'Início' }, { id: 'benefits' as const, icon: Gift, label: 'Vantagens' }, { id: 'card' as const, icon: QrCode, label: 'Carteira' }, { id: 'fanzone' as const, icon: CircleDot, label: 'Fan Zone' }, { id: 'profile' as const, icon: User, label: 'Perfil' }];
  const compact = height < 720;
  const roundButton = { width: width <= 360 ? 34 : 39, height: width <= 360 ? 34 : 39, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft, alignItems: 'center' as const, justifyContent: 'center' as const };
  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: width <= 360 ? 14 : 20, paddingVertical: compact ? 11 : 15, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.header, flexDirection: 'row', alignItems: 'center', gap: width <= 360 ? 7 : 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao início" onPress={() => { setTab('home'); setSchool(false); setPaymentPage(null); setAdmin(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <LinearGradient colors={[colors.primaryStrong, '#d5aa64']} style={{ width: width <= 360 ? 39 : 44, height: width <= 360 ? 39 : 44, borderRadius: 25, padding: 2, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: '100%', height: '100%', borderRadius: 24, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center' }}><Crest size={width <= 360 ? 29 : 33} height={width <= 360 ? 29 : 33} /></View></LinearGradient>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Text numberOfLines={1} style={{ color: colors.primary, fontSize: width <= 360 ? 10 : 11, fontWeight: '800', letterSpacing: 0.8, flexShrink: 1 }}>{club.supporterLabel}</Text><Crown size={11} color={colors.gold} /></View><Text numberOfLines={1} heading style={{ fontSize: width <= 360 ? 15 : 17, lineHeight: 24, color: colors.text, fontWeight: '800' }}>{member?.name.trim().split(/\s+/)[0]}</Text></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir meu cashback" onPress={() => open('Cashback')} style={{ minHeight: width <= 360 ? 34 : 39, paddingHorizontal: width <= 360 ? 9 : 12, borderRadius: 24, borderWidth: 1, borderColor: colors.brandBorder, backgroundColor: colors.primarySoft, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: width <= 360 ? 12 : 14, fontWeight: '800' }}>{wallet ? money(wallet.availableCents) : '—'}</Text></Pressable>
      <View style={{ flexDirection: 'row', gap: 6 }}><Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'} style={roundButton}>{isDark ? <Sun size={21} color={colors.gold} strokeWidth={1.6} /> : <Moon size={21} color={colors.muted} strokeWidth={1.6} />}</Pressable><Pressable onPress={() => open(tab === 'card' ? 'Opções da carteira' : 'Notificações')} accessibilityRole="button" accessibilityLabel={tab === 'card' ? 'Opções da carteira' : 'Notificações'} style={roundButton}>{tab === 'card' ? <Ellipsis size={21} color={colors.muted} /> : <Bell size={21} color={colors.muted} strokeWidth={1.6} />}</Pressable></View>
    </View>
    {error && data ? <Pressable onPress={() => void refresh()}><Text style={{ color: colors.danger, padding: 12, fontSize: 12 }}>{error} Toque para tentar novamente.</Text></Pressable> : null}
    <View style={{ flex: 1, minHeight: 0 }}>{admin && member?.role === 'ADMIN' ? <AdminScreen onBack={() => { setAdmin(false); void refresh(); }} /> : !data ? <View style={[layout.center, { padding: 24, gap: 16 }]}>{loading ? <ActivityIndicator color={colors.primary} /> : <><Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text><Button label="Tentar novamente" onPress={() => void refresh()} /></>}</View> : paymentPage === 'security' ? <SecurityScreen onBack={() => setPaymentPage(null)} /> : paymentPage === 'tickets' ? <TicketsScreen initialSection={ticketSection} onBack={() => setPaymentPage(null)} /> : paymentPage === 'cashback' ? <CashbackScreen key={initialQr || 'wallet'} initialQr={initialQr} onBack={() => setPaymentPage(null)} /> : paymentPage === 'merchant' ? <MerchantScreen onBack={() => setPaymentPage(null)} onOpenSale={openSale} /> : school ? <SchoolScreen onBack={() => setSchool(false)} /> : tab === 'home' ? <HomeScreen onTicket={() => open('Ingressos')} onStadium={() => setStadium(true)} onFeature={open} /> : tab === 'benefits' ? <BenefitsScreen onRefer={setReferral} onFeature={open} onPartner={setPartner} /> : tab === 'card' ? <CardScreen /> : tab === 'fanzone' ? <FanZoneScreen key={fanTab} initialTab={fanTab} onStadium={() => setStadium(true)} onFeature={open} /> : <ProfileScreen onFeature={open} />}</View>
    <View style={{ marginHorizontal: 12, marginBottom: Math.max(insets.bottom, 10), padding: 7, borderRadius: 40, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.nav, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 5 }}>
      {nav.map(({ id, icon: Icon, label }) => <Pressable key={id} onPress={() => { setTab(id); setSchool(false); setPaymentPage(null); setAdmin(false); if (id === 'fanzone') setFanTab('Jogar'); }} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === id }} style={{ flex: 1, minHeight: compact ? 56 : 60, justifyContent: 'center', alignItems: 'center', paddingVertical: 5, gap: 4, borderRadius: 30, borderWidth: 1, borderColor: tab === id ? colors.brandBorder : 'transparent', backgroundColor: tab === id ? colors.navActive : 'transparent' }}>
        <Icon size={24} color={tab === id ? colors.primary : colors.muted} fill={id === 'home' && tab === id ? colors.primary : 'none'} strokeWidth={1.7} />
        <Text style={{ fontSize: width <= 360 ? 10 : 11, lineHeight: 16, fontWeight: tab === id ? '700' : '500', color: tab === id ? colors.primary : colors.muted }}>{label}</Text>
      </Pressable>)}
    </View>
    {referral && <ReferralSheet kind={referral} onClose={() => setReferral(null)} />}{feature && <FeatureSheet key={feature} feature={feature} onClose={() => setFeature(null)} onNavigate={open} />}{partner && <PartnerSheet partner={partner} onClose={() => setPartner(null)} />}{stadium && <StadiumModal onClose={() => setStadium(false)} />}
  </View>;
}
const layout = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
