import { club } from '../config/club';
import React, { useEffect, useState } from 'react';
import { AppState, View, Pressable } from 'react-native';
import { Wallet, ScanLine, ArrowUpRight, ArrowDownLeft, ChevronLeft } from 'lucide-react-native';
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
  const { wallet, charges, error: loadError, loading, refresh, resolve, claim, fixedCharge } = usePayments();
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
  useEffect(() => { if (initialQr) void read(initialQr).catch((err) => setError(messageOf(err))); }, [initialQr]);
  useEffect(() => {
    const poll = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 5000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { clearInterval(poll); subscription.remove(); };
  }, [refresh]);
  async function perform(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }
  return <Page refreshing={loading} onRefresh={() => void refresh()}>
    <Pressable accessibilityRole="button" onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }}><ChevronLeft size={20} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14 }}>Voltar</Text></Pressable>
    <Title title="Seu cashback" subtitle={`Sua rotina aproxima você do ${club.shortName}.`} />
    <Panel style={{ gap: 12, backgroundColor: colors.primarySoft }}><Wallet color={colors.primary} size={30} /><Text style={{ color: colors.muted, fontSize: 14 }}>Disponível{wallet?.demo ? ' · demonstração' : ''}</Text><Text heading style={{ color: colors.text, fontSize: 36, lineHeight: 46, fontWeight: '800' }}>{money(wallet?.availableCents || 0)}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Saldo em reais, separado dos pontos Zezito.</Text>{Boolean(wallet?.debtCents) && <Text style={{ color: colors.danger }}>Compensação de estorno: {money(wallet!.debtCents)}</Text>}</Panel>
    <Button label="Ler QR da venda" onPress={() => setScanner(true)} />
    {wallet && <Panel style={{ gap: 12 }}><Text style={{ color: colors.text, fontWeight: '700' }}>Seu código no caixa</Text><Text selectable style={{ color: colors.primary, fontSize: 14 }}>{wallet.customerCode}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>O vendedor pode usar esse código para vincular o cashback antes de gerar o Pix. Você paga com seu banco.</Text><Button secondary label="Copiar meu código" onPress={() => void perform(async () => { await Clipboard.setStringAsync(wallet.customerCode); setNotice('Código copiado.'); })} /></Panel>}
    {!!notice && <Text style={{ color: colors.primary }}>{notice}</Text>}
    {!!(error || loadError) && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error || loadError}</Text>}
    {activeSale && <PaymentChargeCard charge={activeSale} busy={busy} onClaim={() => void perform(async () => { const result = await claim(activeSale.saleCode); setSale(result); })} />}
    {fixed && <Panel style={{ gap: 12 }}><Text style={{ color: colors.text, fontWeight: '700' }}>QR fixo da loja · modelo A</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Esse fluxo usa o mesmo motor. A loja precisa habilitar a criação de cobrança pelo torcedor.</Text><TextInput value={amount} onChangeText={(value) => { setAmount(value); setKey(requestKey()); }} keyboardType="decimal-pad" placeholder="Valor da compra, ex. 100,00" placeholderTextColor={colors.muted} accessibilityLabel="Valor da compra" style={{ color: colors.text, backgroundColor: colors.soft, padding: 14, borderRadius: 12 }} /><Button label="Revisar cobrança da loja" loading={busy} onPress={() => void perform(async () => { const result = await fixedCharge(fixed, parseAmount(amount), key); setSale(result); setFixed(''); })} /></Panel>}
    <Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Movimentações</Text>
    {wallet?.entries.length ? wallet.entries.map((entry) => <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>{entry.amountCents > 0 ? <ArrowDownLeft size={24} color={colors.primary} /> : <ArrowUpRight size={24} color={colors.gold} />}<View style={{ flex: 1 }}><Text style={{ color: colors.text }}>{entry.merchant}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{entry.kind === 'CASHBACK' ? 'Cashback confirmado' : 'Estorno da compra'} · {new Date(entry.createdAt).toLocaleDateString('pt-BR')}</Text></View><Text style={{ color: entry.amountCents > 0 ? colors.primary : colors.gold }}>{entry.amountCents > 0 ? '+' : '−'}{money(Math.abs(entry.amountCents))}</Text></View>) : <Text style={{ color: colors.muted }}>Após a confirmação da compra, seu cashback aparece aqui.</Text>}
    {!!wallet?.charges.length && <><Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Suas compras</Text>{wallet.charges.map((charge) => <Pressable key={charge.id} onPress={() => setSale(charge)} style={{ padding: 16, borderRadius: 16, backgroundColor: colors.soft, gap: 5 }}><Text style={{ color: colors.text }}>{charge.merchant.name} · {money(charge.amountCents)}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{cashStatus[charge.status]}</Text></Pressable>)}</>}
    <Text style={{ color: colors.muted, fontSize: 12 }}>Uso do saldo em ingressos, planos e produtos será habilitado após a integração financeira. {wallet?.demo ? 'Saldo demonstrativo sem valor monetário.' : ''}</Text>
    {scanner && <PaymentQrScanner onRead={read} onClose={() => setScanner(false)} />}
  </Page>;
}
