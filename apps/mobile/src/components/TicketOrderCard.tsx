import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ticket as TicketIcon, Clock, CheckCircle, MapPin } from 'lucide-react-native';
import type { Ticket } from '@nacional/shared/types';
import { Panel, Button } from './ui';
import { Text } from './Typography';
import { LiveTicketQr } from './LiveTicketQr';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { clubApi } from '../services/club';
import { money, matchDate, messageOf } from '../utils/format';
import { reservationCountdown, ticketStatus, ticketStatusLabels } from '../utils/ticket-state';
import { PixCheckout } from './PixCheckout';

export function TicketOrderCard({ ticket, now, instructions, expanded, onExpand, onChanged, onShop }: { ticket: Ticket; now: number; instructions: string; expanded: boolean; onExpand: () => void; onChanged: () => Promise<void>; onShop: () => void }) {
  const { token, demoMode } = useSession();
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const lock = useRef(false);
  const status = canceled ? 'CANCELED' : ticketStatus(ticket, now);
  const opensAt = ticket.match.gateOpenAt ? Date.parse(ticket.match.gateOpenAt) : Date.parse(ticket.match.startsAt) - 2 * 3600000;
  const closesAt = ticket.match.gateCloseAt ? Date.parse(ticket.match.gateCloseAt) : Date.parse(ticket.match.startsAt) + 4 * 3600000;
  const gateOpen = ticket.match.entryEnabled && now >= opensAt && now < closesAt;
  async function cancel() {
    if (lock.current || demoMode) return;
    lock.current = true; setBusy(true); setError('');
    try { await clubApi.cancelTicket(token!, ticket.id); setCanceled(true); setConfirming(false); await onChanged(); }
    catch (err) { setError(messageOf(err)); await onChanged(); }
    finally { lock.current = false; setBusy(false); }
  }
  async function copy() {
    try { await Clipboard.setStringAsync(ticket.id); setCopied(true); setError(''); }
    catch { setError('Não foi possível copiar. Você pode selecionar o número abaixo.'); }
  }
  return <Panel style={{ gap: 14, borderRadius: 22 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><TicketIcon size={23} color={colors.primary} /><Text heading style={{ color: colors.text, fontWeight: '800', fontSize: 18, flex: 1 }}>{ticket.match.homeTeam} × {ticket.match.awayTeam}</Text></View>
    <Text style={{ color: colors.muted, fontSize: 14 }}>{matchDate(ticket.match.startsAt)}</Text>
    <View style={{ flexDirection: 'row', gap: 7 }}><MapPin size={17} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14, flex: 1 }}>{ticket.match.stadium}</Text></View>
    <View style={{ gap: 6, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}><Text style={{ color: colors.text, fontWeight: '600' }}>{ticket.sector.name} · {ticket.quantity} pessoa(s)</Text><Text heading style={{ color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: '800' }}>{money(ticket.priceCents)}</Text><Text accessibilityRole="alert" style={{ color: status === 'ISSUED' || status === 'USED' ? colors.primary : colors.gold, fontSize: 14, fontWeight: '700' }}>{ticketStatusLabels[status]}</Text></View>
    {status === 'PENDING' && <>
      <View style={{ flexDirection: 'row', gap: 8 }}><Clock size={19} color={colors.gold} /><Text style={{ color: colors.gold, fontSize: 14, flex: 1 }}>Reserva válida por {reservationCountdown(ticket, now)}</Text></View>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{instructions || 'Apresente o número do pedido ao clube para receber as orientações de pagamento. A emissão depende da confirmação do recebimento.'}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Após pagar, aguarde a conferência do clube. O app atualiza o estado do pedido automaticamente enquanto esta tela está aberta.</Text>
      <Button secondary label="Já paguei · consultar confirmação" disabled={busy} onPress={() => void onChanged()} />
      {!demoMode && <PixCheckout ticketId={ticket.id} onChanged={onChanged} />}
      {confirming ? <><Text style={{ color: colors.gold, fontSize: 14 }}>Cancelar libera os lugares. Confirme somente se esta reserva não foi paga.</Text><Button secondary label="Manter minha reserva" disabled={busy} onPress={() => setConfirming(false)} /><Button label="Confirmar cancelamento" loading={busy} onPress={() => void cancel()} /></> : <Button secondary label="Cancelar reserva não paga" disabled={busy || demoMode} onPress={() => setConfirming(true)} />}
    </>}
    {status === 'ISSUED' && <>
      <Text style={{ color: colors.text, fontSize: 14 }}>{ticket.remainingQuantity ?? ticket.quantity - (ticket.usedQuantity || 0)} entrada(s) restante(s) · {ticket.usedQuantity || 0} utilizada(s)</Text>
      {gateOpen && !demoMode ? <><Button label={expanded ? 'Ocultar QR e código' : 'Apresentar QR e código na portaria'} onPress={onExpand} />{expanded && <LiveTicketQr ticketId={ticket.id} onUsed={() => void onChanged()} />}</> : <Text style={{ color: colors.muted, fontSize: 14 }}>{now >= closesAt ? 'O período de entrada desta partida foi encerrado.' : !ticket.match.entryEnabled ? 'Aguarde a liberação da portaria pelo clube para apresentar o QR e o código.' : `QR e código disponíveis a partir de ${matchDate(new Date(opensAt).toISOString())}.`}</Text>}
    </>}
    {status === 'USED' && <View style={{ flexDirection: 'row', gap: 8 }}><CheckCircle size={20} color={colors.primary} /><Text style={{ color: colors.muted, flex: 1, fontSize: 14 }}>Todos os acessos deste pedido foram utilizados.</Text></View>}
    {(status === 'EXPIRED' || status === 'CANCELED') && <><Text style={{ color: colors.muted, fontSize: 14 }}>{status === 'EXPIRED' ? 'O prazo terminou sem emissão. Confira com o clube caso já tenha feito o pagamento.' : 'Os lugares desta reserva foram liberados.'}</Text><Button secondary label="Consultar jogos e disponibilidade" onPress={onShop} /></>}
    <Text selectable style={{ color: colors.muted, fontSize: 12 }}>Pedido: {ticket.id}</Text>
    <Button secondary label={copied ? 'Número copiado' : 'Copiar número do pedido'} onPress={() => void copy()} />
    {ticket.payment && <Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.payment.method === 'FREE' ? 'Gratuidade registrada' : 'Recebimento confirmado'} em {new Date(ticket.payment.confirmedAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })} (Patos).</Text>}
    {(ticket.payment?.refundedCents || 0) > 0 && <Text style={{ color: colors.gold, fontSize: 13 }}>Estorno confirmado: {money(ticket.payment!.refundedCents!)}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {demoMode && <Text style={{ color: colors.gold, fontSize: 12 }}>Demonstração sem validade de acesso.</Text>}
  </Panel>;
}
