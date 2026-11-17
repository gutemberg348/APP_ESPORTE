import { MembershipOffer } from '../components/MembershipOffer';
import { Page, Button } from '../components/ui';
import { request } from '../services/api';
import type { Member } from '@nacional/shared/types';
import { club } from '../config/club';
import { useTheme } from '../theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { View, ScrollView, useWindowDimensions, Animated, Platform, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw, Star, Shield } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { Crest } from '../components/Crest';
import { Text } from '../components/Typography';
import { useSession } from '../providers/SessionProvider';
import { useCardToken } from '../hooks/useCardToken';
export function CardScreen({ onPlans }: { onPlans: () => void }) {
  const { tone } = useTheme();
  const { member, demoMode, token, updateMember } = useSession();
  const { height, width } = useWindowDimensions();
  const membership = member?.membership;
  const active = Boolean(membership?.status === 'ACTIVE');
  const { card, remaining, error, serverNow } = useCardToken(active);
  const scan = useRef(new Animated.Value(0)).current;
  const compact = height < 680;
  const qrSize = Math.max(150, Math.min(200, width - 140));
  useEffect(() => {
    let alive = true, running = false;
    async function sync() {
      if (!token || demoMode || running || AppState.currentState !== 'active') return;
      running = true;
      try { const fresh = await request<Member>('/me', { token }); if (alive) updateMember(fresh); } catch { /* QR renewal fails closed separately. */ } finally { running = false; }
    }
    void sync(); const timer = setInterval(() => void sync(), 10000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    return () => { alive = false; clearInterval(timer); sub.remove(); };
  }, [token, demoMode, updateMember]);
  useEffect(() => {
    if (!card) return;
    const animation = Animated.loop(Animated.sequence([Animated.timing(scan, { toValue: 3, duration: 1000, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(scan, { toValue: 0, duration: 1000, useNativeDriver: Platform.OS !== 'web' })]));
    animation.start(); return () => animation.stop();
  }, [card, scan, qrSize]);
  if (!active) return <Page><MembershipOffer onOpen={onPlans} /><Text style={{ color: tone('#abc6b7') }}>Após o pagamento ou a ativação pelo clube, sua carteirinha aparecerá aqui automaticamente.</Text><Button secondary label="Consultar meu plano e pagamento" onPress={onPlans} /></Page>;
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: width <= 360 ? 18 : 22, paddingTop: compact ? 4 : 10, paddingBottom: compact ? 12 : 16, justifyContent: 'center' }}>
    <LinearGradient colors={[tone('#103c2b'), tone('#072017'), tone('#020704')]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: '100%', flex: 1, minHeight: height < 550 ? 365 : 420, maxHeight: 720, borderRadius: compact ? 25 : 28, padding: compact ? 18 : 24, borderWidth: 1, borderColor: '#aa994e66', justifyContent: 'space-between' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, opacity: 0.035, width: '65%', height: '65%', alignItems: 'center', justifyContent: 'center' }}><Crest size={190} height={245} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}><View style={{ flexShrink: 1, gap: compact ? 7 : 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Crest size={compact ? 27 : 30} height={compact ? 35 : 40} /><View><Text heading style={{ color: tone('#f0f6f1'), fontSize: width <= 360 ? 18 : 20, lineHeight: 24, fontWeight: '800', letterSpacing: 0.3 }}>{club.upperName}</Text><Text style={{ color: tone('#b8d7c2'), fontSize: 12, lineHeight: 17, letterSpacing: 1, marginTop: 3 }}>{club.location}</Text></View></View><View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: '#d5b24f12', borderWidth: 1, borderColor: '#dab95b2e', borderRadius: 5, paddingVertical: 4, paddingHorizontal: 7 }}><Star size={13} color="#efd48b" /><Text style={{ color: '#efd48b', fontSize: 12, lineHeight: 17, flexShrink: 1 }}>{(membership?.plan.name || 'Torcedor').toUpperCase()}</Text></View></View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tone('#1e965a10'), borderWidth: 1, borderColor: tone('#53d08b40'), borderRadius: 24, paddingVertical: 6, paddingHorizontal: 8 }}><View style={{ height: 5, width: 5, borderRadius: 3, backgroundColor: tone('#9de7bc') }} /><Text style={{ color: tone('#9de7bc'), fontSize: 12, lineHeight: 17, fontWeight: '600' }}>{active ? 'ATIVO' : 'INATIVO'}</Text></View></View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: compact ? 8 : 14, gap: compact ? 6 : 9 }}><View style={{ padding: compact ? 15 : 18, borderRadius: 19, backgroundColor: '#fff', overflow: 'hidden', minWidth: qrSize + 36, minHeight: qrSize + 36, alignItems: 'center', justifyContent: 'center' }}>{card && remaining > 0 ? <Animated.View style={{ transform: [{ translateY: scan }] }}><QRCode value={card.token} size={qrSize} color="#111111" backgroundColor="#ffffff" /></Animated.View> : active ? <Text style={{ fontSize: 12, color: tone('#556f5c') }}>{error ? 'QR indisponível' : 'Atualizando…'}</Text> : <Shield size={qrSize} color={tone('#143b25')} />}</View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 24, backgroundColor: '#0003', borderWidth: 1, borderColor: '#ffffff0f' }}><RefreshCw size={15} color={tone('#79dcaa')} /><Text style={{ color: remaining <= 5 ? '#f0d582' : tone('#c6dece'), fontSize: compact ? 12 : 14, lineHeight: 20 }}>{active ? `${demoMode ? 'QR demo · ' : 'Renova em '}${remaining}s` : 'Plano inativo'}</Text></View><Text style={{ color: '#ffffff', fontSize: 20, lineHeight: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{new Date(serverNow).toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza', hour12: false })}</Text><Text style={{ color: tone('#abc6b7'), fontSize: 11, textAlign: 'center' }}>Horário de Patos · atualização a cada segundo</Text><Text style={{ color: tone('#abc6b7'), fontSize: 12, lineHeight: 17, textAlign: 'center' }}>{error || (demoMode ? 'Sem validade de acesso' : active ? 'QR temporário · validação online pelo clube' : 'Ative sua associação para acessar a carteirinha')}</Text></View>
      <View><Text style={{ color: tone('#adbfaf'), fontSize: 12, lineHeight: 17, letterSpacing: 0.4 }}>SÓCIO TITULAR</Text><Text style={{ color: tone('#f0f6f1'), fontSize: 18, lineHeight: 25, fontWeight: '600', marginTop: 3, marginBottom: compact ? 9 : 13 }}>{member?.name}</Text><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><View><Text style={{ color: tone('#adbfaf'), fontSize: 12, lineHeight: 17, letterSpacing: 0.4 }}>MATRÍCULA{demoMode ? ' DEMO' : ''}</Text><Text style={{ color: tone('#e2ece3'), fontWeight: '700', letterSpacing: 0.5, marginTop: 2 }}>{membership?.memberId || '—'}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={{ color: tone('#adbfaf'), fontSize: 12, lineHeight: 17, letterSpacing: 0.4 }}>VALIDADE{demoMode ? ' DEMO' : ''}</Text><Text style={{ color: tone('#e2ece3'), fontWeight: '700', letterSpacing: 0.5, marginTop: 2 }}>{membership ? new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: '2-digit', timeZone: 'America/Fortaleza' }).format(new Date(membership.validUntil)) : '—'}</Text></View></View></View>
    </LinearGradient>
  </ScrollView>;
}
