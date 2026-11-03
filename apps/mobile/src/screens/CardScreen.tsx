import { club } from '../config/club';
import { useTheme } from '../theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { View, ScrollView, useWindowDimensions, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw, Star, Shield } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { Crest } from '../components/Crest';
import { Text } from '../components/Typography';
import { useSession } from '../providers/SessionProvider';
import { useCardToken } from '../hooks/useCardToken';
export function CardScreen() {
  const { tone } = useTheme();
  const { member, demoMode } = useSession();
  const { height, width } = useWindowDimensions();
  const membership = member?.membership;
  const active = Boolean(membership?.status === 'ACTIVE' && new Date(membership.validUntil) > new Date());
  const { card, remaining, error } = useCardToken(active);
  const scan = useRef(new Animated.Value(0)).current;
  const compact = height < 680;
  const qrSize = Math.max(104, Math.min(184, height - (compact ? 465 : 510))) - (compact ? 30 : 36);
  useEffect(() => {
    if (!card) return;
    const animation = Animated.loop(Animated.sequence([Animated.timing(scan, { toValue: qrSize + 30, duration: 2500, useNativeDriver: Platform.OS !== 'web' }), Animated.timing(scan, { toValue: 0, duration: 2500, useNativeDriver: Platform.OS !== 'web' })]));
    animation.start(); return () => animation.stop();
  }, [card, scan, qrSize]);
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: width <= 360 ? 18 : 22, paddingTop: compact ? 4 : 10, paddingBottom: compact ? 12 : 16, justifyContent: 'center' }}>
    <LinearGradient colors={[tone('#103c2b'), tone('#072017'), tone('#020704')]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: '100%', flex: 1, minHeight: height < 550 ? 365 : 420, maxHeight: 590, borderRadius: compact ? 25 : 28, padding: compact ? 18 : 24, borderWidth: 1, borderColor: '#aa994e66', justifyContent: 'space-between' }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, opacity: 0.035, width: '65%', height: '65%', alignItems: 'center', justifyContent: 'center' }}><Crest size={190} height={245} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}><View style={{ flexShrink: 1, gap: compact ? 7 : 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Crest size={compact ? 27 : 30} height={compact ? 35 : 40} /><View><Text heading style={{ color: tone('#f0f6f1'), fontSize: width <= 360 ? 18 : 20, lineHeight: 24, fontWeight: '800', letterSpacing: 0.3 }}>{club.upperName}</Text><Text style={{ color: tone('#b8d7c2'), fontSize: 12, lineHeight: 17, letterSpacing: 1, marginTop: 3 }}>{club.location}</Text></View></View><View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: '#d5b24f12', borderWidth: 1, borderColor: '#dab95b2e', borderRadius: 5, paddingVertical: 4, paddingHorizontal: 7 }}><Star size={13} color="#efd48b" /><Text style={{ color: '#efd48b', fontSize: 12, lineHeight: 17, flexShrink: 1 }}>{(membership?.plan.name || 'Torcedor').toUpperCase()}</Text></View></View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tone('#1e965a10'), borderWidth: 1, borderColor: tone('#53d08b40'), borderRadius: 24, paddingVertical: 6, paddingHorizontal: 8 }}><View style={{ height: 5, width: 5, borderRadius: 3, backgroundColor: tone('#9de7bc') }} /><Text style={{ color: tone('#9de7bc'), fontSize: 12, lineHeight: 17, fontWeight: '600' }}>{active ? 'ATIVO' : 'INATIVO'}</Text></View></View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: compact ? 8 : 14, gap: compact ? 6 : 9 }}><View style={{ padding: compact ? 15 : 18, borderRadius: 19, backgroundColor: '#fff', overflow: 'hidden', minWidth: qrSize + 36, minHeight: qrSize + 36, alignItems: 'center', justifyContent: 'center' }}>{card && remaining > 0 ? <><QRCode value={card.token} size={qrSize} color={tone('#06140e')} /><Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: tone('#39c78b'), transform: [{ translateY: scan }] }} /></> : active ? <Text style={{ fontSize: 12, color: tone('#556f5c') }}>{error ? 'QR indisponível' : 'Atualizando…'}</Text> : <Shield size={qrSize} color={tone('#143b25')} />}</View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 24, backgroundColor: '#0003', borderWidth: 1, borderColor: '#ffffff0f' }}><RefreshCw size={15} color={tone('#79dcaa')} /><Text style={{ color: remaining <= 5 ? '#f0d582' : tone('#c6dece'), fontSize: compact ? 12 : 14, lineHeight: 20 }}>{active ? `${demoMode ? 'QR demo · ' : 'Renova em '}${remaining}s` : 'Plano inativo'}</Text></View><Text style={{ color: tone('#abc6b7'), fontSize: 12, lineHeight: 17, textAlign: 'center' }}>{error || (demoMode ? 'Sem validade de acesso' : active ? 'Carteirinha digital do sócio' : 'Ative sua associação para acessar a carteirinha')}</Text></View>
      <View><Text style={{ color: tone('#adbfaf'), fontSize: 12, lineHeight: 17, letterSpacing: 0.4 }}>SÓCIO TITULAR</Text><Text style={{ color: tone('#f0f6f1'), fontSize: 18, lineHeight: 25, fontWeight: '600', marginTop: 3, marginBottom: compact ? 9 : 13 }}>{member?.name}</Text><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><View><Text style={{ color: tone('#adbfaf'), fontSize: 12, lineHeight: 17, letterSpacing: 0.4 }}>MATRÍCULA{demoMode ? ' DEMO' : ''}</Text><Text style={{ color: tone('#e2ece3'), fontWeight: '700', letterSpacing: 0.5, marginTop: 2 }}>{membership?.memberId || '—'}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={{ color: tone('#adbfaf'), fontSize: 12, lineHeight: 17, letterSpacing: 0.4 }}>VALIDADE{demoMode ? ' DEMO' : ''}</Text><Text style={{ color: tone('#e2ece3'), fontWeight: '700', letterSpacing: 0.5, marginTop: 2 }}>{membership ? new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: '2-digit', timeZone: 'America/Fortaleza' }).format(new Date(membership.validUntil)) : '—'}</Text></View></View></View>
    </LinearGradient>
  </ScrollView>;
}
