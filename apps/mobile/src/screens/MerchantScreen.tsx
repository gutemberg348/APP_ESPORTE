import { club } from '../config/club';
import React, { useEffect, useState } from 'react';
import { View, Pressable, AppState } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ChevronLeft, Store } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import type { CashCharge } from '@nacional/shared/types';
import { Page, Title, Panel, Button } from '../components/ui';
import { Text, TextInput } from '../components/Typography';
import { PaymentChargeCard } from '../components/PaymentChargeCard';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { usePayments } from '../providers/PaymentsProvider';
import { money, messageOf } from '../utils/format';
import { parseAmount, requestKey, cashStatus } from '../utils/payments';
export function MerchantScreen({ onBack, onOpenSale }: { onBack: () => void; onOpenSale: (qr: string) => void }) {
  const { colors } = useTheme();
  const { demoMode } = useSession();
  const { wallet, setup, charges, loading, refresh, create, simulate, error: loadError } = usePayments();
  const [offerId, setOffer] = useState('');
  const [amount, setAmount] = useState('100,00');
  const [customer, setCustomer] = useState('');
  const [key, setKey] = useState(requestKey);
  const [sale, setSale] = useState<CashCharge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fixedQr, setFixedQr] = useState(false);
  const options = setup?.merchants.flatMap((merchant) => merchant.offers.map((offer) => ({ merchant, offer }))) || [];
  const selected = options.find((item) => item.offer.id === offerId) || options[0];
  const activeSale = charges.find((item) => item.id === sale?.id) || sale;
  const input = { color: colors.text, backgroundColor: colors.soft, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border };
  useEffect(() => { const poll = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 5000); return () => clearInterval(poll); }, [refresh]);
  async function perform(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }
  async function submit() {
    if (!selected) return;
    await perform(async () => { const charge = await create(selected.offer.id, parseAmount(amount), customer, key); setSale(charge); });
  }
  return <Page refreshing={loading} onRefresh={() => void refresh()}>
    <Pressable onPress={onBack} accessibilityRole="button" style={{ minHeight: 44, flexDirection: 'row', gap: 5, alignItems: 'center' }}><ChevronLeft size={20} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14 }}>Voltar</Text></Pressable>
    <Title title="Caixa do parceiro" subtitle="Gere a venda. O cliente paga com o banco dele." />
    {!options.length ? <Panel style={{ gap: 12 }}><Store color={colors.primary} /><Text style={{ color: colors.muted }}>{loading ? 'Carregando acesso…' : 'Este perfil não tem acesso a nenhum caixa. Entre com a conta de operador do parceiro.'}</Text></Panel> : <>
      <View style={{ gap: 8 }}>{options.map(({ merchant, offer }) => <Pressable key={offer.id} disabled={busy} onPress={() => { setOffer(offer.id); setKey(requestKey()); setSale(null); }} style={{ padding: 16, borderWidth: 1, borderColor: selected?.offer.id === offer.id ? colors.primary : colors.border, borderRadius: 16, gap: 6 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{merchant.name}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{offer.tenant.name} · {offer.cashbackBps / 100}% cashback · {offer.commissionBps / 100}% comissão</Text></Pressable>)}</View>
      {!setup?.enabled && <Text style={{ color: colors.gold }}>O gateway real ainda não está habilitado. Configure a simulação no ambiente de desenvolvimento para testar a API.</Text>}
      <Panel style={{ gap: 14 }}><Text style={{ color: colors.text, fontWeight: '700' }}>Nova venda · modelo B</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Valor da compra</Text><TextInput mask="money" value={amount} editable={!busy} onChangeText={(value) => { setAmount(value); setKey(requestKey()); }} keyboardType="decimal-pad" placeholder="100,00" accessibilityLabel="Valor da venda" style={input} /><Text style={{ color: colors.muted, fontSize: 14 }}>Código do torcedor · opcional</Text><TextInput value={customer} editable={!busy} autoCapitalize="characters" autoCorrect={false} onChangeText={(value) => { setCustomer(value); setKey(requestKey()); }} placeholder="NC-…" placeholderTextColor={colors.muted} accessibilityLabel="Código da carteira do torcedor" style={input} /><Text style={{ color: colors.muted, fontSize: 12 }}>Sem o código, o cliente lê o QR da venda com o app do clube para vincular sua conta antes de pagar.</Text>{demoMode && <Button secondary label="Usar meu código demo" onPress={() => { setCustomer(wallet?.customerCode || ''); setKey(requestKey()); }} />}<Button label="Gerar QR da venda" loading={busy} disabled={!setup?.enabled} onPress={() => void submit()} /></Panel>
      {activeSale && <><PaymentChargeCard charge={activeSale} cashier />{demoMode && activeSale.status === 'PENDING' && <Button secondary label="Abrir esta venda como torcedor" onPress={() => onOpenSale(activeSale.saleQr)} />}{setup?.demo && ['PENDING', 'PAID'].includes(activeSale.status) && <Button gold label={activeSale.status === 'PAID' ? 'Simular estorno total' : 'Simular confirmação de pagamento'} loading={busy} disabled={activeSale.status === 'PENDING' && !activeSale.customerLinked} onPress={() => void perform(async () => { await simulate(activeSale.id, activeSale.status === 'PAID' ? 'REFUNDED' : 'SETTLED'); })} />}<Button secondary label="Nova venda" onPress={() => { setSale(null); setKey(requestKey()); setCustomer(''); }} /></>}
      <Button secondary label={fixedQr ? 'Ocultar QR fixo' : 'Ver base do QR fixo · modelo A'} onPress={() => setFixedQr(!fixedQr)} />
      {fixedQr && selected && <Panel style={{ gap: 14 }}><View style={{ alignSelf: 'center', padding: 14, borderRadius: 12, backgroundColor: '#fff' }}><QRCode value={selected.merchant.fixedQr} size={150} /></View><Text style={{ color: colors.muted, fontSize: 14 }}>{selected.offer.customerQrEnabled ? 'O torcedor lê esse QR e informa o valor. A confirmação deve aparecer neste caixa.' : 'Modelo A preparado e desativado para esta parceria. Ainda não use esta placa no balcão.'}</Text><Button secondary label="Copiar QR fixo da loja" onPress={() => void perform(async () => { await Clipboard.setStringAsync(selected.merchant.fixedQr); })} /></Panel>}
      <Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Últimas vendas</Text>{charges.map((charge) => <Pressable key={charge.id} onPress={() => setSale(charge)} style={{ padding: 16, backgroundColor: colors.soft, borderRadius: 14, gap: 5 }}><Text style={{ color: colors.text }}>{charge.merchant.name} · {money(charge.amountCents)}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{cashStatus[charge.status]} · {charge.tenant.name}</Text></Pressable>)}
    </>}
    {!!(error || loadError) && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error || loadError}</Text>}
    {setup?.demo && <Text style={{ color: colors.muted, fontSize: 12 }}>Caixa demonstrativo. Nenhum Pix ou transferência real é criado.</Text>}
  </Page>;
}
