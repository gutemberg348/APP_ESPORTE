import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { CheckCircle, ShieldCheck, MapPin } from 'lucide-react-native';
import type { Match, Ticket, TicketQuote } from '@nacional/shared/types';
import { Sheet } from './Sheet';
import { Button, Panel } from './ui';
import { Text } from './Typography';
import { useClub } from '../providers/ClubProvider';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { clubApi } from '../services/club';
import { ApiError } from '../services/api';
import { useServerClock } from '../hooks/useServerClock';
import { matchDate, money, messageOf } from '../utils/format';
import { activeTicket, availablePlaces, matchSaleState, ticketStatus, ticketStatusLabels } from '../utils/ticket-state';

export function TicketSheet({ visible, onClose, selectedMatch, onMyTickets }: { visible: boolean; onClose: () => void; selectedMatch?: Match; onMyTickets?: () => void }) {
  const { data, requestTicket, refresh } = useClub();
  const { member, demoMode, token } = useSession();
  const { colors } = useTheme();
  const match = data?.matches.find((item) => item.id === selectedMatch?.id) || selectedMatch || data?.nextMatch;
  const [selected, setSelected] = useState(match?.sectors.find((sector) => sector.salesEnabled !== false && (availablePlaces(sector) ?? 0) > 0)?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [quote, setQuote] = useState<TicketQuote | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<Ticket | null>(null);
  const [instructions, setInstructions] = useState('');
  const { now, monotonic } = useServerClock(quote?.serverTime || data?.tickets[0]?.serverTime || match?.serverTime);
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    if (token && !demoMode) void clubApi.ticketInstructions(token).then((value) => { if (alive) setInstructions(value.instructions); }).catch(() => {});
    return () => { alive = false; };
  }, [token, demoMode]);
  const existing = match ? activeTicket(data?.tickets || [], match.id, now) : undefined;
  const order = success ? data?.tickets.find((ticket) => ticket.id === success.id) || success : existing;
  const sector = match?.sectors.find((item) => item.id === selected);
  const available = sector ? availablePlaces(sector) : null;
  const state = match ? matchSaleState(match, now) : null;
  const quoteLive = Boolean(quote && monotonic < deadline);
  const estimateDiscount = member?.membership?.status === 'ACTIVE' && Date.parse(member.membership.validUntil) > now ? member.membership.plan.discountPercent : 0;
  const estimate = sector ? Math.round(sector.priceCents * (100 - estimateDiscount) / 100) * quantity : 0;
  async function review() {
    if (lock.current || !match || !selected) return;
    if (demoMode) { setError('A compra está disponível no modo conectado à API. Os dados demonstrativos não emitem ingressos.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const value = await clubApi.quoteTicket(token!, match.id, selected, quantity);
      setQuote(value); setDeadline(performance.now() + Math.max(0, Date.parse(value.expiresAt) - Date.parse(value.serverTime) - 1500));
    } catch (err) { setError(messageOf(err)); await refresh(); }
    finally { lock.current = false; setBusy(false); }
  }
  async function recover() {
    const tickets = await clubApi.tickets(token!);
    const found = match ? activeTicket(tickets, match.id, Date.parse(tickets[0]?.serverTime || '') || now) : undefined;
    if (found) { setSuccess(found); setUncertain(false); setError(''); await refresh(); return true; }
    return false;
  }
  async function consult() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { if (!await recover()) setError('Nenhum pedido confirmado foi encontrado ainda. Consulte novamente ou abra Meus ingressos antes de tentar outra compra.'); }
    catch (err) { setError(messageOf(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit() {
    if (lock.current || !quote || performance.now() >= deadline || uncertain) return;
    lock.current = true; setBusy(true); setError('');
    try { setSuccess(await requestTicket(quote.sector.id, quote.quantity, quote.match.id, quote.totalCents)); }
    catch (err) {
      const definitive = err instanceof ApiError && err.status >= 400 && err.status < 500;
      const needsLookup = !definitive || (err instanceof ApiError && err.code === 'TICKET_EXISTS');
      if (needsLookup) {
        setUncertain(true);
        try { if (await recover()) return; } catch { /* Keep an unknown result blocked until the account is checked. */ }
      }
      setQuote(null); setError(needsLookup ? 'Não conseguimos confirmar a resposta da compra. Consulte seus pedidos antes de tentar novamente.' : messageOf(err));
      await refresh();
    } finally { lock.current = false; setBusy(false); }
  }
  function myTickets() { onClose(); onMyTickets?.(); }
  return <Sheet visible={visible} title={order ? 'Seu pedido' : quote ? 'Revise sua compra' : 'Seu lugar na torcida'} onClose={busy ? () => {} : onClose}>
    {match ? <>
      <Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{match.homeTeam} × {match.awayTeam}</Text>
      <Text style={{ color: colors.muted }}>{matchDate(match.startsAt)} · horário de Patos</Text>
      <View style={{ flexDirection: 'row', gap: 7 }}><MapPin size={18} color={colors.muted} /><Text style={{ color: colors.muted, flex: 1 }}>{match.stadium}</Text></View>
      {order ? <>
        <CheckCircle size={32} color={colors.primary} />
        <Text accessibilityRole="alert" style={{ color: ticketStatus(order, now) === 'ISSUED' ? colors.primary : colors.gold, fontWeight: '700' }}>{ticketStatusLabels[ticketStatus(order, now)]}</Text>
        <Text style={{ color: colors.text }}>{order.quantity} ingresso(s) · {order.sector.name} · {money(order.priceCents)}</Text>
        <Text selectable style={{ color: colors.muted, fontSize: 12 }}>Número do pedido: {order.id}</Text>
        {ticketStatus(order, now) === 'PENDING' && <><Text style={{ color: colors.muted }}>{quote?.paymentInstructions || instructions || 'Apresente o pedido ao atendimento do clube para receber as orientações de pagamento.'}</Text><Text style={{ color: colors.gold, fontSize: 14 }}>Prazo: {order.expiresAt ? new Date(order.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' }) : '—'} (Patos). O ingresso e o QR de entrada são liberados após a confirmação do recebimento pelo clube.</Text></>}
        {ticketStatus(order, now) === 'ISSUED' && <Text style={{ color: colors.muted }}>Seu ingresso está na conta. Apresente o QR ou o código atualizado quando a portaria do jogo estiver aberta.</Text>}
        <Button label="Ver meus ingressos" onPress={myTickets} />
      </> : uncertain ? <Panel style={{ gap: 12, borderColor: colors.gold }}>
        <Text style={{ color: colors.gold, fontWeight: '700' }}>Conferir resposta da compra</Text><Text style={{ color: colors.muted }}>A conexão falhou e o pedido pode ter sido registrado. A consulta não cria outra reserva.</Text><Button label="Consultar meus pedidos no servidor" loading={busy} onPress={() => void consult()} /><Button secondary label="Abrir meus ingressos" disabled={busy} onPress={myTickets} />
      </Panel> : quote ? <>
        <Panel style={{ gap: 12 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>TITULAR</Text><Text style={{ color: colors.text, fontWeight: '700' }}>{member?.name}</Text>
          <Text style={{ color: colors.text }}>{quote.quantity} ingresso(s) · {quote.sector.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 14 }}>Valor por ingresso: {money(quote.unitPriceCents)}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.muted }}>Subtotal</Text><Text style={{ color: colors.text }}>{money(quote.subtotalCents)}</Text></View>
          {quote.discountPercent > 0 && <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.primary, flex: 1 }}>Desconto de sócio · {quote.discountPercent}%</Text><Text style={{ color: colors.primary }}>− {money(quote.discountCents)}</Text></View>}
          <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.text, fontWeight: '700' }}>Total</Text><Text heading style={{ color: colors.primary, fontSize: 24, lineHeight: 32, fontWeight: '800' }}>{money(quote.totalCents)}</Text></View>
        </Panel>
        <Text style={{ color: colors.muted, fontSize: 14 }}>{quote.totalCents === 0 ? 'Ingresso gratuito. A confirmação emite o ingresso na sua conta.' : quote.paymentInstructions}</Text>
        <Text style={{ color: colors.gold, fontSize: 14 }}>{quoteLive ? `Valores conferidos · confirme em ${Math.max(0, Math.floor((deadline - monotonic) / 1000))}s. Os lugares só ficam reservados na confirmação.` : 'Esta revisão venceu. Atualize os valores antes de confirmar.'}</Text>
        <Button label={quote.totalCents === 0 ? 'Confirmar emissão gratuita' : `Confirmar reserva · ${money(quote.totalCents)}`} loading={busy} disabled={!quoteLive} onPress={() => void submit()} />
        {!quoteLive && <Button secondary label="Atualizar valores e disponibilidade" disabled={busy} onPress={() => void review()} />}
        <Button secondary label="Alterar setor ou quantidade" disabled={busy} onPress={() => { setQuote(null); setError(''); }} />
      </> : <>
        <Text style={{ color: state?.canBuy ? colors.primary : colors.gold, fontWeight: '700' }}>{state?.label}</Text>
        {state?.code === 'SCHEDULED' && match.salesOpenAt && <Text style={{ color: colors.muted, fontSize: 14 }}>Abertura: {matchDate(match.salesOpenAt)}</Text>}
        <Text style={{ color: colors.text, fontWeight: '700' }}>1. Escolha o setor</Text>
        {match.sectors.map((item) => {
          const places = availablePlaces(item), disabled = !state?.canBuy || item.salesEnabled === false || !places;
          return <Pressable key={item.id} disabled={disabled || busy} onPress={() => { setSelected(item.id); setQuantity((current) => Math.max(1, Math.min(current, places!, 4))); setError(''); }} accessibilityRole="radio" accessibilityState={{ checked: selected === item.id, disabled: disabled || busy }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderColor: selected === item.id ? colors.primary : colors.border, backgroundColor: selected === item.id ? colors.primarySoft : colors.soft, borderRadius: 16, opacity: disabled ? 0.5 : 1 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>{selected === item.id && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary }} />}</View>
            <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{item.salesEnabled === false ? 'Setor pausado' : places === null ? 'Disponibilidade não confirmada' : places === 0 ? 'Esgotado' : `${places} lugar(es) disponível(is)`}</Text></View>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{item.priceCents === 0 ? 'Gratuito' : money(item.priceCents)}</Text>
          </Pressable>;
        })}
        <Text style={{ color: colors.text, fontWeight: '700' }}>2. Quantas pessoas vão?</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>{[1, 2, 3, 4].map((count) => { const disabled = busy || !selected || count > (available ?? 0); return <Pressable key={count} disabled={disabled} accessibilityRole="radio" accessibilityLabel={`${count} ingresso${count > 1 ? 's' : ''}`} accessibilityState={{ checked: quantity === count, disabled }} onPress={() => setQuantity(count)} style={{ flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: count === quantity ? colors.primary : colors.border, backgroundColor: count === quantity ? colors.primarySoft : colors.soft, opacity: disabled ? 0.4 : 1 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{count}</Text></Pressable>; })}</View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Até 4 pessoas no mesmo pedido. Apenas uma compra ou reserva ativa por conta e partida. O titular deve apresentar o ingresso para o grupo.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted }}>Total estimado</Text><Text heading style={{ color: colors.text, fontWeight: '800', fontSize: 22, lineHeight: 30 }}>{money(estimate)}</Text></View>
        <Button label="Revisar compra" loading={busy} disabled={!selected || !state?.canBuy || quantity > (available ?? 0) || demoMode} onPress={() => void review()} />
        {!state?.canBuy && <Button secondary label="Atualizar disponibilidade" loading={busy} onPress={() => void refresh()} />}
        {demoMode && <Text style={{ color: colors.gold, fontSize: 14 }}>Demonstração. Conecte à API para comprar ingressos reais.</Text>}
      </>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
      {!order && <View style={{ flexDirection: 'row', gap: 8 }}><ShieldCheck size={18} color={colors.primary} /><Text style={{ color: colors.muted, flex: 1, fontSize: 12 }}>Preço, desconto e vagas são conferidos pelo clube. Reservar não confirma um pagamento.</Text></View>}
    </> : <Text style={{ color: colors.muted }}>Nenhum jogo disponível para compra.</Text>}
  </Sheet>;
}
