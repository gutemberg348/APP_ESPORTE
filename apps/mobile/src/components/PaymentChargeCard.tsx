import { club } from '../config/club';
import React, { useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { BadgeCheck, ShieldCheck } from 'lucide-react-native';
import type { CashCharge } from '@nacional/shared/types';
import { Panel, Button } from './ui';
import { Text } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import { money } from '../utils/format';
import { cashStatus } from '../utils/payments';
import { PixCheckout } from './PixCheckout';
import { usePayments } from '../providers/PaymentsProvider';
export function PaymentChargeCard({ charge, cashier = false, onClaim, busy = false }: { charge: CashCharge; cashier?: boolean; onClaim?: () => void; busy?: boolean }) {
  const { colors, tone } = useTheme();
  const { refresh } = usePayments();
  const [copied, setCopied] = useState('');
  const effectiveStatus = charge.status === 'PENDING' && Date.parse(charge.expiresAt) <= Date.now() ? 'EXPIRED' : charge.status;
  const payable = !charge.demo && charge.customerLinked && Boolean(charge.pixPayload) && effectiveStatus === 'PENDING';
  async function copy(value: string) { try { await Clipboard.setStringAsync(value); setCopied('Copiado.'); } catch { setCopied('Não foi possível copiar.'); } }
  return <Panel style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><ShieldCheck size={24} color={colors.primary} /><Text style={{ color: colors.text, flex: 1, fontWeight: '700' }}>{charge.merchant.name}</Text></View>
    <Text heading style={{ color: colors.text, fontSize: 32, lineHeight: 42, fontWeight: '800' }}>{money(charge.amountCents)}</Text>
    <Text style={{ color: colors.primary }}>{cashStatus[effectiveStatus]}{charge.demo ? ' · demo' : ''}</Text>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.muted, fontSize: 14 }}>Cashback desta compra</Text><Text style={{ color: colors.gold, fontWeight: '700' }}>{money(charge.cashbackCents)}</Text></View>
    {cashier && <><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted, fontSize: 14 }}>Repasse à loja</Text><Text style={{ color: colors.text }}>{money(charge.merchantCents)}</Text></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted, fontSize: 14 }}>Comissão da plataforma</Text><Text style={{ color: colors.text }}>{money(charge.commissionCents)}</Text></View><Text style={{ color: colors.muted, fontSize: 12 }}>Tarifa do gateway: {money(charge.gatewayFeeCents)}{charge.demo ? ' · simulação sem tarifa' : ''}</Text></>}
    <Text style={{ color: charge.customerLinked ? colors.primary : colors.gold, fontSize: 14 }}>{charge.customerLinked ? 'Cashback vinculado ao torcedor' : 'O torcedor precisa vincular esta compra'}</Text>
    {cashier && effectiveStatus === 'PENDING' && <><View style={{ alignItems: 'center', gap: 10 }}><View style={{ padding: 16, borderRadius: 16, backgroundColor: '#fff' }}><QRCode value={payable ? charge.pixPayload! : charge.saleQr} size={180} color={tone('#08150f')} /></View><Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>{payable ? 'QR Pix · pague com o aplicativo do banco' : `QR da venda · leia com o app do ${club.shortName}`}</Text></View><Button secondary label={payable ? 'Copiar Pix' : 'Copiar link da venda'} onPress={() => void copy(payable ? charge.pixPayload! : charge.saleQr)} /></>}
    {!cashier && onClaim && !charge.customerLinked && effectiveStatus === 'PENDING' && <Button label="Vincular cashback à minha conta" loading={busy} onPress={onClaim} />}
    {!cashier && payable && <Button label="Copiar Pix para pagar no banco" onPress={() => void copy(charge.pixPayload!)} />}
    {!cashier && !charge.demo && charge.customerLinked && effectiveStatus === 'PENDING' && <PixCheckout chargeId={charge.id} initialIntentId={charge.paymentIntentId} onChanged={refresh} />}
    {effectiveStatus === 'PAID' && <View style={{ flexDirection: 'row', gap: 8 }}><BadgeCheck size={20} color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 14, flex: 1 }}>Cashback registrado no extrato{charge.demo ? ' demonstrativo' : ''}.</Text></View>}
    {charge.demo && <Text style={{ color: colors.muted, fontSize: 12 }}>Demonstração sem dinheiro real. Este QR não é um Pix pagável.</Text>}
    {!charge.demo && !charge.pixPayload && <Text style={{ color: colors.muted, fontSize: 14 }}>O Pix será disponibilizado após a vinculação do torcedor e a habilitação do gateway.</Text>}
    {effectiveStatus === 'PENDING' && <Text style={{ color: colors.muted, fontSize: 12 }}>Validade: {new Date(charge.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Só entregue a compra após a confirmação no caixa.</Text>}
    {!!copied && <Text accessibilityRole="alert" style={{ color: colors.primary }}>{copied}</Text>}
  </Panel>;
}
