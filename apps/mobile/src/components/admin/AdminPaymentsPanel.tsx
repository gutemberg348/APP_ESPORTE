import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import type { AdminPixIntent } from '@nacional/shared/types';
import { useSession } from '../../providers/SessionProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { pixApi } from '../../services/pix';
import { Text } from '../Typography';
import { Panel } from '../ui';
import { Sheet } from '../Sheet';
import { AdminField, AdminToggle } from '../AdminForms';
import { AdminAction, AdminBadge, AdminTable, useDesktopAdmin } from './AdminLayout';
import { AdminMenu } from './AdminControls';
import { pixStates } from '../PixCheckout';
import { money, messageOf } from '../../utils/format';
export function AdminPaymentsPanel({ refreshKey }: { refreshKey: number }) {
  const { token } = useSession(), { colors } = useTheme(), desktop = useDesktopAdmin();
  const [rows, setRows] = useState<AdminPixIntent[]>([]), [offset, setOffset] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [refund, setRefund] = useState<AdminPixIntent | null>(null), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const sequence = useRef(0), lock = useRef(false);
  useEffect(() => {
    let alive = true, running = false;
    const version = ++sequence.current;
    async function load() {
      if (!token || running || AppState.currentState !== 'active') return;
      running = true;
      try { const fresh = await pixApi.adminList(token, offset); if (alive && sequence.current === version) { setRows(fresh); setError(''); } }
      catch (err) { if (alive && sequence.current === version) setError(messageOf(err)); }
      finally { running = false; if (alive) setLoading(false); }
    }
    setLoading(true); setRows([]); void load(); const timer = setInterval(() => void load(), 10000);
    return () => { alive = false; clearInterval(timer); sequence.current++; };
  }, [token, offset, refreshKey]);
  async function perform(work: () => Promise<unknown>) {
    if (lock.current || !token) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); setRows(await pixApi.adminList(token, offset)); }
    catch (err) { setError(messageOf(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  const actions = (row: AdminPixIntent) => row.provider !== 'sicredi' ? <AdminBadge label="Somente consulta" tone="neutral" /> : <AdminMenu disabled={busy} items={[
    { label: 'Conciliar agora', onPress: () => void perform(() => pixApi.reconcile(token!, row.id)) },
    ...(row.providerReference && !['CANCELED', 'REFUNDED'].includes(row.state) ? [{ label: 'Solicitar estorno', danger: true, onPress: () => { setRefund(row); setReason(''); setConfirmed(false); } }] : []),
  ]} />;
  const badge = (row: AdminPixIntent) => <View style={{ gap: 5 }}><AdminBadge label={pixStates[row.state]} tone={row.state === 'RECEIVED' ? 'success' : row.state === 'REVIEW' ? 'danger' : 'warning'} />{row.failureCode && <Text selectable style={{ color: colors.subtle, fontSize: 10 }}>{row.failureCode}</Text>}</View>;
  return <View style={{ gap: 18 }}><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>Acompanhe os pagamentos Pix, confira a conciliação e solicite devoluções. A atualização ocorre automaticamente a cada 10 segundos enquanto esta página está aberta. Excluir uma venda não solicita estorno.</Text>{!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {desktop ? <AdminTable minWidth={900} loading={loading} columns={[{ label: 'Pedido / protocolo', flex: 1.6 }, { label: 'Valor', width: 115 }, { label: 'Situação', flex: 1.2 }, { label: 'Atualizado', width: 150 }, { label: 'Ações', width: 90 }]} rows={rows.map((row) => ({ id: row.id, cells: [<View style={{ gap: 5 }}><Text style={{ color: colors.text, fontSize: 12 }}>{row.provider === 'sicredi' ? 'Sicredi · ' : 'Asaas · '}{row.ticketId ? 'Ingresso' : row.shopOrderId ? 'Pedido da loja' : 'Compra com cashback'} · {row.environment === 'sandbox' ? 'Sandbox' : 'Produção'}</Text><Text selectable style={{ color: colors.subtle, fontSize: 10 }}>{row.ticketId || row.shopOrderId || row.chargeId}</Text><Text selectable style={{ color: colors.subtle, fontSize: 10 }}>{row.id}</Text><Text selectable style={{ color: colors.subtle, fontSize: 10 }}>{row.providerReference || 'Aguardando geração'}</Text></View>, <View style={{ gap: 5 }}><Text style={{ color: colors.text }}>{money(row.amountCents)}</Text>{row.refundedCents > 0 && <Text style={{ color: colors.gold, fontSize: 10 }}>Estornado: {money(row.refundedCents)}</Text>}</View>, badge(row), <Text style={{ color: colors.muted, fontSize: 11 }}>{new Date(row.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</Text>, actions(row)] }))} empty="Nenhum pagamento Pix neste ambiente." /> : <>{rows.map((row) => <Panel key={row.id} style={{ gap: 10, padding: 18 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{money(row.amountCents)} · {row.provider === 'sicredi' ? 'Sicredi' : 'Asaas'} · {row.environment}</Text>{badge(row)}<Text selectable style={{ color: colors.muted, fontSize: 11 }}>{row.ticketId || row.shopOrderId || row.chargeId}</Text><Text selectable style={{ color: colors.subtle, fontSize: 10 }}>{row.id}</Text>{row.refundedCents > 0 && <Text style={{ color: colors.gold }}>Estornado: {money(row.refundedCents)}</Text>}{actions(row)}</Panel>)}{loading && <Text style={{ color: colors.muted }}>Consultando pagamentos…</Text>}</>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><AdminAction label="Anterior" disabled={busy || loading || offset === 0} onPress={() => setOffset(Math.max(0, offset - 25))} /><AdminAction label="Próxima" disabled={busy || loading || rows.length < 25} onPress={() => setOffset(offset + 25)} /></View>
    {refund && <Sheet visible title="Solicitar estorno do pagamento" onClose={() => { if (!busy) setRefund(null); }}><Text style={{ color: colors.text, fontWeight: '700' }}>{money(refund.amountCents - refund.refundedCents)} · saldo a devolver</Text><Text style={{ color: colors.muted }}>O pedido de devolução será enviado ao provedor deste pagamento. O ingresso ou a preparação do pedido será bloqueado imediatamente; a devolução só aparecerá como concluída após confirmação do provedor.</Text><AdminField label="Motivo da devolução" value={reason} onChange={setReason} /><AdminToggle label="Conferi o pagamento e autorizo a devolução do saldo" value={confirmed} onChange={setConfirmed} /><AdminAction primary label={busy ? 'Solicitando…' : 'Confirmar solicitação de estorno'} disabled={busy || !confirmed || reason.trim().length < 5} onPress={() => void perform(async () => { await pixApi.refund(token!, refund.id, reason.trim()); setRefund(null); })} />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}</Sheet>}
  </View>;
}
