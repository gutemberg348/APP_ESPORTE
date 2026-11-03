import { club } from '../config/club';
﻿import React, { useEffect, useState } from 'react';
import { AppState, View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { ChevronLeft, Search, Ticket as TicketIcon, CalendarDays } from 'lucide-react-native';
import type { Match } from '@nacional/shared/types';
import { Page, Title, Panel, Button } from '../components/ui';
import { Text, TextInput } from '../components/Typography';
import { TicketSheet } from '../components/TicketSheet';
import { MatchTicketCard } from '../components/MatchTicketCard';
import { TicketOrderCard } from '../components/TicketOrderCard';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { useClub } from '../providers/ClubProvider';
import { clubApi } from '../services/club';
import { useServerClock } from '../hooks/useServerClock';
import { activeTicket, matchSaleState, ticketStatus, type TicketSection } from '../utils/ticket-state';

export function TicketsScreen({ onBack, initialSection = 'catalog' }: { onBack: () => void; initialSection?: TicketSection }) {
  const { colors } = useTheme();
  const { demoMode, token } = useSession();
  const { data, refresh, loading, error } = useClub();
  const [section, setSection] = useState<TicketSection>(initialSection);
  const [filter, setFilter] = useState('Todos');
  const [orderFilter, setOrderFilter] = useState('Ativos');
  const [search, setSearch] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [qrTicketId, setQrTicketId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');
  const [instructionsError, setInstructionsError] = useState(false);
  const { now } = useServerClock(data?.tickets[0]?.serverTime || data?.matches[0]?.serverTime);
  useEffect(() => { setSection(initialSection); }, [initialSection]);
  useEffect(() => {
    void refresh();
    const poll = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { clearInterval(poll); subscription.remove(); };
  }, [refresh]);
  useEffect(() => {
    let alive = true;
    if (token && !demoMode) void clubApi.ticketInstructions(token).then((value) => { if (alive) { setInstructions(value.instructions); setInstructionsError(false); } }).catch(() => { if (alive) setInstructionsError(true); });
    return () => { alive = false; };
  }, [token, demoMode]);
  const tickets = data?.tickets || [];
  const matches = data?.matches || [];
  const active = tickets.filter((ticket) => ['PENDING', 'ISSUED'].includes(ticketStatus(ticket, now)));
  const openCount = matches.filter((item) => matchSaleState(item, now).canBuy).length;
  const query = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visibleMatches = matches.filter((item) => {
    const searchable = `${item.homeTeam} ${item.awayTeam} ${item.stadium} ${item.competition}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return (!query || searchable.includes(query)) && (filter !== 'Vendas abertas' || matchSaleState(item, now).canBuy);
  });
  const visibleTickets = tickets.filter((ticket) => orderFilter === 'Todos' || (orderFilter === 'Ativos' ? ['PENDING', 'ISSUED'].includes(ticketStatus(ticket, now)) : !['PENDING', 'ISSUED'].includes(ticketStatus(ticket, now))));
  function myTickets() { setSection('orders'); setOrderFilter('Todos'); setMatch(null); }
  return <Page refreshing={loading} onRefresh={() => void refresh()}>
    <Pressable onPress={onBack} accessibilityRole="button" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 }}><ChevronLeft size={20} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14 }}>Voltar</Text></Pressable>
    <Title title="Sua próxima emoção" subtitle={`Escolha o jogo. Garanta seu lugar. Viva o ${club.shortName}.`} action={<TicketIcon size={28} color={colors.primary} />} />
    <View style={{ flexDirection: 'row', gap: 10 }}>{([{ id: 'catalog', label: 'Comprar' }, { id: 'orders', label: `Meus ingressos${active.length ? ` (${active.length})` : ''}` }] as const).map((tab) => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: section === tab.id }} onPress={() => setSection(tab.id)} style={{ flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: section === tab.id ? colors.primary : colors.border, backgroundColor: section === tab.id ? colors.primarySoft : colors.soft }}><Text style={{ color: section === tab.id ? colors.primary : colors.muted, fontWeight: '700', fontSize: 14 }}>{tab.label}</Text></Pressable>)}</View>
    {!!error && <Panel style={{ gap: 10, borderColor: colors.danger }}><Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>A disponibilidade exibida pode ter mudado. Atualize para consultar o clube.</Text><Button secondary label="Tentar atualizar" loading={loading} onPress={() => void refresh()} /></Panel>}
    {loading && !data && <ActivityIndicator color={colors.primary} />}
    {demoMode && <Text style={{ color: colors.gold, fontSize: 12 }}>Demonstração. Compras reais dependem da API e dos jogos publicados pelo clube.</Text>}
    {section === 'catalog' ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft }}><Search size={20} color={colors.muted} /><TextInput accessibilityLabel="Buscar jogo por adversário, estádio ou competição" placeholder="Adversário, estádio, competição..." placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} autoCorrect={false} maxLength={100} style={{ flex: 1, color: colors.text, minHeight: 28, padding: 0 }} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['Todos', 'Vendas abertas'].map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: filter === item }} onPress={() => setFilter(item)} style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 24, backgroundColor: filter === item ? colors.primarySoft : colors.soft, borderWidth: 1, borderColor: filter === item ? colors.primary : colors.border }}><Text style={{ color: filter === item ? colors.primary : colors.muted, fontSize: 14 }}>{item}{item === 'Vendas abertas' ? ` · ${openCount}` : ''}</Text></Pressable>)}</ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text heading style={{ color: colors.text, fontSize: 21, lineHeight: 29, fontWeight: '800' }}>{`Jogos do ${club.shortName}`}</Text>{loading && <ActivityIndicator size="small" color={colors.primary} />}</View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Horários de Patos · disponibilidade conferida novamente antes de reservar. Preços da lista sem desconto de sócio.</Text>
      {visibleMatches.map((item) => <MatchTicketCard key={item.id} match={item} now={now} order={activeTicket(tickets, item.id, now)} onChoose={() => setMatch(item)} onOrder={myTickets} />)}
      {!visibleMatches.length && !loading && <Panel style={{ gap: 12, alignItems: 'center', paddingVertical: 28 }}><CalendarDays size={34} color={colors.primary} /><Text heading style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>{matches.length ? 'Nenhum jogo neste filtro' : 'Novos jogos em breve'}</Text><Text style={{ color: colors.muted, textAlign: 'center', fontSize: 14 }}>{matches.length ? 'Tente outro adversário ou consulte todos os jogos publicados.' : 'Assim que o clube publicar as partidas e os setores, você encontra os ingressos aqui.'}</Text>{matches.length > 0 && <Button secondary label="Ver todos os jogos" onPress={() => { setFilter('Todos'); setSearch(''); }} />}</Panel>}
    </> : <>
      <Title title="Meus ingressos" subtitle="Reservas, pagamentos e acessos, todos na sua conta." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['Ativos', 'Histórico', 'Todos'].map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: orderFilter === item }} onPress={() => { setOrderFilter(item); setQrTicketId(null); }} style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 24, borderWidth: 1, borderColor: orderFilter === item ? colors.primary : colors.border, backgroundColor: orderFilter === item ? colors.primarySoft : colors.soft }}><Text style={{ color: orderFilter === item ? colors.primary : colors.muted, fontSize: 14 }}>{item}</Text></Pressable>)}</ScrollView>
      {instructionsError && <Text style={{ color: colors.gold, fontSize: 12 }}>Não foi possível carregar as orientações de pagamento. Confirme com o atendimento do clube usando o número do pedido.</Text>}
      {visibleTickets.map((ticket) => <TicketOrderCard key={`${ticket.id}.${ticket.createdAt}`} ticket={ticket} now={now} instructions={instructions} expanded={qrTicketId === ticket.id} onExpand={() => setQrTicketId(qrTicketId === ticket.id ? null : ticket.id)} onChanged={refresh} onShop={() => setSection('catalog')} />)}
      {!visibleTickets.length && !loading && <Panel style={{ gap: 12, alignItems: 'center', paddingVertical: 28 }}><TicketIcon size={36} color={colors.primary} /><Text heading style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>{orderFilter === 'Ativos' ? 'Seu próximo jogo começa aqui' : 'Nenhum pedido neste filtro'}</Text><Text style={{ color: colors.muted, textAlign: 'center', fontSize: 14 }}>Escolha uma partida e acompanhe seu ingresso nesta área.</Text><Button label="Explorar jogos" onPress={() => setSection('catalog')} /></Panel>}
    </>}
    {match && <TicketSheet key={match.id} visible selectedMatch={match} onClose={() => setMatch(null)} onMyTickets={myTickets} />}
  </Page>;
}
