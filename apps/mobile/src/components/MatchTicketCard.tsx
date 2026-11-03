import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, CalendarDays, Ticket as TicketIcon, Shield } from 'lucide-react-native';
import type { Match, Ticket } from '@nacional/shared/types';
import { Text } from './Typography';
import { Button } from './ui';
import { Crest } from './Crest';
import { useTheme } from '../theme/ThemeProvider';
import { money, matchDate } from '../utils/format';
import { availablePlaces, matchSaleState, ticketStatus, ticketStatusLabels } from '../utils/ticket-state';

export function MatchTicketCard({ match, order, now, onChoose, onOrder }: { match: Match; order?: Ticket; now: number; onChoose: () => void; onOrder: () => void }) {
  const { colors, isDark, tone } = useTheme();
  const state = matchSaleState(match, now);
  return <LinearGradient colors={isDark ? [tone('#123527'), tone('#0a1710')] : [tone('#e7f3e9'), '#ffffff']} style={{ padding: 20, gap: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.border }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>{match.competition}</Text><View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: colors.soft }}><Text style={{ color: state.canBuy ? colors.primary : colors.gold, fontSize: 12, fontWeight: '700' }}>{state.label}</Text></View></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 10, alignItems: 'center' }}>{match.isHome !== false ? <Crest size={43} height={53} /> : <View style={{ height: 53, justifyContent: 'center' }}><Shield size={40} color={colors.muted} strokeWidth={1.4} /></View>}<Text heading style={{ color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{match.homeTeam}</Text></View>
      <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '700' }}>VS</Text>
      <View style={{ flex: 1, gap: 10, alignItems: 'center' }}>{match.isHome === false ? <Crest size={43} height={53} /> : <View style={{ height: 53, justifyContent: 'center' }}><Shield size={40} color={colors.muted} strokeWidth={1.4} /></View>}<Text heading style={{ color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{match.awayTeam}</Text></View>
    </View>
    <View style={{ gap: 6 }}><View style={{ flexDirection: 'row', gap: 7 }}><CalendarDays size={17} color={colors.primary} /><Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{matchDate(match.startsAt)}</Text></View><View style={{ flexDirection: 'row', gap: 7 }}><MapPin size={17} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14, flex: 1 }}>{match.stadium}</Text></View></View>
    <View style={{ gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 14 }}>
      {match.sectors.map((sector) => { const available = availablePlaces(sector); return <View key={sector.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 14 }}>{sector.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{sector.salesEnabled === false ? 'Pausado' : available === null ? 'Disponibilidade a confirmar' : available === 0 ? 'Esgotado' : `${available} disponíveis`}</Text></View><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{sector.priceCents === 0 ? 'Gratuito' : money(sector.priceCents)}</Text></View>; })}
    </View>
    {state.code === 'SCHEDULED' && match.salesOpenAt && <Text style={{ color: colors.gold, fontSize: 12 }}>Vendas a partir de {matchDate(match.salesOpenAt)}</Text>}
    {order ? <><Text style={{ color: colors.gold, fontSize: 14 }}>{ticketStatusLabels[ticketStatus(order, now)]} na sua conta.</Text><Button label="Ver meu pedido" onPress={onOrder} /></> : <>
      {state.canBuy && state.fromPriceCents !== null && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TicketIcon size={19} color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 12 }}>A partir de</Text><Text heading style={{ color: colors.primary, fontWeight: '800', fontSize: 23, lineHeight: 31 }}>{state.fromPriceCents === 0 ? 'Gratuito' : money(state.fromPriceCents)}</Text></View>}
      <Button secondary={!state.canBuy} label={state.canBuy ? 'Escolher meus ingressos' : 'Consultar setores'} onPress={onChoose} />
    </>}
  </LinearGradient>;
}
