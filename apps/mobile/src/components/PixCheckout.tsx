import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Timer, ChevronDown, ChevronUp } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import type { PixIntent, BillingProfile } from '@nacional/shared/types';
import { Text, TextInput } from './Typography';
import { Button, Panel, TextAction } from './ui';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { pixApi } from '../services/pix';
import { messageOf, money } from '../utils/format';
import { useServerClock } from '../hooks/useServerClock';
export const pixStates: Record<PixIntent['state'], string> = { QUEUED: 'Preparando seu Pix…', CREATING: 'Gerando cobrança…', PENDING: 'Aguardando pagamento', PROCESSING: 'Pagamento em análise pelo provedor', RECEIVED: 'Pagamento confirmado', REFUNDING: 'Estorno solicitado · aguardando confirmação', REFUNDED: 'Pagamento estornado', CANCELED: 'Cobrança cancelada', REVIEW: 'Pagamento em conciliação', PARTIAL_REFUND: 'Pagamento parcialmente estornado' };
export function PixCheckout({ ticketId, chargeId, shopOrderId, membershipOrderId, initialIntentId, reservation, onChanged }: { ticketId?: string; chargeId?: string; shopOrderId?: string; membershipOrderId?: string; initialIntentId?: string | null; reservation?: { expiresAt: string | null; serverTime?: string; instructions: string }; onChanged: () => Promise<unknown> }) {
  const { token, demoMode } = useSession(), { colors } = useTheme();
  const [profile, setProfile] = useState<BillingProfile | null>(null), [intent, setIntent] = useState<PixIntent | null>(null), [document, setDocument] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const current = useRef(0), lock = useRef(false), lastState = useRef(''), callback = useRef(onChanged);
  const [details, setDetails] = useState(false);
  const [qrWidth, setQrWidth] = useState(0);
  const { now } = useServerClock(intent?.serverTime || reservation?.serverTime);
  const deadlines = [intent?.expiresAt, reservation?.expiresAt].map(value => Date.parse(value || '')).filter(Number.isFinite);
  const remaining = deadlines.length ? Math.max(0, Math.ceil((Math.min(...deadlines) - now) / 1000)) : null;
  const expired = remaining === 0;
  const waiting = !intent || ['QUEUED', 'CREATING', 'PENDING'].includes(intent.state);
  const pixPayload = intent?.state === 'PENDING' && remaining !== null && !expired ? intent.pixPayload : null;
  const manual = demoMode || profile?.enabled === false;
  useEffect(() => { setCopied(false); }, [pixPayload]);
  callback.current = onChanged;
  function accept(value: PixIntent | null) {
    setIntent(value);
    if (value && lastState.current !== value.state && ['RECEIVED', 'REFUNDED', 'PARTIAL_REFUND', 'CANCELED'].includes(value.state)) void callback.current().catch(() => {});
    lastState.current = value?.state || '';
  }
  async function readIntent(access: string) {
    if (ticketId) return pixApi.ticket(access, ticketId);
    if (shopOrderId) return pixApi.shop(access, shopOrderId);
    if (initialIntentId) return pixApi.intent(access, initialIntentId);
    return null;
  }
  async function load(access: string, version: number) {
    try {
      const [fresh, payment] = await Promise.all([pixApi.profile(access), readIntent(access)]);
      if (current.current !== version) return;
      setProfile(fresh);
      accept(payment);
      setError('');
    } catch (err) {
      if (current.current === version) setError(messageOf(err));
    }
  }
  useEffect(() => {
    const version = ++current.current;
    if (!token || demoMode) return;
    setError('');
    void load(token, version);
    return () => { current.current++; };
  }, [token, demoMode, ticketId, shopOrderId, initialIntentId]);
  useEffect(() => {
    if (!token || !intent || ['REFUNDED', 'CANCELED'].includes(intent.state)) return;
    let alive = true, polling = false;
    const version = current.current, id = intent.id;
    const poll = async () => {
      if (polling || AppState.currentState !== 'active') return;
      polling = true;
      try { const fresh = await pixApi.intent(token, id); if (alive && version === current.current) { accept(fresh); setError(''); } }
      catch (err) { if (alive) setError(messageOf(err)); }
      finally { polling = false; }
    };
    const timer = setInterval(() => void poll(), intent.state === 'RECEIVED' ? 15000 : 4000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void poll(); });
    return () => { alive = false; clearInterval(timer); subscription.remove(); };
  }, [token, demoMode, ticketId, shopOrderId, initialIntentId, intent?.id, intent?.state]);
  async function generate() {
    if (!token || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const version = current.current;
    try {
      if (!profile?.configured) { const fresh = await pixApi.saveProfile(token, document); if (version !== current.current) return; setProfile(fresh); setDocument(''); }
      const value = ticketId ? await pixApi.createTicket(token, ticketId) : shopOrderId ? await pixApi.createShop(token, shopOrderId) : await pixApi.createCash(token, chargeId!);
      if (version === current.current) accept(value);
    } catch (err) { if (version === current.current) setError(messageOf(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  if (manual && !reservation) return null;
  const clockColor = remaining !== null && remaining <= 60 ? colors.danger : colors.gold;
  const qrSize = Math.min(196, Math.floor(qrWidth) - 32);
  return <Panel style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.soft }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
      <Text heading style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{manual ? 'Pagamento da reserva' : 'Pagamento Pix'}</Text>
      {intent && !reservation && <Text heading style={{ color: colors.text, fontWeight: '800', fontSize: 20, lineHeight: 28 }}>{money(intent.amountCents)}</Text>}
    </View>
    {waiting && remaining !== null && <View accessible accessibilityLabel={expired ? 'Prazo encerrado' : `Tempo para pagar, ${Math.floor(remaining / 60)} minutos e ${remaining % 60} segundos`}
      style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Timer size={19} color={clockColor} />
      <Text style={{ color: colors.muted, fontSize: 13, flexGrow: 1 }}>{expired ? 'Prazo encerrado' : 'Tempo para pagar'}</Text>
      <Text heading style={{ color: clockColor, fontWeight: '800', fontSize: 25, lineHeight: 34, fontVariant: ['tabular-nums'] }}>
        {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}
      </Text>
    </View>}
    {manual ? <Text style={{ color: colors.muted, fontSize: 14 }}>{reservation?.instructions || 'Consulte o clube com o número do pedido.'}</Text> : <>
      {profile?.environment === 'sandbox' && <Text style={{ color: colors.gold, fontSize: 12 }}>Ambiente de testes · sem dinheiro real</Text>}
      {!profile && !intent && !error && <ActivityIndicator accessibilityLabel="Carregando pagamento" color={colors.primary} />}
      {profile && !intent && !membershipOrderId && !expired && <>
        {!profile.configured && <TextInput accessibilityLabel="CPF ou CNPJ do pagador" value={document} onChangeText={setDocument} keyboardType="number-pad" autoComplete="off" maxLength={25} placeholder="CPF ou CNPJ do pagador" placeholderTextColor={colors.muted} style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text }} />}
        {profile.documentLast4 && <Text style={{ color: colors.muted, fontSize: 12 }}>Documento final {profile.documentLast4}</Text>}
        <Button label="Gerar Pix" loading={busy} disabled={!profile.configured && !document.trim()} onPress={() => void generate()} />
      </>}
      {intent && <>
        {(!pixPayload && !(expired && intent.state === 'PENDING')) && <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontWeight: '700' }}>{pixStates[intent.state]}</Text>}
        {pixPayload && <>
          <View onLayout={event => setQrWidth(event.nativeEvent.layout.width)} style={{ alignItems: 'center' }}>
            {qrSize > 0 && <View accessible accessibilityLabel="QR Code para pagar com Pix" style={{ padding: 16, backgroundColor: '#fff', borderRadius: 12 }}>
              <QRCode value={pixPayload} size={qrSize} color="#111111" backgroundColor="#ffffff" />
            </View>}
          </View>
          <Button label={copied ? 'Código Pix copiado ✓' : 'Copiar código Pix'} onPress={() => void Clipboard.setStringAsync(pixPayload).then(() => setCopied(true)).catch(() => setError('Não foi possível copiar o Pix. Tente novamente.'))} />
          <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>Confirmação automática após o pagamento.</Text>
        </>}
        {intent.failureCode === 'PAYMENT_PROVIDER_NOT_ACTIVE' && <Text style={{ color: colors.danger }}>Cobrança de outro provedor. Consulte o clube antes de pagar.</Text>}
        {(intent.state === 'REVIEW' || (intent.failureCode?.startsWith('SICREDI_') && waiting)) && <Text style={{ color: colors.gold, fontSize: 13 }}>Aguarde a conferência do banco antes de pagar novamente.</Text>}
        {intent.state === 'RECEIVED' && <Text style={{ color: colors.muted, fontSize: 13 }}>{membershipOrderId ? 'Carteirinha disponível na aba Carteira.' : ticketId ? 'Ingresso disponível em Meus ingressos.' : shopOrderId ? 'Acompanhe a entrega em Meus pedidos.' : 'Consulte o cashback no extrato.'}</Text>}
        {intent.refundedCents > 0 && <Text style={{ color: colors.muted, fontSize: 13 }}>Valor estornado · {money(intent.refundedCents)}</Text>}
        <TextAction icon={details ? ChevronUp : ChevronDown} label={details ? 'Ocultar protocolo' : 'Ver protocolo'} onPress={() => setDetails(!details)} />
        {details && <Text selectable style={{ color: colors.muted, fontSize: 13 }}>{intent.id}</Text>}
      </>}
      {!!error && <><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text><Button secondary label="Consultar novamente" onPress={() => { if (token) void load(token, current.current); }} /></>}
    </>}
  </Panel>;
}
