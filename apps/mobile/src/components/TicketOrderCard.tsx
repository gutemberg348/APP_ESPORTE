import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ticket as TicketIcon, Check, CheckCircle, Copy, MapPin, RefreshCw, XCircle } from 'lucide-react-native';
import type { Ticket } from '@nacional/shared/types';
import { Panel, Button, TextAction } from './ui';
import { Text } from './Typography';
import { TicketGateAccess } from './TicketGateAccess';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { clubApi } from '../services/club';
import { money, matchDate, messageOf } from '../utils/format';
import { ticketStatus, ticketStatusLabels } from '../utils/ticket-state';
import { PixCheckout } from './PixCheckout';

export function TicketOrderCard({ ticket, now, instructions, onChanged, onShop }: { ticket: Ticket; now: number; instructions: string; onChanged: () => Promise<void>; onShop: () => void }) {
  const { token, demoMode } = useSession();
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const lock = useRef(false);
  const status = canceled ? 'CANCELED' : ticketStatus(ticket, now);
  async function cancel() {
    if (lock.current || demoMode) return;
    lock.current = true; setBusy(true); setError('');
    try { await clubApi.cancelTicket(token!, ticket.id); setCanceled(true); setConfirming(false); await onChanged(); }
    catch (err) { setError(messageOf(err)); await onChanged(); }
    finally { lock.current = false; setBusy(false); }
  }
  async function copy() {
    try { await Clipboard.setStringAsync(ticket.id); setCopied(true); setCopyFailed(false); setError(''); }
    catch { setCopyFailed(true); setError('Não foi possível copiar. Você pode selecionar o número abaixo.'); }
  }
  return <Panel style={{ gap: 10, padding: 16, borderRadius: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><TicketIcon size={23} color={colors.primary} /><Text heading style={{ color: colors.text, fontWeight: '800', fontSize: 18, flex: 1 }}>{ticket.match.homeTeam} × {ticket.match.awayTeam}</Text></View>
    <View style={{ flexDirection: 'row', gap: 7 }}><MapPin size={17} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14, flex: 1 }}>{ticket.match.stadium} · {matchDate(ticket.match.startsAt)}</Text></View>
    <View style={{ gap: 6, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}><Text style={{ color: colors.text, fontWeight: '600' }}>{ticket.sector.name} · {ticket.quantity} {ticket.quantity === 1 ? 'ingresso' : 'ingressos'}</Text><Text heading style={{ color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: '800' }}>{money(ticket.priceCents)}</Text><Text accessibilityRole="alert" style={{ color: status === 'ISSUED' || status === 'USED' ? colors.primary : colors.gold, fontSize: 14, fontWeight: '700' }}>{ticketStatusLabels[status]}</Text></View>
    {status === 'PENDING' && <>
      <PixCheckout ticketId={ticket.id} reservation={{ expiresAt: ticket.expiresAt, serverTime: ticket.serverTime, instructions }} onChanged={onChanged} />
      <TextAction icon={RefreshCw} label="Consultar pagamento" disabled={busy} onPress={() => void onChanged()} />
      {confirming ? <><Text style={{ color: colors.gold, fontSize: 14 }}>Cancelar libera os lugares. Já pagou? Mantenha a reserva.</Text><Button secondary label="Manter minha reserva" disabled={busy} onPress={() => setConfirming(false)} /><Button label="Confirmar cancelamento" loading={busy} onPress={() => void cancel()} /></> : <TextAction icon={XCircle} danger label="Cancelar reserva" disabled={busy || demoMode} onPress={() => setConfirming(true)} />}
    </>}
    {status === 'ISSUED' && <>
      <Text style={{ color: colors.text, fontSize: 14 }}>{ticket.remainingQuantity ?? ticket.quantity - (ticket.usedQuantity || 0)} entrada(s) restante(s) · {ticket.usedQuantity || 0} utilizada(s)</Text>
      <TicketGateAccess ticketId={ticket.id} match={ticket.match} now={now} onUsed={() => void onChanged()} />
    </>}
    {status === 'USED' && <View style={{ flexDirection: 'row', gap: 8 }}><CheckCircle size={20} color={colors.primary} /><Text style={{ color: colors.muted, flex: 1, fontSize: 14 }}>Todos os acessos deste pedido foram utilizados.</Text></View>}
    {(status === 'EXPIRED' || status === 'CANCELED') && <><Text style={{ color: colors.muted, fontSize: 14 }}>{status === 'EXPIRED' ? 'O prazo terminou sem emissão. Confira com o clube caso já tenha feito o pagamento.' : 'Os lugares desta reserva foram liberados.'}</Text><Button secondary label="Consultar jogos e disponibilidade" onPress={onShop} /></>}
    <View style={{ borderTopWidth: 1, borderColor: colors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>Pedido #{ticket.id.slice(0, 8).toUpperCase()}</Text>
      <TextAction icon={copied ? Check : Copy} label={copied ? 'Copiado' : 'Copiar nº'} accessibilityLabel="Copiar número completo do pedido" onPress={() => void copy()} />
    </View>
    {copyFailed && <Text selectable style={{ color: colors.text }}>{ticket.id}</Text>}
    {ticket.payment && <Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.payment.method === 'FREE' ? 'Gratuidade registrada' : 'Recebimento confirmado'} em {new Date(ticket.payment.confirmedAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })} (Patos).</Text>}
    {(ticket.payment?.refundedCents || 0) > 0 && <Text style={{ color: colors.gold, fontSize: 13 }}>Estorno confirmado: {money(ticket.payment!.refundedCents!)}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {demoMode && <Text style={{ color: colors.gold, fontSize: 12 }}>Demonstração sem validade de acesso.</Text>}
  </Panel>;
}
