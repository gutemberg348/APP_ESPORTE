import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import type { PixIntent, BillingProfile } from '@nacional/shared/types';
import { Text, TextInput } from './Typography';
import { Button, Panel } from './ui';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { pixApi } from '../services/pix';
import { messageOf, money } from '../utils/format';
export const pixStates: Record<PixIntent['state'], string> = { QUEUED: 'Preparando seu Pix…', CREATING: 'Gerando cobrança…', PENDING: 'Aguardando pagamento', PROCESSING: 'Pagamento em análise pelo Asaas', RECEIVED: 'Pagamento confirmado', REFUNDING: 'Estorno solicitado · aguardando confirmação', REFUNDED: 'Pagamento estornado', CANCELED: 'Cobrança cancelada', REVIEW: 'Pagamento em conciliação', PARTIAL_REFUND: 'Pagamento parcialmente estornado' };
export function PixCheckout({ ticketId, chargeId, shopOrderId, initialIntentId, onChanged }: { ticketId?: string; chargeId?: string; shopOrderId?: string; initialIntentId?: string | null; onChanged: () => Promise<unknown> }) {
  const { token, demoMode } = useSession(), { colors } = useTheme();
  const [profile, setProfile] = useState<BillingProfile | null>(null), [intent, setIntent] = useState<PixIntent | null>(null), [document, setDocument] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false);
  const current = useRef(0), lock = useRef(false), lastState = useRef(''), callback = useRef(onChanged);
  callback.current = onChanged;
  function accept(value: PixIntent | null) {
    setIntent(value);
    if (value && lastState.current !== value.state && ['RECEIVED', 'REFUNDED', 'PARTIAL_REFUND', 'CANCELED'].includes(value.state)) void callback.current().catch(() => {});
    lastState.current = value?.state || '';
  }
  useEffect(() => {
    const version = ++current.current;
    if (!token || demoMode) return;
    setError('');
    void Promise.all([pixApi.profile(token), ticketId ? pixApi.ticket(token, ticketId) : shopOrderId ? pixApi.shop(token, shopOrderId) : initialIntentId ? pixApi.intent(token, initialIntentId) : Promise.resolve(null)]).then(([fresh, payment]) => { if (current.current === version) { setProfile(fresh); accept(payment); } }).catch((err) => { if (current.current === version) setError(messageOf(err)); });
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
  }, [token, intent?.id, intent?.state]);
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
  if (demoMode || profile?.enabled === false) return null;
  return <Panel style={{ gap: 14, borderColor: colors.primary, borderRadius: 16 }}>
    <Text heading style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>Pagamento Pix</Text>
    {profile?.environment === 'sandbox' && <Text style={{ color: colors.gold, fontSize: 12 }}>Ambiente de testes · Pix sandbox sem dinheiro real.</Text>}
    {!intent && <>
      {!profile?.configured && <><Text style={{ color: colors.muted, fontSize: 13 }}>Informe o CPF ou CNPJ do pagador para gerar a cobrança.</Text><TextInput accessibilityLabel="CPF ou CNPJ do pagador" value={document} onChangeText={setDocument} keyboardType="number-pad" autoComplete="off" maxLength={25} placeholder="CPF ou CNPJ" placeholderTextColor={colors.muted} style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text }} /></>}
      {profile?.configured && <Text style={{ color: colors.muted, fontSize: 12 }}>Documento cadastrado · final {profile.documentLast4}</Text>}
      <Button label="Gerar Pix para pagar" loading={busy} disabled={!profile || (!profile.configured && !document.trim())} onPress={() => void generate()} />
    </>}
    {intent && <>
      <Text accessibilityRole="alert" style={{ color: intent.state === 'RECEIVED' ? colors.primary : colors.gold, fontWeight: '700' }}>{pixStates[intent.state]}</Text>
      <Text style={{ color: colors.text }}>{money(intent.amountCents)}</Text>
      {intent.pixPayload && <><View style={{ alignSelf: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 12 }}><QRCode value={intent.pixPayload} size={190} color="#111111" backgroundColor="#ffffff" /></View><Text style={{ color: colors.muted, fontSize: 13 }}>Leia com o app do seu banco ou use Pix Copia e Cola.</Text><Button label={copied ? 'Pix copiado' : 'Copiar Pix'} onPress={() => void Clipboard.setStringAsync(intent.pixPayload!).then(() => setCopied(true)).catch(() => setError('Não foi possível copiar o Pix.'))} /><Text selectable numberOfLines={3} style={{ color: colors.muted, fontSize: 10 }}>{intent.pixPayload}</Text></>}
      {intent.state === 'RECEIVED' ? <Text style={{ color: colors.primary, fontSize: 13 }}>{ticketId ? 'Seu ingresso foi emitido automaticamente. Ele está em Meus ingressos.' : shopOrderId ? 'Pagamento confirmado. Acompanhe a preparação e entrega em Meus pedidos.' : 'Recebimento e divisão confirmados. Confira o cashback no extrato.'}</Text> : <Text style={{ color: colors.muted, fontSize: 12 }}>A tela consulta a confirmação automaticamente. Prazo da reserva: {new Date(intent.expiresAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })} (Patos). Não pague após esse horário.</Text>}
      {intent.refundedCents > 0 && <Text style={{ color: colors.muted, fontSize: 13 }}>Estorno confirmado: {money(intent.refundedCents)}</Text>}
      {intent.state === 'REVIEW' && <Text style={{ color: colors.muted, fontSize: 12 }}>Estamos conferindo a cobrança no provedor. Não gere outro pagamento. Se persistir, informe o protocolo ao atendimento.</Text>}
      <Text selectable style={{ color: colors.muted, fontSize: 10 }}>Protocolo do pagamento: {intent.id}</Text>
    </>}
    {!!error && <><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text><Button secondary label="Consultar novamente" onPress={() => { if (token) void (intent ? pixApi.intent(token, intent.id).then(accept) : pixApi.profile(token).then(setProfile)).catch((err) => setError(messageOf(err))); }} /></>}
  </Panel>;
}
