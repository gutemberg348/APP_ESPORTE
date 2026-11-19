import React, { useEffect, useState } from 'react';
import { AppState, View, Pressable } from 'react-native';
import { Wallet, ArrowUpRight, ArrowDownLeft, ChevronLeft } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import type { CashCharge } from '@nacional/shared/types';
import { Page, Title, Panel, Button } from '../components/ui';
import { Text, TextInput } from '../components/Typography';
import { PaymentQrScanner } from '../components/PaymentQrScanner';
import { PaymentChargeCard } from '../components/PaymentChargeCard';
import { useTheme } from '../theme/ThemeProvider';
import { usePayments } from '../providers/PaymentsProvider';
import { money, messageOf } from '../utils/format';
import { parsePaymentQr, parseAmount, requestKey, cashStatus } from '../utils/payments';
export function CashbackScreen({ onBack, initialQr }: { onBack: () => void; initialQr?: string }) {
  const { colors } = useTheme();
  const { wallet, setup, charges, error: loadError, loading, refresh, resolve, claim, fixedCharge } = usePayments();
  const canCollect = setup?.enabled === true;
  const [scanner, setScanner] = useState(false);
  const [sale, setSale] = useState<CashCharge | null>(null);
  const [fixed, setFixed] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [key, setKey] = useState(requestKey);
  const activeSale = wallet?.charges.find((item) => item.id === sale?.id) || charges.find((item) => item.id === sale?.id) || sale;
  async function read(value: string) {
    const qr = parsePaymentQr(value);
    if (qr.type === 'sale') { const charge = await resolve(qr.code); setSale(charge); setFixed(''); }
    else { setFixed(qr.code); setSale(null); }
    setError(''); setScanner(false);
  }
  useEffect(() => { if (initialQr && canCollect) void read(initialQr).catch((err) => setError(messageOf(err))); }, [initialQr, canCollect]);
  useEffect(() => {
    const poll = canCollect ? setInterval(() => { if (!AppState.currentState || AppState.currentState === 'active') void refresh(); }, 5000) : null;
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { if (poll) clearInterval(poll); subscription.remove(); };
  }, [refresh, canCollect]);
  async function perform(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }
  return <Page refreshing={loading} onRefresh={() => void refresh()}>
    <Pressable accessibilityRole="button" onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }}><ChevronLeft size={20} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14 }}>Voltar</Text></Pressable>
    <Title title="Meu cashback" />
    <Panel style={{ gap: 10, backgroundColor: colors.primarySoft }}><Wallet color={colors.primary} size={26} /><Text style={{ color: colors.muted, fontSize: 14 }}>Saldo de cashback{wallet?.demo ? ' · demonstração' : ''}</Text><Text heading style={{ color: colors.text, fontSize: 36, lineHeight: 46, fontWeight: '800' }}>{wallet ? money(wallet.availableCents) : '—'}</Text>{Boolean(wallet?.debtCents) && <Text style={{ color: colors.danger }}>Compensação de estorno: {money(wallet!.debtCents)}</Text>}</Panel>
    {canCollect && wallet && <Panel style={{ gap: 12 }}>
      <Text heading style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Comprar com cashback</Text>
      <Text style={{ color: colors.muted, lineHeight: 21 }}>Peça o QR de cashback ao caixa do parceiro. Ao escanear, você confere o valor e vincula a compra à sua conta.</Text>
      <Button label="Escanear QR do parceiro" onPress={() => setScanner(true)} />
      <Button secondary label="Copiar meu código para o caixa" onPress={() => void perform(async () => { await Clipboard.setStringAsync(wallet.customerCode); setNotice('Código copiado. Envie ao caixa antes de finalizar a venda.'); })} />
    </Panel>}
    {setup && !canCollect && <Text style={{ color: colors.muted, lineHeight: 21 }}>As compras com cashback estão pausadas. Seu saldo e histórico continuam disponíveis para consulta.</Text>}
    {!!notice && <Text style={{ color: colors.primary }}>{notice}</Text>}
    {!!(error || loadError) && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error || loadError}</Text>}
    {!!loadError && <Button secondary label="Atualizar carteira" disabled={loading} onPress={() => void refresh()} />}
    {activeSale && <PaymentChargeCard charge={activeSale} busy={busy} onClaim={canCollect ? () => void perform(async () => { const result = await claim(activeSale.saleCode); setSale(result); }) : undefined} />}
    {canCollect && fixed && <Panel style={{ gap: 12 }}><Text style={{ color: colors.text, fontWeight: '700' }}>Compra no parceiro</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Informe o valor combinado com o caixa para conferir a cobrança.</Text><TextInput value={amount} onChangeText={(value) => { setAmount(value); setKey(requestKey()); }} mask="money" keyboardType="decimal-pad" placeholder="R$ 0,00" placeholderTextColor={colors.muted} accessibilityLabel="Valor da compra" style={{ color: colors.text, backgroundColor: colors.soft, padding: 14, borderRadius: 12 }} /><Button label="Conferir cobrança" loading={busy} onPress={() => void perform(async () => { const result = await fixedCharge(fixed, parseAmount(amount), key); setSale(result); setFixed(''); })} /></Panel>}
    <Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Movimentações</Text>
    {wallet?.entries.length ? wallet.entries.map((entry) => <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>{entry.amountCents > 0 ? <ArrowDownLeft size={24} color={colors.primary} /> : <ArrowUpRight size={24} color={colors.gold} />}<View style={{ flex: 1 }}><Text style={{ color: colors.text }}>{entry.merchant}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{entry.kind === 'CASHBACK' ? 'Cashback confirmado' : 'Estorno da compra'} · {new Date(entry.createdAt).toLocaleDateString('pt-BR')}</Text></View><Text style={{ color: entry.amountCents > 0 ? colors.primary : colors.gold }}>{entry.amountCents > 0 ? '+' : '−'}{money(Math.abs(entry.amountCents))}</Text></View>) : <Text style={{ color: colors.muted }}>{wallet ? 'Nenhuma movimentação de cashback.' : loading ? 'Carregando movimentações…' : 'Extrato indisponível no momento.'}</Text>}
    {!!wallet?.charges.length && <><Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Suas compras</Text>{wallet.charges.map((charge) => <Pressable key={charge.id} onPress={() => setSale(charge)} style={{ padding: 16, borderRadius: 16, backgroundColor: colors.soft, gap: 5 }}><Text style={{ color: colors.text }}>{charge.merchant.name} · {money(charge.amountCents)}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{cashStatus[charge.status]}</Text></Pressable>)}</>}
    {canCollect && scanner && <PaymentQrScanner title="Escanear QR do parceiro" manualLabel="Conferir compra" placeholder="Cole o link fornecido pelo caixa" onRead={read} onClose={() => setScanner(false)} />}
  </Page>;
}
