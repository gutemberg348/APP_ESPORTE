import React from 'react';
import { View, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { MapPin, Shield, Ticket, ShoppingBag, Tv, UserPlus, ChevronRight, GraduationCap, CircleDot } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Crest } from '../components/Crest';
import { Text } from '../components/Typography';
import { useTheme } from '../theme/ThemeProvider';
import { useClub } from '../providers/ClubProvider';
import { useSession } from '../providers/SessionProvider';
import { club } from '../config/club';
export function HomeScreen({ onTicket, onStadium, onFeature }: { onTicket: () => void; onStadium: () => void; onFeature: (name: string) => void }) {
  const { colors, isDark } = useTheme();
  const { data, preseason } = useClub();
  const { demoMode } = useSession();
  const { height, width } = useWindowDimensions();
  const compact = height < 720;
  const match = preseason ? null : data?.nextMatch;
  const order = data?.tickets.find((ticket) => ticket.match.id === match?.id && ['ISSUED', 'USED', 'PENDING'].includes(ticket.status) && !(ticket.status === 'PENDING' && ticket.expiresAt && Date.parse(ticket.expiresAt) <= Date.now()));
  const day = match ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Fortaleza' }).format(new Date(match.startsAt)).replace(' de ', ' ').replace('.', '').toUpperCase() : '';
  const time = match ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Fortaleza' }).format(new Date(match.startsAt)) : '';
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: width <= 360 ? 14 : 20, paddingTop: 12, paddingBottom: 18, gap: compact ? 14 : 18 }}>
    <LinearGradient colors={[colors.heroStart, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: compact ? 270 : 305, padding: 19, borderRadius: 28, borderWidth: 1, borderColor: colors.brandBorder, gap: 18 }}>
      {match ? <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ height: 7, width: 7, borderRadius: 4, backgroundColor: colors.primaryStrong }} /><Text numberOfLines={2} style={{ color: colors.primary, fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 0.5, flex: 1 }}>{match.stadium.replace(/^Est\.\s*/, '').toUpperCase()}</Text><Pressable accessibilityRole="button" onPress={() => onFeature('Tabela')} style={{ minHeight: 42, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.soft }}><ChevronRight size={15} color={colors.onHero} /><Text style={{ color: colors.onHero, fontSize: 14 }}>Tabela</Text></Pressable></View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 13 }}>{match.isHome !== false ? <Crest size={52} height={58} /> : <Shield size={48} color={colors.onHero} strokeWidth={1.4} />}<Text heading style={{ color: colors.onHero, fontWeight: '800', fontSize: width <= 360 ? 15 : 17, textAlign: 'center' }}>{match.homeTeam}</Text></View>
          <View style={{ alignItems: 'center', gap: 7 }}><Text style={{ color: colors.heroMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>{day}</Text><Text heading style={{ color: colors.onHero, fontSize: 29, lineHeight: 38, fontWeight: '800' }}>{time}</Text>{demoMode && <Text style={{ color: colors.heroMuted, fontSize: 10 }}>DEMONSTRAÇÃO</Text>}</View>
          <View style={{ flex: 1, alignItems: 'center', gap: 13 }}>{match.isHome === false ? <Crest size={52} height={58} /> : <View style={{ height: 58, justifyContent: 'center' }}><Shield size={48} strokeWidth={1.4} color={colors.onHero} /></View>}<Text heading style={{ color: colors.onHero, fontWeight: '800', fontSize: width <= 360 ? 15 : 17, textAlign: 'center' }}>{match.awayTeam}</Text></View>
        </View>
        <Pressable accessibilityRole="button" onPress={order ? () => onFeature('Meus ingressos') : onTicket}><LinearGradient colors={[colors.primaryStrong, colors.primaryEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ minHeight: 50, borderRadius: 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 }}><Ticket size={19} color={colors.onPrimary} /><Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: '700' }}>{order?.status === 'PENDING' ? 'Acompanhar reserva' : order ? 'Ver meus ingressos' : 'Garantir ingresso'}</Text></LinearGradient></Pressable>
      </> : <>
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>{club.name.toUpperCase()}</Text>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}><Crest size={70} /><Text heading style={{ color: colors.onHero, fontWeight: '800', fontSize: 25, lineHeight: 33 }}>A paixão tem lugar.</Text><Text style={{ color: colors.heroMuted, textAlign: 'center', fontSize: 14 }}>Os próximos jogos aparecem aqui assim que o clube publicar.</Text></View>
        <Pressable accessibilityRole="button" onPress={onTicket} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong, borderRadius: 25 }}><Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Central de ingressos</Text></Pressable>
      </>}
    </LinearGradient>
    <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>{[
      { icon: ShoppingBag, label: 'Loja', action: 'Loja', color: '#a6c5f4', background: '#6e91d21a' },
      { icon: Tv, label: club.tvName, action: club.tvName, color: colors.primary, background: colors.primarySoft },
      { icon: CircleDot, label: 'Tabela', action: 'Tabela', color: '#c1a9e8', background: '#9275b61c' },
      { icon: UserPlus, label: 'Indicar', action: 'Indicar', color: '#e3c675', background: '#a98a3c1c' },
    ].map(({ icon: Icon, label, action, color, background }) => <Pressable key={label} accessibilityRole="button" onPress={() => onFeature(action)} style={{ flex: 1, alignItems: 'center', gap: 7 }}><View style={{ width: compact ? 46 : 50, height: compact ? 46 : 50, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: isDark ? background : colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon size={24} color={isDark ? color : colors.primary} strokeWidth={1.7} /></View><Text numberOfLines={1} style={{ fontSize: width <= 360 ? 11 : 13, lineHeight: 19, color: colors.muted }}>{label}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" onPress={() => onFeature(club.schoolName)}><LinearGradient colors={isDark ? ['#302611', '#241b0e'] : ['#fff1d4', '#fff9ec']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderWidth: 1, borderColor: isDark ? '#b99b454d' : '#e5cc94', borderRadius: 22 }}><View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: '#eab345', alignItems: 'center', justifyContent: 'center' }}><GraduationCap size={25} color="#36280e" strokeWidth={1.7} /></View><View style={{ flex: 1, gap: 3 }}><Text heading style={{ color: isDark ? '#efc973' : '#855d1b', fontWeight: '800', fontSize: 18, lineHeight: 25 }}>{club.schoolName}</Text><Text style={{ color: isDark ? '#d6cbbc' : '#7b6642', fontSize: 13 }}>{club.schoolSubtitle}</Text></View><ChevronRight size={19} color={colors.gold} /></LinearGradient></Pressable>
    <Pressable accessibilityRole="button" onPress={() => onFeature('Indicar')}><LinearGradient colors={[colors.heroStart, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderWidth: 1, borderColor: colors.brandBorder, borderRadius: 22 }}><View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' }}><UserPlus size={25} color={colors.onPrimary} /></View><View style={{ flex: 1, gap: 3 }}><Text heading style={{ color: colors.primary, fontWeight: '800', fontSize: 18, lineHeight: 25 }}>Indique um amigo</Text><Text style={{ color: colors.muted, fontSize: 13 }}>Mais gente na nossa torcida.</Text></View><ChevronRight size={19} color={colors.primary} /></LinearGradient></Pressable>
  </ScrollView>;
}
