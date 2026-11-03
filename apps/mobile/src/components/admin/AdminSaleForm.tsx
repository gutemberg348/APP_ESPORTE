import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import type { AdminTicket, AdminSaleQuote } from '@nacional/shared/types';
import { Sheet } from '../Sheet';
import { Text } from '../Typography';
import { Button, Panel } from '../ui';
import { AdminField } from '../AdminForms';
import { useSession } from '../../providers/SessionProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { adminApi } from '../../services/admin';
import { money, messageOf } from '../../utils/format';

export function AdminSaleForm({ ticket, mode, onClose, onSaved }: { ticket: AdminTicket; mode: 'edit' | 'delete' | 'cancel'; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const { colors } = useTheme();
  const [sectorId, setSectorId] = useState(ticket.sector.id);
  const [quantity, setQuantity] = useState(ticket.quantity);
  const [reason, setReason] = useState('');
  const [quote, setQuote] = useState<AdminSaleQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const edit = mode === 'edit';
  const input = { ticketId: ticket.id, revision: ticket.revision, sectorId, quantity };
  useEffect(() => {
    if (!quote) return;
    const lifetime = Date.parse(quote.expiresAt) - Date.parse(quote.serverTime);
    const timer = setTimeout(() => setQuote(null), Math.max(0, lifetime));
    return () => clearTimeout(timer);
  }, [quote]);
  function close() { if (!lock.current) onClose(); }
  function changeSector(value: string) { if (lock.current) return; setSectorId(value); setQuote(null); setError(''); }
  function changeQuantity(value: number) { if (lock.current) return; setQuantity(value); setQuote(null); setError(''); }
  async function run(work: () => Promise<void>) {
    if (lock.current || !token) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); } catch (err) { setError(messageOf(err)); setQuote(null); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (edit && !quote) return;
    await run(async () => {
      if (edit) await adminApi.updateSale(token!, { ...input, expectedTotalCents: quote!.totalCents, reason: reason.trim() });
      else if (mode === 'delete') await adminApi.deleteSale(token!, { ticketId: ticket.id, revision: ticket.revision, reason: reason.trim() });
      else await adminApi.cancel(token!, ticket.id);
      await onSaved();
    });
  }
  return <Sheet visible title={edit ? 'Editar venda' : mode === 'delete' ? 'Excluir venda' : 'Cancelar reserva'} onClose={close}>
    <View style={{ gap: 3 }}><Text style={{ color: colors.text, fontWeight: '600' }}>{ticket.user.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.user.email}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.match.homeTeam} × {ticket.match.awayTeam}</Text><Text selectable style={{ color: colors.subtle, fontSize: 10 }}>Pedido {ticket.id}</Text></View>
    {edit ? <>
      <Text style={{ color: colors.muted, fontSize: 12 }}>A alteração recalcula o preço e o desconto atuais. O prazo original da reserva continua valendo.</Text>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Setor</Text>
      <View style={{ gap: 8 }}>{ticket.match.sectors.map((sector) => <Pressable key={sector.id} disabled={busy || !sector.salesEnabled} accessibilityRole="radio" accessibilityState={{ checked: sector.id === sectorId, disabled: busy || !sector.salesEnabled }} onPress={() => changeSector(sector.id)} style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: sector.id === sectorId ? colors.primary : colors.border, backgroundColor: sector.id === sectorId ? colors.primarySoft : colors.surface, opacity: sector.salesEnabled ? 1 : 0.5 }}><Text style={{ color: sector.id === sectorId ? colors.primary : colors.text, fontSize: 12 }}>{sector.name} · {money(sector.priceCents)}{!sector.salesEnabled ? ' · vendas pausadas' : ''}</Text></Pressable>)}</View>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>Quantidade de entradas</Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>{[1, 2, 3, 4].map((value) => <Pressable key={value} disabled={busy} onPress={() => changeQuantity(value)} accessibilityRole="radio" accessibilityLabel={`${value} entrada(s)`} accessibilityState={{ checked: quantity === value }} style={{ width: 46, height: 44, borderRadius: 8, borderWidth: 1, borderColor: quantity === value ? colors.primary : colors.border, backgroundColor: quantity === value ? colors.primarySoft : colors.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: quantity === value ? colors.primary : colors.text }}>{value}</Text></Pressable>)}</View>
      <AdminField label="Motivo da alteração · mínimo 5 caracteres" value={reason} onChange={setReason} />
      <Button secondary label="Conferir novo total e disponibilidade" loading={busy} onPress={() => void run(async () => { setQuote(await adminApi.quoteSale(token!, input)); })} />
      {quote && <Panel style={{ padding: 16, borderRadius: 8, gap: 5 }}><Text style={{ color: colors.muted, fontSize: 12 }}>{quote.quantity} × {quote.sector.name} · desconto de {quote.discountPercent}%</Text><Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Novo total: {money(quote.totalCents)}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Total anterior: {money(ticket.priceCents)}</Text>{quote.totalCents === 0 && <Text style={{ color: colors.gold, fontSize: 12 }}>Ao salvar, as entradas gratuitas serão emitidas automaticamente.</Text>}</Panel>}
    </> : <>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{ticket.quantity} × {ticket.sector.name} · {money(ticket.priceCents)}</Text>
      <Text style={{ color: colors.danger, fontSize: 13 }}>{mode === 'delete' ? 'Esta venda não paga será removida da lista e da conta do torcedor. A exclusão libera os lugares reservados e mantém o registro da ação na auditoria.' : 'A reserva será cancelada e os lugares liberados. O pedido continua no histórico.'}</Text>
      {mode === 'delete' && <AdminField label="Motivo da exclusão · mínimo 5 caracteres" value={reason} onChange={setReason} />}
    </>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>}
    <Button label={edit ? 'Salvar alteração da venda' : mode === 'delete' ? 'Confirmar exclusão da venda' : 'Confirmar cancelamento'} loading={busy} disabled={mode !== 'cancel' && (reason.trim().length < 5 || (edit && !quote))} onPress={() => void save()} />
    <Button secondary label="Voltar sem alterar" disabled={busy} onPress={close} />
  </Sheet>;
}
